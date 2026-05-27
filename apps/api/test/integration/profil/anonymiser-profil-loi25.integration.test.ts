// T126 — Tests intégration AnonymiserProfilLoi25UseCase (feature 007 US5 FR-016).
//
// Couvre :
//   (a) PII effacés (biographie, titre, années, photo S3, history S3,
//       langues/spécialités/zones)
//   (b) statut → 'anonymise' + anonymizedAt = NOW()
//   (c) SlugReservation ajouté avec conseillerIdOrigine = NULL (ADR-0015)
//   (d) Idempotence : re-appel = no-op silencieux
//   (e) Trigger Postgres `profile_anonymise_terminal` bloque toute
//       tentative `anonymise → autre` (statut terminal)

import { prisma } from '@cv/db';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilCacheInvalidator } from '../../../src/modules/identite/application/listeners/profil-cache-invalidation.listener';
import type { AuthAuditWriter } from '../../../src/modules/identite/application/ports/auth-audit-writer.port';
import type { OnboardingRelanceScheduler } from '../../../src/modules/identite/application/ports/onboarding-relance-scheduler.port';
import type { PhotoStorage } from '../../../src/modules/identite/application/ports/photo-storage.port';
import { AnonymiserProfilLoi25UseCase } from '../../../src/modules/identite/application/use-cases/anonymiser-profil-loi25.use-case';
import { PrismaPhotoHistoriqueRepository } from '../../../src/modules/identite/infrastructure/prisma-photo-historique-repository';
import { PrismaProfilConseillerRepository } from '../../../src/modules/identite/infrastructure/prisma-profil-conseiller-repository';
import { PrismaSlugReservationRepository } from '../../../src/modules/identite/infrastructure/prisma-slug-reservation-repository';
import {
  buildUuid,
  cleanupByUuidPrefix,
  seedAuthUser,
  seedCompliance,
  seedProfil,
} from './_helpers';

const PREFIX = 'a03';

function buildUseCase(storage: PhotoStorage = makeStorageStub()): {
  useCase: AnonymiserProfilLoi25UseCase;
  audit: AuthAuditWriter;
  scheduler: OnboardingRelanceScheduler;
} {
  const audit: AuthAuditWriter = { append: vi.fn().mockResolvedValue(undefined) };
  const scheduler: OnboardingRelanceScheduler = {
    planifierRelances: vi.fn().mockResolvedValue(undefined),
    annulerRelances: vi.fn().mockResolvedValue(undefined),
  };
  const cacheInvalidator = new ProfilCacheInvalidator(
    { revalidatePath: vi.fn().mockResolvedValue(undefined) },
    { invalidatePaths: vi.fn().mockResolvedValue(undefined) },
  );
  const useCase = new AnonymiserProfilLoi25UseCase(
    new PrismaProfilConseillerRepository(),
    new PrismaPhotoHistoriqueRepository(),
    storage,
    new PrismaSlugReservationRepository(),
    scheduler,
    audit,
    cacheInvalidator,
  );
  return { useCase, audit, scheduler };
}

function makeStorageStub(): PhotoStorage {
  return {
    upload: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    listKeysWithPrefix: vi.fn().mockResolvedValue([]),
  };
}

describe('AnonymiserProfilLoi25UseCase (T126)', () => {
  beforeEach(async () => {
    await cleanupByUuidPrefix(PREFIX);
  });

  afterAll(async () => {
    await cleanupByUuidPrefix(PREFIX);
  });

  it('efface PII + statut=anonymise + SlugReservation conseillerIdOrigine=NULL (ADR-0015)', async () => {
    const authUserId = buildUuid(PREFIX, '00000001');
    const profilId = buildUuid(PREFIX, '10000001');
    const compId = buildUuid(PREFIX, '20000001');
    const slug = `a03-anon-${Date.now()}`;

    await prisma.profileSpeciality.upsert({
      where: { code: 'famille' },
      update: {},
      create: { code: 'famille', labelFr: 'Famille', ordre: 1 },
    });
    await prisma.profileLanguage.upsert({
      where: { code: 'fr' },
      update: {},
      create: { code: 'fr', labelFr: 'Français', ordre: 1 },
    });
    await prisma.profileGeoZone.upsert({
      where: { code: 'europe' },
      update: {},
      create: { code: 'europe', labelFr: 'Europe', ordre: 1 },
    });

    await seedAuthUser({ id: authUserId, firstName: 'Marie', lastName: 'Dupont' });
    await seedCompliance({ id: compId, conseillerId: authUserId, status: 'verified' });
    await seedProfil({
      id: profilId,
      authUserId,
      statut: 'pret',
      slug,
      publishedAt: new Date(),
      titre: 'Spécialiste',
      biographie: 'Bio à supprimer Loi 25 — devrait être NULL post-anonymisation',
      anneesExperience: 10,
      afficherNomComplet: true,
      photoS3Key: 'profiles/marie-dupont.jpg',
      photoWidth: 800,
      photoHeight: 800,
      photoContentType: 'image/jpeg',
      specialitesCodes: ['famille'],
      languesCodes: ['fr'],
      zonesGeographiquesCodes: ['europe'],
    });

    const storage = makeStorageStub();
    const { useCase, audit } = buildUseCase(storage);
    await useCase.execute({
      conseillerProfileId: profilId,
      orchestrateurReference: 'orch-test-001',
    });

    // (a) PII effacés
    const after = await prisma.conseillerProfile.findUnique({
      where: { id: profilId },
      include: { specialites: true, langues: true, zonesGeographiques: true },
    });
    expect(after).toBeTruthy();
    expect(after?.titre).toBeNull();
    expect(after?.biographie).toBeNull();
    expect(after?.anneesExperience).toBeNull();
    expect(after?.afficherNomComplet).toBe(false);
    expect(after?.photoS3Key).toBeNull();
    expect(after?.photoWidth).toBeNull();
    expect(after?.photoHeight).toBeNull();
    expect(after?.specialites).toHaveLength(0);
    expect(after?.langues).toHaveLength(0);
    expect(after?.zonesGeographiques).toHaveLength(0);

    // (b) statut terminal + anonymizedAt
    expect(after?.statut).toBe('anonymise');
    expect(after?.anonymizedAt).toBeInstanceOf(Date);

    // (c) SlugReservation avec conseillerIdOrigine = NULL (ADR-0015)
    const reservation = await prisma.slugReservation.findUnique({ where: { slug } });
    expect(reservation).toBeTruthy();
    expect(reservation?.raison).toBe('loi25');
    expect(reservation?.conseillerIdOrigine).toBeNull();

    // S3 delete a été appelé sur la photo courante
    expect(storage.delete).toHaveBeenCalledWith('profiles/marie-dupont.jpg');

    // Audit immutable
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'signup',
        targetUserId: authUserId,
        metadata: expect.objectContaining({
          action: 'profil.anonymise.loi25',
          orchestrateurReference: 'orch-test-001',
          slugReserve: slug,
        }),
      }),
    );
  });

  it('idempotence : re-appel sur profil déjà anonymisé = no-op', async () => {
    const authUserId = buildUuid(PREFIX, '00000002');
    const profilId = buildUuid(PREFIX, '10000002');
    const compId = buildUuid(PREFIX, '20000002');
    const slug = `a03-idem-${Date.now()}`;

    await seedAuthUser({ id: authUserId, firstName: 'Jean', lastName: 'Test' });
    await seedCompliance({ id: compId, conseillerId: authUserId, status: 'verified' });
    await seedProfil({
      id: profilId,
      authUserId,
      statut: 'pret',
      slug,
      publishedAt: new Date(),
    });

    // 1er appel
    const { useCase: uc1 } = buildUseCase();
    await uc1.execute({ conseillerProfileId: profilId, orchestrateurReference: 'r1' });

    // 2e appel — le profil est déjà 'anonymise'
    const { useCase: uc2, audit: audit2 } = buildUseCase();
    await uc2.execute({ conseillerProfileId: profilId, orchestrateurReference: 'r2' });

    // Le 2e appel ne doit RIEN faire : pas de nouvel audit
    expect(audit2.append).not.toHaveBeenCalled();

    // La SlugReservation doit toujours exister (1 seule entrée)
    const reservation = await prisma.slugReservation.findUnique({ where: { slug } });
    expect(reservation).toBeTruthy();
  });

  it('profil inexistant → no-op silencieux (warn log)', async () => {
    const ghostId = buildUuid(PREFIX, '00000099');
    const { useCase, audit } = buildUseCase();
    await expect(
      useCase.execute({ conseillerProfileId: ghostId, orchestrateurReference: 'r' }),
    ).resolves.toBeUndefined();
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('trigger Postgres profile_anonymise_terminal bloque transition sortante', async () => {
    const authUserId = buildUuid(PREFIX, '00000003');
    const profilId = buildUuid(PREFIX, '10000003');
    const compId = buildUuid(PREFIX, '20000003');

    await seedAuthUser({ id: authUserId, firstName: 'X', lastName: 'Y' });
    await seedCompliance({ id: compId, conseillerId: authUserId, status: 'verified' });
    await seedProfil({
      id: profilId,
      authUserId,
      statut: 'anonymise',
      anonymizedAt: new Date(),
    });

    // Tentative directe d'inverser le statut — doit lever
    await expect(
      prisma.conseillerProfile.update({
        where: { id: profilId },
        data: { statut: 'pret' },
      }),
    ).rejects.toThrow(/Statut anonymise est terminal/);
  });

  it('trigger Postgres profile_slug_reservations_no_delete bloque suppression', async () => {
    const slug = `a03-noremove-${Date.now()}`;
    await prisma.slugReservation.create({
      data: { slug, raison: 'loi25', conseillerIdOrigine: null },
    });
    await expect(prisma.slugReservation.delete({ where: { slug } })).rejects.toThrow(/append-only/);

    // Cleanup direct
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
    await prisma.$executeRawUnsafe(`DELETE FROM profile_slug_reservations WHERE slug = '${slug}'`);
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  });
});
