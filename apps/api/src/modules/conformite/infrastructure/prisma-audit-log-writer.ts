// T062 — PrismaAuditLogWriter adapter.
// Implémente AuditLogWriter via Prisma + validation Zod du payload.
//
// Garanties enforced :
//   1. Le payload est validé contre le Zod schema correspondant à
//      eventType (T046). Lève si non conforme.
//   2. Si actorRole === 'admin' alors actorId DOIT être non null
//      (T081c — traçabilité opérationnelle FR-018 / U3 du review).
//   3. Aucune clé PII directe dans le payload (R10 — vérifié à la
//      fois par les schemas T046 .strict() et par cette validation
//      runtime défense en profondeur).

import { type Prisma, prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import { validateAuditPayload } from '../application/audit/payload-schemas';
import type {
  AuditEntryToCreate,
  AuditLogWriter,
} from '../application/ports/audit-log-writer.port';
import type { AuditEventType } from '../domain/entities/audit-entry.entity';

/** R10 / B5 — clés interdites dans tout payload d'audit (PII directe). */
export const FORBIDDEN_AUDIT_PAYLOAD_KEYS = new Set<string>([
  'email',
  'emailAddress',
  'mail',
  'phone',
  'phoneNumber',
  'telephone',
  'firstName',
  'lastName',
  'fullName',
  'address',
  'street',
  'postalCode',
  'zipCode',
]);

/** Erreur lancée si le payload contient une clé PII interdite. */
export class ForbiddenAuditPayloadKeyError extends Error {
  constructor(public readonly key: string) {
    super(`Forbidden PII key "${key}" in audit payload (R10 / B5).`);
    this.name = 'ForbiddenAuditPayloadKeyError';
  }
}

/** Erreur lancée si actorRole='admin' sans actorId (FR-018 / U3). */
export class MissingAdminActorIdError extends Error {
  constructor() {
    super("AuditEntry with actorRole='admin' must have a non-null actorId (FR-018).");
    this.name = 'MissingAdminActorIdError';
  }
}

/**
 * T063 — Vérification récursive : aucune clé PII directe (R10).
 * Pure : testable sans Prisma.
 */
export function assertNoForbiddenAuditKeys(payload: unknown): void {
  if (typeof payload !== 'object' || payload === null) return;
  for (const key of Object.keys(payload as Record<string, unknown>)) {
    if (FORBIDDEN_AUDIT_PAYLOAD_KEYS.has(key)) {
      throw new ForbiddenAuditPayloadKeyError(key);
    }
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === 'object' && value !== null) {
      assertNoForbiddenAuditKeys(value);
    }
  }
}

/**
 * T081c — Attribution admin nominative obligatoire (FR-018).
 * Pure : testable sans Prisma.
 */
export function assertAdminAttribution(entry: AuditEntryToCreate): void {
  if (entry.actorRole === 'admin' && entry.actorId === null) {
    throw new MissingAdminActorIdError();
  }
}

@Injectable()
export class PrismaAuditLogWriter implements AuditLogWriter {
  async write(entry: AuditEntryToCreate): Promise<void> {
    assertNoForbiddenAuditKeys(entry.payload);
    assertAdminAttribution(entry);
    validateAuditPayload(entry.eventType as AuditEventType, entry.payload);

    await prisma.auditEntry.create({
      data: {
        conseillerComplianceId: entry.conseillerComplianceId,
        eventType: entry.eventType,
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        payload: entry.payload as Prisma.InputJsonValue,
        idempotencyKey: entry.idempotencyKey,
        correlationId: entry.correlationId,
      },
    });
  }
}
