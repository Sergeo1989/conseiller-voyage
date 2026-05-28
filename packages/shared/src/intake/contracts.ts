// T021 — Contrat IntakeQueryPort exposé aux autres modules.
//
// Le module consommateur principal sera la feature matching (ID roadmap 011,
// future). Elle DOIT importer uniquement ce contrat — jamais les types
// internes du module intake. `tools/check-module-boundaries.ts` (001
// reflète) le valide.
//
// Pattern hérité de packages/shared/src/conformite/contracts.ts.

import type { BriefStatus, ConseillerLanguage, TravelBudget, TravelSpeciality } from './schemas';

/**
 * Résumé d'un brief actif, sérialisable, sans PII directe (l'email
 * `voyageurContactId` reste opaque côté consommateur). Ce DTO est le
 * payload de l'événement outbox `voyageur.brief.activated` et la sortie
 * de `listActiveBriefsByEmail` (US3).
 */
export interface BriefSummary {
  readonly briefId: string;
  readonly voyageurContactId: string;
  readonly status: BriefStatus;
  readonly submittedAt: string; // ISO 8601
  readonly verifiedAt: string | null;
  readonly expiresAt: string; // ISO 8601 (submittedAt + 90j)
  readonly destinations: ReadonlyArray<{ country: string; region?: string }>;
  readonly departureDate: string; // ISO date
  readonly returnDate: string;
  readonly datesFlexible: boolean;
  readonly datesFlexibilityDays: number | null;
  readonly adultsCount: number;
  readonly childrenAges: ReadonlyArray<number>;
  readonly infantsCount: number;
  readonly budgetRange: TravelBudget;
  readonly conseillerLanguage: ConseillerLanguage;
  readonly conseillerLanguageOther: string | null;
  readonly speciality: TravelSpeciality;
  readonly specialityOther: string | null;
  readonly familiarity: 'first_big_trip' | 'occasional_traveler' | 'experienced_traveler';
}

/**
 * Token DI (NestJS) pour le port. Symbol global (Symbol.for) — la même
 * valeur référencée depuis n'importe quel module donne la même identité.
 * Utilisé pour `@Inject(INTAKE_QUERY_PORT)` côté apps/api.
 */
export const INTAKE_QUERY_PORT = Symbol.for('IntakeQueryPort');

export interface IntakeQueryPort {
  /**
   * Liste les briefs actifs pour une adresse email donnée — exclut les
   * briefs `pending_verification`, `expired`, `expired_unverified`,
   * `deleted`, `anonymized`. Utilisé par la feature matching (011) au
   * moment de la sélection des conseillers ; consommée aussi pour la
   * page « Voir mes autres briefs » (FR-017) côté Web via la facade
   * équivalente Web (`apiClient.briefs.byEmail`).
   */
  listActiveBriefsByEmail(args: { readonly email: string }): Promise<ReadonlyArray<BriefSummary>>;

  /**
   * Lit le résumé d'un brief par son identifiant. Retourne `null` si
   * inconnu ou anonymisé Loi 25 (FR-023).
   */
  findBriefSummaryById(args: { readonly briefId: string }): Promise<BriefSummary | null>;
}
