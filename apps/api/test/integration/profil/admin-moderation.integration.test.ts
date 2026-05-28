// T111-T114 — Tests intégration use cases admin modération (feature 007 US6).
//
// Couvre :
//   T111 RetirerPhotoAdminUseCase  → S3 + statut → incomplet + audits
//   T112 MasquerProfilAdminUseCase → statut → masque_admin + raison
//   T113 RetablirProfilAdminUseCase → recalcul via calculerStatutProfil
//   T114 raison < 10 chars refusée pour retirer + masquer
//        (rétablir n'exige PAS de raison ; masquage exige statut ≠ masque_admin)

import { prisma } from '@cv/db';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilCacheInvalidator } from '../../../src/modules/identite/application/listeners/profil-cache-invalidation.listener';
import type { AuthAuditWriter } from '../../../src/modules/identite/application/ports/auth-audit-writer.port';
import { MasquerProfilAdminUseCase } from '../../../src/modules/identite/application/use-cases/masquer-profil-admin.use-case';
import { RetablirProfilAdminUseCase } from '../../../src/modules/identite/application/use-cases/retablir-profil-admin.use-case';
import { RetirerPhotoAdminUseCase } from '../../../src/modules/identite/application/use-cases/retirer-photo-admin.use-case';
import { PrismaPhotoHistoriqueRepository } from '../../../src/modules/identite/infrastructure/prisma-photo-historique-repository';
import { PrismaProfilConseillerRepository } from '../../../src/modules/identite/infrastructure/prisma-profil-conseiller-repository';
import { PrismaProfilModerationAuditWriter } from '../../../src/modules/identite/infrastructure/prisma-profil-moderation-audit-writer';
import {
  buildTestConformiteQueryPort,
  buildUuid,
  cleanupByUuidPrefix,
  seedAuthUser,
  seedCompliance,
  seedProfil,
} from './_helpers';

const PREFIX = 'b01';
const ADMIN_ID = buildUuid(PREFIX, '99999999');
const ADMIN_EMAIL = 'admin@example.test';
const VALID_REASON = 'Photo inappropriée pour la plateforme — sport extrême';

function buildAudit(): AuthAuditWriter {
  return { append: vi.fn().mockResolvedValue(undefined) };
}

function buildCacheInvalidator(): ProfilCacheInvalidator {
  return new ProfilCacheInvalidator(
    { revalidatePath: vi.fn().mockResolvedValue(undefined) },
    { invalidatePaths: vi.fn().mockResolvedValue(undefined) },
  );
}

function buildRetirerPhoto() {
  const storage = {
    upload: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    listKeysWithPrefix: vi.fn().mockResolvedValue([]),
  };
  const audit = buildAudit();
  const useCase = new RetirerPhotoAdminUseCase(
    new PrismaProfilConseillerRepository(),
    new PrismaPhotoHistoriqueRepository(),
    storage,
    new PrismaProfilModerationAuditWriter(),
    audit,
    buildCacheInvalidator(),
  );
  return { useCase, storage, audit };
}

function buildMasquer() {
  const audit = buildAudit();
  const useCase = new MasquerProfilAdminUseCase(
    new PrismaProfilConseillerRepository(),
    new PrismaProfilModerationAuditWriter(),
    audit,
    buildCacheInvalidator(),
  );
  return { useCase, audit };
}

function buildRetablir() {
  const audit = buildAudit();
  const useCase = new RetablirProfilAdminUseCase(
    new PrismaProfilConseillerRepository(),
    buildTestConformiteQueryPort(),
    new PrismaProfilModerationAuditWriter(),
    audit,
    buildCacheInvalidator(),
  );
  return { useCase, audit };
}

describe('Admin modération (T111-T114)', () => {
  beforeEach(async () => {
    await cleanupByUuidPrefix(PREFIX);
  });

  afterAll(async () => {
    await cleanupByUuidPrefix(PREFIX);
  });

  describe('T111 RetirerPhotoAdminUseCase', () => {
    it('retire photo courante + bascule statut incomplet + audits + S3 delete', async () => {
      const authUserId = buildUuid(PREFIX, '00000010');
      const profilId = buildUuid(PREFIX, '10000010');
      const compId = buildUuid(PREFIX, '20000010');
      await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
      await seedCompliance({ id: compId, conseillerId: authUserId, status: 'verified' });
      await seedProfil({
        id: profilId,
        authUserId,
        statut: 'pret',
        slug: `b01-retirer-${Date.now()}`,
        photoS3Key: 'profiles/before-retrait.jpg',
        photoWidth: 800,
        photoHeight: 800,
      });

      const { useCase, storage, audit } = buildRetirerPhoto();
      const result = await useCase.execute({
        adminAuthUserId: ADMIN_ID,
        adminEmail: ADMIN_EMAIL,
        conseillerProfileId: profilId,
        raison: VALID_REASON,
      });

      expect(result.ok).toBe(true);

      // Profil : photo NULL + statut incomplet
      const after = await prisma.conseillerProfile.findUnique({ where: { id: profilId } });
      expect(after?.photoS3Key).toBeNull();
      expect(after?.photoWidth).toBeNull();
      expect(after?.statut).toBe('incomplet');

      // S3 delete appelé
      expect(storage.delete).toHaveBeenCalledWith('profiles/before-retrait.jpg');

      // Audit modération + auth audit
      const moderationAudits = await prisma.profilModerationAudit.findMany({
        where: { profileId: profilId },
      });
      expect(moderationAudits).toHaveLength(1);
      expect(moderationAudits[0]?.action).toBe('retrait_photo');
      expect(moderationAudits[0]?.raison).toBe(VALID_REASON);
      expect(audit.append).toHaveBeenCalled();
    });

    it('raison < 10 chars → RAISON_TROP_COURTE', async () => {
      const { useCase } = buildRetirerPhoto();
      const result = await useCase.execute({
        adminAuthUserId: ADMIN_ID,
        adminEmail: ADMIN_EMAIL,
        conseillerProfileId: buildUuid(PREFIX, '00000099'),
        raison: 'trop',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('RAISON_TROP_COURTE');
    });

    it('profil sans photo → AUCUNE_PHOTO', async () => {
      const authUserId = buildUuid(PREFIX, '00000011');
      const profilId = buildUuid(PREFIX, '10000011');
      await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
      await seedProfil({ id: profilId, authUserId, statut: 'incomplet' });

      const { useCase } = buildRetirerPhoto();
      const result = await useCase.execute({
        adminAuthUserId: ADMIN_ID,
        adminEmail: ADMIN_EMAIL,
        conseillerProfileId: profilId,
        raison: VALID_REASON,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('AUCUNE_PHOTO');
    });

    it('profil anonymisé → PROFIL_ANONYMISE', async () => {
      const authUserId = buildUuid(PREFIX, '00000012');
      const profilId = buildUuid(PREFIX, '10000012');
      await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
      await seedProfil({
        id: profilId,
        authUserId,
        statut: 'anonymise',
        anonymizedAt: new Date(),
      });

      const { useCase } = buildRetirerPhoto();
      const result = await useCase.execute({
        adminAuthUserId: ADMIN_ID,
        adminEmail: ADMIN_EMAIL,
        conseillerProfileId: profilId,
        raison: VALID_REASON,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('PROFIL_ANONYMISE');
    });
  });

  describe('T112 MasquerProfilAdminUseCase', () => {
    it('masque profil prêt → statut masque_admin + raison persistée + audits', async () => {
      const authUserId = buildUuid(PREFIX, '00000020');
      const profilId = buildUuid(PREFIX, '10000020');
      const compId = buildUuid(PREFIX, '20000020');
      await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
      await seedCompliance({ id: compId, conseillerId: authUserId, status: 'verified' });
      await seedProfil({
        id: profilId,
        authUserId,
        statut: 'pret',
        slug: `b01-masquer-${Date.now()}`,
      });

      const { useCase } = buildMasquer();
      const result = await useCase.execute({
        adminAuthUserId: ADMIN_ID,
        adminEmail: ADMIN_EMAIL,
        conseillerProfileId: profilId,
        raison: VALID_REASON,
      });

      expect(result.ok).toBe(true);
      const after = await prisma.conseillerProfile.findUnique({ where: { id: profilId } });
      expect(after?.statut).toBe('masque_admin');
      expect(after?.raisonMasquageAdmin).toBe(VALID_REASON);

      const audits = await prisma.profilModerationAudit.findMany({
        where: { profileId: profilId },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.action).toBe('masquage');
    });

    it('profil déjà masqué → DEJA_MASQUE', async () => {
      const authUserId = buildUuid(PREFIX, '00000021');
      const profilId = buildUuid(PREFIX, '10000021');
      await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
      await seedProfil({
        id: profilId,
        authUserId,
        statut: 'masque_admin',
        raisonMasquageAdmin: 'Déjà masqué',
      });

      const { useCase } = buildMasquer();
      const result = await useCase.execute({
        adminAuthUserId: ADMIN_ID,
        adminEmail: ADMIN_EMAIL,
        conseillerProfileId: profilId,
        raison: VALID_REASON,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('DEJA_MASQUE');
    });
  });

  describe('T113 RetablirProfilAdminUseCase', () => {
    it('rétablit masqué_admin avec profil incomplet → statut=incomplet (recalcul)', async () => {
      const authUserId = buildUuid(PREFIX, '00000030');
      const profilId = buildUuid(PREFIX, '10000030');
      const compId = buildUuid(PREFIX, '20000030');
      await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
      await seedCompliance({ id: compId, conseillerId: authUserId, status: 'verified' });
      // Profil masqué avec PII insuffisants — au rétablissement, calculé incomplet
      await seedProfil({
        id: profilId,
        authUserId,
        statut: 'masque_admin',
        raisonMasquageAdmin: 'Test',
      });

      const { useCase } = buildRetablir();
      const result = await useCase.execute({
        adminAuthUserId: ADMIN_ID,
        adminEmail: ADMIN_EMAIL,
        conseillerProfileId: profilId,
      });

      expect(result.ok).toBe(true);
      const after = await prisma.conseillerProfile.findUnique({ where: { id: profilId } });
      expect(after?.statut).toBe('incomplet');
      expect(after?.raisonMasquageAdmin).toBeNull();

      const audits = await prisma.profilModerationAudit.findMany({
        where: { profileId: profilId },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.action).toBe('retablissement');
    });

    it('profil pas masqué → PAS_MASQUE', async () => {
      const authUserId = buildUuid(PREFIX, '00000031');
      const profilId = buildUuid(PREFIX, '10000031');
      await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
      await seedProfil({ id: profilId, authUserId, statut: 'incomplet' });

      const { useCase } = buildRetablir();
      const result = await useCase.execute({
        adminAuthUserId: ADMIN_ID,
        adminEmail: ADMIN_EMAIL,
        conseillerProfileId: profilId,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('PAS_MASQUE');
    });
  });

  describe('T114 trigger Postgres profile_moderation_audits append-only', () => {
    it("UPDATE refusé sur ligne d'audit modération", async () => {
      const authUserId = buildUuid(PREFIX, '00000040');
      const profilId = buildUuid(PREFIX, '10000040');
      await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
      await seedProfil({ id: profilId, authUserId, statut: 'incomplet' });

      // Crée 1 audit
      await new PrismaProfilModerationAuditWriter().append({
        profileId: profilId,
        adminAuthUserId: ADMIN_ID,
        adminEmail: ADMIN_EMAIL,
        action: 'masquage',
        raison: VALID_REASON,
      });
      const audit = await prisma.profilModerationAudit.findFirst({
        where: { profileId: profilId },
      });
      expect(audit).toBeTruthy();

      await expect(
        prisma.profilModerationAudit.update({
          where: { id: audit?.id ?? '' },
          data: { raison: 'modifié' },
        }),
      ).rejects.toThrow(/append-only/);
    });
  });
});
