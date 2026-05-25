// T063 + T081c — Tests invariant du PrismaAuditLogWriter.
//
// T063 : aucune clé PII directe acceptée dans le payload (R10 / B5).
// T081c : actorRole='admin' DOIT être accompagné d'un actorId non null
//         (traçabilité admin nominative — FR-018 / U3 du review).
//
// Ces tests visent les fonctions pures exportées du module — pas
// d'I/O Prisma requise.

import { AdminIdSchema, ConseillerComplianceIdSchema } from '@cv/shared/conformite';
import { describe, expect, it } from 'vitest';
import type { AuditEntryToCreate } from '../../application/ports/audit-log-writer.port';
import {
  FORBIDDEN_AUDIT_PAYLOAD_KEYS,
  ForbiddenAuditPayloadKeyError,
  MissingAdminActorIdError,
  assertAdminAttribution,
  assertNoForbiddenAuditKeys,
} from '../prisma-audit-log-writer';

const COMPLIANCE_ID = ConseillerComplianceIdSchema.parse('00000000-0000-4000-8000-000000000001');
const ADMIN_ID = AdminIdSchema.parse('00000000-0000-4000-8000-000000000aaa');

function makeEntry(overrides: Partial<AuditEntryToCreate> = {}): AuditEntryToCreate {
  return {
    conseillerComplianceId: COMPLIANCE_ID,
    eventType: 'dossier.submitted',
    actorId: ADMIN_ID,
    actorRole: 'admin',
    payload: {
      submissionId: '00000000-0000-4000-8000-000000000801',
      certificateCount: 1,
      affiliationCount: 1,
    },
    idempotencyKey: null,
    correlationId: null,
    ...overrides,
  };
}

describe('assertNoForbiddenAuditKeys (T063 / R10)', () => {
  it('ne lève PAS pour un payload propre (UUIDs + compteurs + enums)', () => {
    expect(() =>
      assertNoForbiddenAuditKeys({
        submissionId: '00000000-0000-4000-8000-000000000801',
        certificateCount: 2,
        affiliationCount: 1,
        previousStatus: 'pending',
        newStatus: 'verified',
      }),
    ).not.toThrow();
  });

  it('lève pour email au premier niveau', () => {
    expect(() => assertNoForbiddenAuditKeys({ email: 'user@example.com' })).toThrow(
      ForbiddenAuditPayloadKeyError,
    );
  });

  it.each([...FORBIDDEN_AUDIT_PAYLOAD_KEYS])('lève pour la clé interdite "%s"', (key) => {
    expect(() => assertNoForbiddenAuditKeys({ [key]: 'sensitive' })).toThrow(
      ForbiddenAuditPayloadKeyError,
    );
  });

  it('lève pour clé interdite imbriquée (niveau 2)', () => {
    expect(() =>
      assertNoForbiddenAuditKeys({
        admin: { email: 'admin@example.com' },
      }),
    ).toThrow(ForbiddenAuditPayloadKeyError);
  });

  it('lève pour clé interdite imbriquée (niveau 3)', () => {
    expect(() =>
      assertNoForbiddenAuditKeys({
        review: { decidedBy: { firstName: 'Marie' } },
      }),
    ).toThrow(/firstName/);
  });

  it("ne lève pas pour 'name' utilisé pour agency (commerciale, pas personne)", () => {
    // Note : 'name' SEUL n'est PAS dans la liste interdite — seul firstName,
    // lastName, fullName le sont. C'est intentionnel : 'name' au sens
    // "agency name" est une entité commerciale, pas une PII de personne.
    expect(() => assertNoForbiddenAuditKeys({ agencyName: 'Agence X' })).not.toThrow();
  });

  it('retourne sans erreur pour null/undefined/primitives', () => {
    expect(() => assertNoForbiddenAuditKeys(null)).not.toThrow();
    expect(() => assertNoForbiddenAuditKeys(undefined)).not.toThrow();
    expect(() => assertNoForbiddenAuditKeys('plain string')).not.toThrow();
    expect(() => assertNoForbiddenAuditKeys(42)).not.toThrow();
  });
});

describe('assertAdminAttribution (T081c / FR-018)', () => {
  it("ne lève pas pour actorRole='admin' avec actorId non-null", () => {
    expect(() => assertAdminAttribution(makeEntry())).not.toThrow();
  });

  it("LÈVE pour actorRole='admin' avec actorId=null", () => {
    expect(() => assertAdminAttribution(makeEntry({ actorId: null }))).toThrow(
      MissingAdminActorIdError,
    );
  });

  it("ne lève pas pour actorRole='conseiller' avec actorId=null", () => {
    expect(() =>
      assertAdminAttribution(makeEntry({ actorRole: 'conseiller', actorId: null })),
    ).not.toThrow();
  });

  it("ne lève pas pour actorRole='system' avec actorId=null (events automatiques)", () => {
    expect(() =>
      assertAdminAttribution(makeEntry({ actorRole: 'system', actorId: null })),
    ).not.toThrow();
  });
});
