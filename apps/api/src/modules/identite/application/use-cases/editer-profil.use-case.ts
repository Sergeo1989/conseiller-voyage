// T058 — EditerProfilUseCase (feature 007 US1).
//
// Édition partielle du profil avec :
//   - Validation Zod (DTO partagé profil-domain)
//   - Ownership check (le conseiller ne peut éditer que son propre profil)
//   - Vérification statut 'anonymise' (refus FR-005)
//   - UPDATE champs + recalcul statut effectif
//   - Si transition incomplet → pret (premier passage) :
//     * Génération slug `prenom-nom` unique (genererSlugUnique)
//     * publishedAt = NOW
//     * Annulation relances onboarding
//     * Invalidations cache (Next.js + CloudFront)
//   - Audit immutable
//
// Retourne `Result<EditerProfilSuccess, EditerProfilError>` — pas d'exceptions
// pour les erreurs métier (cf. profil-edition.port.md).

import { prisma } from '@cv/db';
import {
  type Result,
  SlugDisambiguationExhaustedError,
  calculerStatutProfil,
  err,
  genererSlugUnique,
  ok,
  profilEstComplet,
} from '@cv/profil-domain';
import { EditerProfilDto } from '@cv/profil-domain/dtos';
import { CONFORMITE_QUERY_PORT, type ConformiteQueryPort } from '@cv/shared/conformite';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUTH_AUDIT_WRITER, type AuthAuditWriter } from '../ports/auth-audit-writer.port';
import {
  AUTH_USER_LEGAL_NAME_READER,
  type AuthUserLegalNameReader,
} from '../ports/auth-user-legal-name-reader.port';
import {
  CLOUDFRONT_CACHE_INVALIDATOR,
  type CloudFrontCacheInvalidator,
} from '../ports/cloudfront-cache-invalidator.port';
import {
  ONBOARDING_RELANCE_SCHEDULER,
  type OnboardingRelanceScheduler,
} from '../ports/onboarding-relance-scheduler.port';
import {
  PROFIL_CONSEILLER_REPOSITORY,
  type ProfilConseillerRepository,
} from '../ports/profil-conseiller-repository.port';
import {
  SLUG_RESERVATION_REPOSITORY,
  type SlugReservationRepository,
} from '../ports/slug-reservation-repository.port';

export interface EditerProfilInput {
  readonly authUserId: string; // vérifié RoleGuard upstream
  readonly titre?: string | null;
  readonly biographie?: string | null;
  readonly specialitesCodes?: readonly string[];
  readonly languesCodes?: readonly string[];
  readonly zonesGeographiquesCodes?: readonly string[];
  readonly anneesExperience?: number | null;
  readonly afficherNomComplet?: boolean;
  readonly actorIp?: string | null;
}

export interface EditerProfilSuccess {
  readonly profilId: string;
  readonly statut: 'incomplet' | 'pret' | 'masque_admin';
  readonly champsManquants: readonly string[];
  readonly publishedAt: string | null;
  readonly slug: string | null;
}

export type EditerProfilError =
  | { kind: 'PROFIL_ANONYMISE' }
  | { kind: 'PROFIL_NOT_FOUND' }
  | { kind: 'VALIDATION_FAILED'; champ: string; messageFr: string }
  | { kind: 'OWNERSHIP_MISMATCH' }
  | { kind: 'CONFORMITE_INDISPONIBLE' }
  | { kind: 'SLUG_GENERATION_FAILED' };

@Injectable()
export class EditerProfilUseCase {
  private readonly logger = new Logger('EditerProfilUseCase');

  constructor(
    @Inject(PROFIL_CONSEILLER_REPOSITORY)
    private readonly repo: ProfilConseillerRepository,
    @Inject(SLUG_RESERVATION_REPOSITORY)
    private readonly slugReservation: SlugReservationRepository,
    @Inject(AUTH_USER_LEGAL_NAME_READER)
    private readonly legalName: AuthUserLegalNameReader,
    @Inject(CONFORMITE_QUERY_PORT)
    private readonly conformite: ConformiteQueryPort,
    @Inject(ONBOARDING_RELANCE_SCHEDULER)
    private readonly relanceScheduler: OnboardingRelanceScheduler,
    @Inject(CLOUDFRONT_CACHE_INVALIDATOR)
    private readonly cdnInvalidator: CloudFrontCacheInvalidator,
    @Inject(AUTH_AUDIT_WRITER)
    private readonly audit: AuthAuditWriter,
  ) {}

  async execute(input: EditerProfilInput): Promise<Result<EditerProfilSuccess, EditerProfilError>> {
    const validation = EditerProfilDto.safeParse(this.buildValidationInput(input));
    if (!validation.success) return this.toValidationError(validation);

    const profil = await this.repo.findByAuthUserId(input.authUserId);
    if (!profil) return err({ kind: 'PROFIL_NOT_FOUND' as const });
    if (profil.statut === 'anonymise') return err({ kind: 'PROFIL_ANONYMISE' as const });

    return this.applyEdition(input, profil);
  }

  private async applyEdition(
    input: EditerProfilInput,
    profil: { id: string; statut: string },
  ): Promise<Result<EditerProfilSuccess, EditerProfilError>> {
    const updated = await this.repo.update(this.buildUpdateInput(profil.id, input));
    const conformiteResult = await this.lireConformite(input.authUserId);
    if (!conformiteResult.ok) return conformiteResult;

    const nouveauStatut = this.computeStatut(updated, conformiteResult.value);
    const transition = await this.appliquerTransition(input.authUserId, updated, nouveauStatut);
    if (!transition.ok) return transition;

    if (transition.value.slug) {
      await this.invalidateCaches(transition.value.slug);
    }

    await this.audit.append({
      eventType: 'signup',
      actorUserId: input.authUserId,
      targetUserId: input.authUserId,
      actorIp: input.actorIp ?? null,
      metadata: {
        action: 'profil.edite',
        statutAvant: profil.statut,
        statutApres: nouveauStatut,
        firstPublish: transition.value.firstPublish,
      },
    });

    const statutOk = nouveauStatut as 'incomplet' | 'pret' | 'masque_admin';
    const publishedAtIso = transition.value.publishedAt
      ? transition.value.publishedAt.toISOString()
      : null;
    return ok({
      profilId: updated.id,
      statut: statutOk,
      champsManquants: statutOk === 'pret' ? [] : ['champs incomplets'],
      publishedAt: publishedAtIso,
      slug: transition.value.slug,
    });
  }

  private toValidationError(validation: {
    error: { issues: { path: (string | number)[]; message: string }[] };
  }): Result<never, EditerProfilError> {
    const issue = validation.error.issues[0];
    return err({
      kind: 'VALIDATION_FAILED' as const,
      champ: issue?.path.join('.') ?? 'unknown',
      messageFr: issue?.message ?? 'Validation échouée',
    });
  }

  private buildValidationInput(input: EditerProfilInput): Record<string, unknown> {
    return {
      titre: input.titre,
      biographie: input.biographie,
      specialitesCodes: input.specialitesCodes,
      languesCodes: input.languesCodes,
      zonesGeographiquesCodes: input.zonesGeographiquesCodes,
      anneesExperience: input.anneesExperience,
      afficherNomComplet: input.afficherNomComplet,
    };
  }

  private buildUpdateInput(
    id: string,
    input: EditerProfilInput,
  ): Parameters<ProfilConseillerRepository['update']>[0] {
    return {
      id,
      ...(input.titre !== undefined && { titre: input.titre }),
      ...(input.biographie !== undefined && { biographie: input.biographie }),
      ...(input.anneesExperience !== undefined && { anneesExperience: input.anneesExperience }),
      ...(input.afficherNomComplet !== undefined && {
        afficherNomComplet: input.afficherNomComplet,
      }),
      ...(input.specialitesCodes !== undefined && { specialitesCodes: input.specialitesCodes }),
      ...(input.languesCodes !== undefined && { languesCodes: input.languesCodes }),
      ...(input.zonesGeographiquesCodes !== undefined && {
        zonesGeographiquesCodes: input.zonesGeographiquesCodes,
      }),
    };
  }

  private async lireConformite(authUserId: string): Promise<Result<boolean, EditerProfilError>> {
    try {
      const status = await this.conformite.getVerificationStatus({
        conseillerId: authUserId,
        strict: false,
      });
      return ok(status.verified);
    } catch (e) {
      this.logger.error({ err: e, authUserId }, 'Conformité indisponible');
      return err({ kind: 'CONFORMITE_INDISPONIBLE' as const });
    }
  }

  private computeStatut(
    updated: {
      titre: string | null;
      biographie: string | null;
      specialitesCodes: readonly string[];
      languesCodes: readonly string[];
      zonesGeographiquesCodes: readonly string[];
      anneesExperience: number | null;
      photoS3Key: string | null;
      statut: string;
    },
    conformiteVerified: boolean,
  ): 'incomplet' | 'pret' | 'masque_admin' | 'anonymise' {
    const complet = profilEstComplet({
      titre: updated.titre,
      biographie: updated.biographie,
      specialitesCount: updated.specialitesCodes.length,
      languesCount: updated.languesCodes.length,
      zonesGeographiquesCount: updated.zonesGeographiquesCodes.length,
      anneesExperience: updated.anneesExperience,
      photoS3Key: updated.photoS3Key,
    });
    return calculerStatutProfil({
      verifie: conformiteVerified,
      profilComplet: complet,
      masqueAdmin: updated.statut === 'masque_admin',
      anonymise: false,
    });
  }

  private async appliquerTransition(
    authUserId: string,
    updated: { id: string; slug: string | null; publishedAt: Date | null; statut: string },
    nouveauStatut: string,
  ): Promise<
    Result<
      { slug: string | null; publishedAt: Date | null; firstPublish: boolean },
      EditerProfilError
    >
  > {
    const firstPublish = nouveauStatut === 'pret' && updated.publishedAt === null;
    if (firstPublish) {
      const slugResult = await this.genererSlug(authUserId);
      if (!slugResult.ok) return slugResult;
      const publishedAt = new Date();
      await this.repo.publish({ id: updated.id, slug: slugResult.value, publishedAt });
      await this.relanceScheduler.annulerRelances(updated.id);
      return ok({ slug: slugResult.value, publishedAt, firstPublish: true });
    }
    if (nouveauStatut !== updated.statut && nouveauStatut !== 'anonymise') {
      await this.repo.updateStatut({
        id: updated.id,
        statut: nouveauStatut as 'incomplet' | 'pret' | 'masque_admin',
      });
    }
    return ok({ slug: updated.slug, publishedAt: updated.publishedAt, firstPublish: false });
  }

  private async genererSlug(authUserId: string): Promise<Result<string, EditerProfilError>> {
    const nomLegal = await this.legalName.lireNomLegal(authUserId);
    if (!nomLegal) {
      this.logger.error({ authUserId }, 'Nom légal indisponible pour génération slug');
      return err({ kind: 'CONFORMITE_INDISPONIBLE' as const });
    }
    // Lecture du registre des slugs réservés + des slugs déjà attribués.
    const slugReserve = await this.slugReservation.listAll();
    const slugExistants = await prisma.conseillerProfile.findMany({
      where: { slug: { not: null } },
      select: { slug: true },
    });
    const slugExistant = new Set(
      slugExistants.map((s) => s.slug).filter((s): s is string => s !== null),
    );

    try {
      const slug = genererSlugUnique(nomLegal.prenomLegal, nomLegal.nomLegal, {
        slugExistant,
        slugReserve,
      });
      return ok(slug);
    } catch (e) {
      if (e instanceof SlugDisambiguationExhaustedError) {
        this.logger.error({ authUserId, err: e.message }, 'Slug disambiguation exhausted');
        return err({ kind: 'SLUG_GENERATION_FAILED' as const });
      }
      throw e;
    }
  }

  private async invalidateCaches(slug: string): Promise<void> {
    // Cf. R4 + C2 : double invalidation Next.js + CloudFront.
    try {
      await this.cdnInvalidator.invalidatePaths([
        `/fr/conseiller/${slug}`,
        `/en/conseiller/${slug}`,
      ]);
    } catch (e) {
      this.logger.warn({ slug, err: (e as Error).message }, 'CloudFront invalidation failed');
    }
    // Next.js revalidatePath sera appelé via le listener event côté apps/web
    // (à venir dans la Phase 4 US2). Pour MVP, le filet s-maxage=300 borne
    // la fenêtre dégradée.
  }
}
