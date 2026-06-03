// T019 — Mapping nom événement DB (enum snake_case) ⇄ nom event bus (kebab-case).
//
// La table `matching_outbox_entries.eventType` stocke les enums en snake_case
// Postgres natif (`voyageur_brief_matched`). Le bus interne (BullMQ / Loki
// span name / dashboards Grafana) attend des noms kebab-case stables
// (`voyageur.brief.matched`).
//
// Centralise les 4 paires pour éviter la drift entre l'enum DB et les noms
// d'event bus consommés par les modules clients (012 notifications futur,
// extension US5 admin 008).

import { z } from 'zod';

/**
 * Valeurs du enum Postgres `MatchingOutboxEventType`.
 * Doit rester aligné avec `packages/db/prisma/schema/matching.prisma`.
 */
export const MATCHING_OUTBOX_EVENT_TYPE = [
  'voyageur_brief_matched',
  'voyageur_brief_partially_matched',
  'voyageur_brief_unmatched',
  'voyageur_brief_all_matches_revoked',
] as const;

export type MatchingOutboxEventTypeEnum = (typeof MATCHING_OUTBOX_EVENT_TYPE)[number];

export const MatchingOutboxEventTypeEnumSchema = z.enum(MATCHING_OUTBOX_EVENT_TYPE);

/**
 * Noms event bus kebab-case (utilisés par BullMQ topic, OTel span name,
 * dashboards Grafana, consumers 012 + US5 admin 008).
 */
export const MATCHING_EVENT_BUS_NAMES = [
  'voyageur.brief.matched',
  'voyageur.brief.partially_matched',
  'voyageur.brief.unmatched',
  'voyageur.brief.all_matches_revoked',
] as const;

export type MatchingEventBusName = (typeof MATCHING_EVENT_BUS_NAMES)[number];

// ---------------------------------------------------------------------------
// Conversion bidirectionnelle
// ---------------------------------------------------------------------------

const ENUM_TO_BUS: Readonly<Record<MatchingOutboxEventTypeEnum, MatchingEventBusName>> = {
  voyageur_brief_matched: 'voyageur.brief.matched',
  voyageur_brief_partially_matched: 'voyageur.brief.partially_matched',
  voyageur_brief_unmatched: 'voyageur.brief.unmatched',
  voyageur_brief_all_matches_revoked: 'voyageur.brief.all_matches_revoked',
};

const BUS_TO_ENUM: Readonly<Record<MatchingEventBusName, MatchingOutboxEventTypeEnum>> = {
  'voyageur.brief.matched': 'voyageur_brief_matched',
  'voyageur.brief.partially_matched': 'voyageur_brief_partially_matched',
  'voyageur.brief.unmatched': 'voyageur_brief_unmatched',
  'voyageur.brief.all_matches_revoked': 'voyageur_brief_all_matches_revoked',
};

export function toEventBusName(enumValue: MatchingOutboxEventTypeEnum): MatchingEventBusName {
  return ENUM_TO_BUS[enumValue];
}

export function fromEventBusName(busName: MatchingEventBusName): MatchingOutboxEventTypeEnum {
  return BUS_TO_ENUM[busName];
}

/**
 * Garde-fou de type pour les consommateurs externes — exit si valeur inconnue.
 * À utiliser à la frontière (lecture event bus, parsing payload).
 */
export function assertMatchingEventBusName(value: string): MatchingEventBusName {
  if (value in BUS_TO_ENUM) return value as MatchingEventBusName;
  throw new Error(`Unknown matching event bus name: "${value}"`);
}
