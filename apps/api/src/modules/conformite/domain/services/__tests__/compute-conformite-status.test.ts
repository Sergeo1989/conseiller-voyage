// T032 — Test TDD pour computeConformiteStatus (Principe VI NON-NÉGOCIABLE).
// Écrit AVANT l'implémentation T043 → RED.
//
// Couvre cas nominal + cas d'erreur + edge cases (FR-014 multi-affiliation,
// FR-015 cascade permit, FR-022 transitions négatives).

import { AffiliationIdSchema, CertificatIdSchema } from '@cv/shared/conformite';
import { describe, expect, it } from 'vitest';
import {
  makeAffiliation,
  makeCertificat,
  makePermitRevocation,
  uuid,
} from '../../__tests__/_fixtures';
import { computeConformiteStatus } from '../compute-conformite-status';

const NOW = new Date('2026-05-23T00:00:00Z');

describe('computeConformiteStatus (T032)', () => {
  describe('cas nominal', () => {
    it('retourne pending si aucun certificat ni affiliation', () => {
      expect(
        computeConformiteStatus({
          currentStatus: 'pending',
          certificats: [],
          affiliations: [],
          permitRevocations: [],
          now: NOW,
        }),
      ).toBe('pending');
    });

    it('retourne verified avec cert approuvé non expiré + affiliation active + permit OK', () => {
      expect(
        computeConformiteStatus({
          currentStatus: 'pending',
          certificats: [makeCertificat()],
          affiliations: [makeAffiliation()],
          permitRevocations: [],
          now: NOW,
        }),
      ).toBe('verified');
    });
  });

  describe('transitions négatives (FR-022)', () => {
    it('verified → suspended quand cert expire', () => {
      expect(
        computeConformiteStatus({
          currentStatus: 'verified',
          certificats: [makeCertificat({ expiresAt: new Date('2026-01-01T00:00:00Z') })],
          affiliations: [makeAffiliation()],
          permitRevocations: [],
          now: NOW,
        }),
      ).toBe('suspended');
    });

    it('verified → suspended quand permit révoqué (FR-015)', () => {
      expect(
        computeConformiteStatus({
          currentStatus: 'verified',
          certificats: [makeCertificat()],
          affiliations: [makeAffiliation({ agencyPermitNumber: 'OPC-50001' })],
          permitRevocations: [makePermitRevocation({ agencyPermitNumber: 'OPC-50001' })],
          now: NOW,
        }),
      ).toBe('suspended');
    });

    it('verified → suspended quand affiliation inactivée par conseiller', () => {
      expect(
        computeConformiteStatus({
          currentStatus: 'verified',
          certificats: [makeCertificat()],
          affiliations: [
            makeAffiliation({
              inactivatedAt: new Date('2026-04-01T00:00:00Z'),
              inactivatedBy: 'conseiller',
            }),
          ],
          permitRevocations: [],
          now: NOW,
        }),
      ).toBe('suspended');
    });
  });

  describe("revoked est sticky (état final, voir machine d'état)", () => {
    it('revoked reste revoked même avec cert+affiliation valides', () => {
      expect(
        computeConformiteStatus({
          currentStatus: 'revoked',
          certificats: [makeCertificat()],
          affiliations: [makeAffiliation()],
          permitRevocations: [],
          now: NOW,
        }),
      ).toBe('revoked');
    });
  });

  describe('cas pending (jamais vérifié, doit le rester)', () => {
    it('pending + cert valide mais sans affiliation → reste pending', () => {
      expect(
        computeConformiteStatus({
          currentStatus: 'pending',
          certificats: [makeCertificat()],
          affiliations: [],
          permitRevocations: [],
          now: NOW,
        }),
      ).toBe('pending');
    });

    it('pending + affiliation seule sans certificat → reste pending', () => {
      expect(
        computeConformiteStatus({
          currentStatus: 'pending',
          certificats: [],
          affiliations: [makeAffiliation()],
          permitRevocations: [],
          now: NOW,
        }),
      ).toBe('pending');
    });
  });

  describe('renouvellement (suspended → verified)', () => {
    it('suspended → verified quand nouveau cert valide arrive', () => {
      expect(
        computeConformiteStatus({
          currentStatus: 'suspended',
          certificats: [makeCertificat({ expiresAt: new Date('2027-12-31T00:00:00Z') })],
          affiliations: [makeAffiliation()],
          permitRevocations: [],
          now: NOW,
        }),
      ).toBe('verified');
    });
  });

  describe('multi-cert / multi-affiliation (FR-014, cross-province)', () => {
    it('multi-cert : reste verified si au moins un cert est valide', () => {
      expect(
        computeConformiteStatus({
          currentStatus: 'verified',
          certificats: [
            makeCertificat({
              id: CertificatIdSchema.parse(uuid(110)),
              province: 'QC',
              expiresAt: new Date('2026-01-01T00:00:00Z'), // expiré
            }),
            makeCertificat({
              id: CertificatIdSchema.parse(uuid(111)),
              province: 'ON',
              expiresAt: new Date('2027-01-01T00:00:00Z'), // valide
            }),
          ],
          affiliations: [makeAffiliation()],
          permitRevocations: [],
          now: NOW,
        }),
      ).toBe('verified');
    });

    it('multi-affiliation : reste verified si au moins une affiliation active + permit non révoqué', () => {
      expect(
        computeConformiteStatus({
          currentStatus: 'verified',
          certificats: [makeCertificat()],
          affiliations: [
            makeAffiliation({
              id: AffiliationIdSchema.parse(uuid(210)),
              agencyPermitNumber: 'OPC-50001',
              inactivatedAt: new Date('2026-04-01T00:00:00Z'),
              inactivatedBy: 'permit_revocation',
            }),
            makeAffiliation({
              id: AffiliationIdSchema.parse(uuid(211)),
              agencyPermitNumber: 'OPC-50002', // permit non révoqué
            }),
          ],
          permitRevocations: [makePermitRevocation({ agencyPermitNumber: 'OPC-50001' })],
          now: NOW,
        }),
      ).toBe('verified');
    });
  });

  describe('ignore les certificats / affiliations non éligibles', () => {
    it('ignore les certificats non approuvés (decision !== approved)', () => {
      expect(
        computeConformiteStatus({
          currentStatus: 'pending',
          certificats: [makeCertificat({ decision: 'pending' })],
          affiliations: [makeAffiliation()],
          permitRevocations: [],
          now: NOW,
        }),
      ).toBe('pending');
    });

    it('ignore les certificats supersededBy (renouvelés)', () => {
      const newCertId = CertificatIdSchema.parse(uuid(999));
      expect(
        computeConformiteStatus({
          currentStatus: 'pending',
          certificats: [makeCertificat({ supersededById: newCertId })],
          affiliations: [makeAffiliation()],
          permitRevocations: [],
          now: NOW,
        }),
      ).toBe('pending');
    });

    it('ignore les affiliations non approuvées', () => {
      expect(
        computeConformiteStatus({
          currentStatus: 'pending',
          certificats: [makeCertificat()],
          affiliations: [makeAffiliation({ decision: 'refused' })],
          permitRevocations: [],
          now: NOW,
        }),
      ).toBe('pending');
    });
  });

  describe('frontière de date', () => {
    it('cert qui expire exactement à NOW est considéré expiré', () => {
      expect(
        computeConformiteStatus({
          currentStatus: 'verified',
          certificats: [makeCertificat({ expiresAt: NOW })],
          affiliations: [makeAffiliation()],
          permitRevocations: [],
          now: NOW,
        }),
      ).toBe('suspended');
    });
  });
});
