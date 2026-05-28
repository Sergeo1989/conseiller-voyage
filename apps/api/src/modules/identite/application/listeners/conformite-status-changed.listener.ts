// T061 — Listener cross-module ConformiteStatusChangedEvent (feature 007).
//
// Souscrit via ConformiteEventPublisher.subscribe (Redis pub/sub) côté
// conformité. Logique métier :
//   - `previousStatus=pending && newStatus=verified` (1re vérif) →
//     crée ConseillerProfile si inexistant (statut incomplet) + planifie
//     les 3 relances onboarding J+3/J+7/J+14 (FR-021).
//   - `transitionKind=negative` (verified → expired/revoked/suspended) →
//     recalcule statut profil + invalidation Next.js + CloudFront.
//   - `expired → verified` (re-vérification) → page publique redevient
//     accessible. PAS de relances re-déclenchées (edge case spec).
//
// Idempotent : check existence profil avant create + jobId déterministe
// pour les relances.

import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  CONFORMITE_EVENT_PUBLISHER,
  type ConformiteDomainEvent,
  type ConformiteEventPublisher,
} from '../../../conformite/application/ports/conformite-event-publisher.port';
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

@Injectable()
export class ConformiteStatusChangedListener implements OnModuleInit {
  private readonly logger = new Logger('ConformiteStatusChangedListener');

  constructor(
    @Inject(CONFORMITE_EVENT_PUBLISHER)
    private readonly publisher: ConformiteEventPublisher,
    @Inject(PROFIL_CONSEILLER_REPOSITORY)
    private readonly profilRepo: ProfilConseillerRepository,
    @Inject(ONBOARDING_RELANCE_SCHEDULER)
    private readonly scheduler: OnboardingRelanceScheduler,
    @Inject(CLOUDFRONT_CACHE_INVALIDATOR)
    private readonly cdnInvalidator: CloudFrontCacheInvalidator,
  ) {}

  onModuleInit(): void {
    this.publisher.subscribe((event) => this.handle(event));
    this.logger.log('Subscribed to ConformiteStatusChangedEvent (feature 007)');
  }

  private async handle(event: ConformiteDomainEvent): Promise<void> {
    if (event.type !== 'conformite.status.changed') return;

    try {
      if (event.previousStatus === 'pending' && event.newStatus === 'verified') {
        await this.onFirstVerification(event.conseillerId, event.occurredAt);
      } else if (event.transitionKind === 'negative') {
        await this.onNegativeTransition(event.conseillerId);
      } else if (event.newStatus === 'verified') {
        await this.onReVerification(event.conseillerId);
      }
    } catch (err) {
      this.logger.error(
        {
          err,
          conseillerId: event.conseillerId,
          transition: `${event.previousStatus} → ${event.newStatus}`,
        },
        'Listener failed to process conformite event',
      );
    }
  }

  /**
   * Première vérification : `pending → verified`. Crée le profil vierge
   * + planifie les relances onboarding (FR-021).
   * Idempotent : si le profil existe déjà (re-trigger d'event), no-op.
   */
  private async onFirstVerification(conseillerId: string, verifiedAt: Date): Promise<void> {
    const existant = await this.profilRepo.findByAuthUserId(conseillerId);
    if (!existant) {
      const profil = await this.profilRepo.create({ authUserId: conseillerId });
      await this.scheduler.planifierRelances({ profileId: profil.id, verifiedAt });
      this.logger.log(
        `Profil créé + relances onboarding planifiées : conseillerId=${conseillerId}`,
      );
    } else if (existant.statut === 'incomplet') {
      // Le profil existe déjà — re-déclenchement d'event. On re-planifie les
      // relances si encore pertinent (BullMQ jobId déterministe = idempotent).
      await this.scheduler.planifierRelances({ profileId: existant.id, verifiedAt });
    }
    // Sinon (statut prêt / masqué / anonymisé) : no-op.
  }

  /**
   * Transition négative : verified → expired/revoked/suspended.
   * Le statut profil reste piloté par la conformité — si le profil était
   * 'pret', il devient 'incomplet' effectif (page publique 404 ≤ 10 s).
   * Pour MVP : on invalide les caches. Le port `EstProfilPublic` re-checke
   * la conformité à chaque appel donc le filtrage est fail-safe.
   */
  private async onNegativeTransition(conseillerId: string): Promise<void> {
    const profil = await this.profilRepo.findByAuthUserId(conseillerId);
    if (!profil || !profil.slug) return;
    await this.cdnInvalidator
      .invalidatePaths([`/fr/conseiller/${profil.slug}`, `/en/conseiller/${profil.slug}`])
      .catch((err) => {
        this.logger.warn(
          { err, slug: profil.slug },
          'CloudFront invalidation failed on negative transition — s-maxage=300 fallback',
        );
      });
  }

  /**
   * Re-vérification : suspended/expired → verified. Le profil redevient
   * accessible (si statut était 'pret' avant). Pas de relances FR-021
   * ré-émises (edge case spec : déclencheur unique = 1re transition).
   */
  private async onReVerification(conseillerId: string): Promise<void> {
    const profil = await this.profilRepo.findByAuthUserId(conseillerId);
    if (!profil || !profil.slug) return;
    await this.cdnInvalidator
      .invalidatePaths([`/fr/conseiller/${profil.slug}`, `/en/conseiller/${profil.slug}`])
      .catch((err) => {
        this.logger.warn(
          { err, slug: profil.slug },
          'CloudFront invalidation failed on re-verification',
        );
      });
  }
}
