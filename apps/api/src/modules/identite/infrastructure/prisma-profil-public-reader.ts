// T044 — PrismaProfilPublicReader (feature 007, anti-énumération + R7).
//
// Impl du port ProfilPublicReader (T034). Combine :
//   - lecture conseillerProfile (statut + champs)
//   - lecture slugReservation (anti-réutilisation Loi 25)
//   - vérification conformité via ConformiteQueryPort.getVerificationStatus
//   - construction URL CloudFront publique stable (cf. R2 + M7)
//   - jointure énumérations (labels FR-CA pour l'affichage)
//
// **Anti-énumération SC-003** : retourne `null` pour TOUS les cas
// non-visibles sans distinguer la raison. Toujours exécute le SELECT
// principal (timing constant à ~10 ms près).

import { prisma } from '@cv/db';
import { formaterNomAffiche } from '@cv/profil-domain';
import { CONFORMITE_QUERY_PORT, type ConformiteQueryPort } from '@cv/shared/conformite';
import { Inject, Injectable } from '@nestjs/common';
import { env } from '../../../env';
import type { AuthUserLegalNameReader } from '../application/ports/auth-user-legal-name-reader.port';
import { AUTH_USER_LEGAL_NAME_READER } from '../application/ports/auth-user-legal-name-reader.port';
import type {
  ProfilPublicPayload,
  ProfilPublicReader,
} from '../application/ports/profil-public-reader.port';

@Injectable()
export class PrismaProfilPublicReader implements ProfilPublicReader {
  constructor(
    @Inject(CONFORMITE_QUERY_PORT)
    private readonly conformite: ConformiteQueryPort,
    @Inject(AUTH_USER_LEGAL_NAME_READER)
    private readonly legalName: AuthUserLegalNameReader,
  ) {}

  async lireParSlug(slug: string): Promise<ProfilPublicPayload | null> {
    // 1. Anti-énumération : on lit toujours, on filtre toujours.
    const profil = await prisma.conseillerProfile.findUnique({
      where: { slug },
      select: {
        id: true,
        authUserId: true,
        titre: true,
        biographie: true,
        anneesExperience: true,
        afficherNomComplet: true,
        photoS3Key: true,
        photoWidth: true,
        photoHeight: true,
        slug: true,
        statut: true,
        publishedAt: true,
        specialites: { select: { code: true, labelFr: true } },
        langues: { select: { code: true, labelFr: true } },
        zonesGeographiques: { select: { code: true, labelFr: true } },
      },
    });

    // 2. Slug réservé Loi 25 sans profil actif → null (anti-réutilisation).
    if (!profil) {
      // Pas de profil ; on vérifie quand même si le slug est réservé pour
      // éviter de fuiter le timing différentiel.
      await prisma.slugReservation.findUnique({ where: { slug }, select: { slug: true } });
      return null;
    }

    // 3. Filtrage statut profil : seul 'pret' est exposé.
    if (profil.statut !== 'pret') return null;

    // 4. Filtrage conformité : strict pour les pages publiques (matching
    //    final ou affichage doit être bypass-cache au besoin).
    const conformite = await this.conformite.getVerificationStatus({
      conseillerId: profil.authUserId,
      strict: false,
    });
    if (!conformite.verified) return null;

    // 5. Champs obligatoires présents (defense-in-depth — le statut='pret'
    //    devrait déjà le garantir, mais on protège contre les invariants
    //    DB violés).
    if (
      !profil.biographie ||
      !profil.slug ||
      !profil.publishedAt ||
      !profil.photoS3Key ||
      profil.photoWidth === null ||
      profil.photoHeight === null ||
      profil.anneesExperience === null
    ) {
      return null;
    }

    // 6. Lecture nom légal pour formaterNomAffiche.
    const nomLegal = await this.legalName.lireNomLegal(profil.authUserId);
    if (!nomLegal) return null;
    const nomAffiche = formaterNomAffiche({
      prenomLegal: nomLegal.prenomLegal,
      nomLegal: nomLegal.nomLegal,
      afficherNomComplet: profil.afficherNomComplet,
    });

    // 7. Construction du payload.
    return {
      conseillerId: profil.authUserId,
      slug: profil.slug,
      nomAffiche,
      titre: profil.titre,
      biographie: profil.biographie,
      photoUrlPublique: this.buildPhotoUrl(profil.photoS3Key),
      photoWidth: profil.photoWidth,
      photoHeight: profil.photoHeight,
      specialites: profil.specialites.map((s) => ({ code: s.code, label: s.labelFr })),
      langues: profil.langues.map((l) => ({ code: l.code, label: l.labelFr })),
      zonesGeographiques: profil.zonesGeographiques.map((z) => ({
        code: z.code,
        label: z.labelFr,
      })),
      anneesExperience: profil.anneesExperience,
      verifieOPCTICO: conformite.verified,
      publishedAt: profil.publishedAt,
    };
  }

  async lireSlugsPubliables(): Promise<readonly string[]> {
    // Filtrage côté DB : statut='pret' + slug non-null. La vérification
    // conformité est faite côté caller (sitemap re-vérifie via le port
    // public avant publication finale — overhead acceptable car cache
    // CDN 1h sur sitemap.xml).
    const rows = await prisma.conseillerProfile.findMany({
      where: { statut: 'pret', slug: { not: null } },
      select: { slug: true },
    });
    return rows.map((r) => r.slug ?? '').filter((s) => s.length > 0);
  }

  private buildPhotoUrl(s3Key: string): string {
    // CloudFront OAC sert le bucket S3 sans signature (cacheable browser
    // + CDN long terme, max-age=31536000 immutable — cf. R2 + M7).
    const base = env.CLOUDFRONT_PROFILES_PUBLIC_URL.replace(/\/+$/, '');
    return `${base}/${s3Key}`;
  }
}
