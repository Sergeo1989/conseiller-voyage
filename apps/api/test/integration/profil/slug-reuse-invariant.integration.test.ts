// T127 — Test invariant SC-007 (feature 007 US5 FR-015 + ADR-0015).
//
// **Test invariant** — ne doit jamais être supprimé sans amendement
// constitution + ADR. Préserve la garantie Loi 25 que le slug d'un
// conseiller anonymisé ne pourra jamais être réutilisé (même par un
// homonyme parfait), évitant toute ré-identification via URL bookmarkée.
//
// Scénario :
//   1. Seed conseiller "Marie Dupont" → publish profil → slug "marie-dupont"
//   2. AnonymiserProfilLoi25UseCase → slug copié dans SlugReservation
//      avec conseillerIdOrigine=NULL (ADR-0015)
//   3. Re-seed un AUTRE conseiller homonyme "Marie Dupont"
//   4. genererSlugUnique sur le 2e conseiller → DOIT retourner "marie-dupont-2"
//      (NEVER "marie-dupont", qui est réservé à vie)

import { prisma } from '@cv/db';
import { genererSlugUnique } from '@cv/profil-domain';
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
  cleanupBySlug,
  cleanupByUuidPrefix,
  seedAuthUser,
  seedCompliance,
  seedProfil,
} from './_helpers';

const PREFIX = 'a04';
// Cible le slug que les 2 conseillers homonymes vont essayer de prendre.
const HOMONYME_SLUG = 'marie-dupont-invar';

function buildAnonymiserUseCase(): AnonymiserProfilLoi25UseCase {
  const storage: PhotoStorage = {
    upload: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    listKeysWithPrefix: vi.fn().mockResolvedValue([]),
  };
  const scheduler: OnboardingRelanceScheduler = {
    planifierRelances: vi.fn().mockResolvedValue(undefined),
    annulerRelances: vi.fn().mockResolvedValue(undefined),
  };
  const audit: AuthAuditWriter = { append: vi.fn().mockResolvedValue(undefined) };
  const cacheInvalidator = new ProfilCacheInvalidator(
    { revalidatePath: vi.fn().mockResolvedValue(undefined) },
    { invalidatePaths: vi.fn().mockResolvedValue(undefined) },
  );
  return new AnonymiserProfilLoi25UseCase(
    new PrismaProfilConseillerRepository(),
    new PrismaPhotoHistoriqueRepository(),
    storage,
    new PrismaSlugReservationRepository(),
    scheduler,
    audit,
    cacheInvalidator,
  );
}

describe('[invariant] SC-007 slug-reuse Loi 25 (T127)', () => {
  beforeEach(async () => {
    await cleanupByUuidPrefix(PREFIX);
    await cleanupBySlug(HOMONYME_SLUG);
    await cleanupBySlug(`${HOMONYME_SLUG}-2`);
  });

  afterAll(async () => {
    await cleanupByUuidPrefix(PREFIX);
    await cleanupBySlug(HOMONYME_SLUG);
    await cleanupBySlug(`${HOMONYME_SLUG}-2`);
  });

  it('homonyme post-anonymisation Loi 25 obtient marie-dupont-2 (jamais le slug réservé)', async () => {
    // ---------- 1er conseiller : Marie Dupont (sera anonymisé) ----------
    const auth1 = buildUuid(PREFIX, '00000001');
    const profil1 = buildUuid(PREFIX, '10000001');
    const comp1 = buildUuid(PREFIX, '20000001');

    await seedAuthUser({ id: auth1, firstName: 'Marie', lastName: 'Dupont' });
    await seedCompliance({ id: comp1, conseillerId: auth1, status: 'verified' });
    await seedProfil({
      id: profil1,
      authUserId: auth1,
      statut: 'pret',
      slug: HOMONYME_SLUG,
      publishedAt: new Date(),
    });

    // ---------- Anonymisation Loi 25 du 1er conseiller ----------
    await buildAnonymiserUseCase().execute({
      conseillerProfileId: profil1,
      orchestrateurReference: 'invariant-sc-007',
    });

    // Le slug est maintenant dans SlugReservation avec conseillerIdOrigine=NULL.
    const reservation = await prisma.slugReservation.findUnique({
      where: { slug: HOMONYME_SLUG },
    });
    expect(reservation).toBeTruthy();
    expect(reservation?.raison).toBe('loi25');
    expect(reservation?.conseillerIdOrigine).toBeNull();

    // ---------- 2e conseiller homonyme parfait : Marie Dupont ----------
    const auth2 = buildUuid(PREFIX, '00000002');
    await seedAuthUser({
      id: auth2,
      firstName: 'Marie',
      lastName: 'Dupont',
      email: `homonyme-${Date.now()}@example.test`,
    });

    // ---------- Génération du slug du 2e conseiller via le domaine pur ----------
    const slugReserveSet = await new PrismaSlugReservationRepository().listAll();
    const existingRows = await prisma.conseillerProfile.findMany({
      where: { slug: { not: null } },
      select: { slug: true },
    });
    const slugExistant = new Set(
      existingRows.map((r) => r.slug).filter((s): s is string => s !== null),
    );

    // Vérification : pour reproduire le scénario exact du contexte, on
    // force le base-slug à correspondre au HOMONYME_SLUG en passant
    // `Marie` + `Dupont-invar` (le test cible la mécanique de
    // désambiguïsation suffix-numérique, pas la slugification elle-même).
    // Le slug `marie-dupont-invar` est dans slugReserveSet → on attend
    // `marie-dupont-invar-2`.
    const slug2 = genererSlugUnique('Marie', 'Dupont-invar', {
      slugExistant,
      slugReserve: slugReserveSet,
    });

    expect(slug2).toBe(`${HOMONYME_SLUG}-2`);
    expect(slug2).not.toBe(HOMONYME_SLUG);

    // L'invariant fort : le slug du 1er n'est JAMAIS retournable.
    expect(slugReserveSet.has(HOMONYME_SLUG)).toBe(true);
  });

  it('slugReserve persiste même après suppression directe en DB (trigger append-only)', async () => {
    const tempSlug = `${HOMONYME_SLUG}-persist`;
    await prisma.slugReservation.create({
      data: { slug: tempSlug, raison: 'loi25', conseillerIdOrigine: null },
    });

    // Toute tentative de DELETE doit être refusée par le trigger.
    await expect(prisma.slugReservation.delete({ where: { slug: tempSlug } })).rejects.toThrow(
      /append-only/,
    );

    // Le slug reste lisible
    const exists = await new PrismaSlugReservationRepository().isReserved(tempSlug);
    expect(exists).toBe(true);

    // Cleanup direct via session replication bypass
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM profile_slug_reservations WHERE slug = '${tempSlug}'`,
    );
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  });
});
