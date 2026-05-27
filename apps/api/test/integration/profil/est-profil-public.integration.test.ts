// T077 — Tests intégration PrismaEstProfilPublic (feature 007).
//
// Source de vérité pour 011 (matching) + 016 (SEO). Couvre la table de
// tests dans contracts/est-profil-public.port.md :
//   (1) verified + prêt → true (nominal)
//   (2) verified + incomplet → false
//   (3) pending + prêt → false (conformité gate)
//   (4) verified + masque_admin → false
//   (5) verified + anonymise → false
//   (6) inexistant → false (fail-safe)
//   (7) filtrerPublics([]) → []
//   (8) filtrerPublics batch mixte → seuls les éligibles

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaEstProfilPublic } from '../../../src/modules/identite/infrastructure/prisma-est-profil-public';
import {
  buildTestConformiteQueryPort,
  buildUuid,
  cleanupByUuidPrefix,
  seedAuthUser,
  seedCompliance,
  seedProfil,
} from './_helpers';

const PREFIX = 'a02';

function buildAdapter(): PrismaEstProfilPublic {
  return new PrismaEstProfilPublic(buildTestConformiteQueryPort());
}

describe('PrismaEstProfilPublic (T077, contract est-profil-public.port.md)', () => {
  beforeEach(async () => {
    await cleanupByUuidPrefix(PREFIX);
  });

  afterAll(async () => {
    await cleanupByUuidPrefix(PREFIX);
  });

  it('verified + prêt → true (nominal)', async () => {
    const authUserId = buildUuid(PREFIX, '00000001');
    const profilId = buildUuid(PREFIX, '10000001');
    const compId = buildUuid(PREFIX, '20000001');
    await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
    await seedCompliance({ id: compId, conseillerId: authUserId, status: 'verified' });
    await seedProfil({
      id: profilId,
      authUserId,
      statut: 'pret',
      slug: `a02-ready-${Date.now()}`,
    });

    await expect(buildAdapter().estPublic(authUserId)).resolves.toBe(true);
  });

  it('verified + incomplet → false (FR-022)', async () => {
    const authUserId = buildUuid(PREFIX, '00000002');
    const profilId = buildUuid(PREFIX, '10000002');
    const compId = buildUuid(PREFIX, '20000002');
    await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
    await seedCompliance({ id: compId, conseillerId: authUserId, status: 'verified' });
    await seedProfil({ id: profilId, authUserId, statut: 'incomplet' });

    await expect(buildAdapter().estPublic(authUserId)).resolves.toBe(false);
  });

  it('pending + prêt → false (conformité gate FR-022)', async () => {
    const authUserId = buildUuid(PREFIX, '00000003');
    const profilId = buildUuid(PREFIX, '10000003');
    const compId = buildUuid(PREFIX, '20000003');
    await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
    await seedCompliance({ id: compId, conseillerId: authUserId, status: 'pending' });
    await seedProfil({
      id: profilId,
      authUserId,
      statut: 'pret',
      slug: `a02-pending-${Date.now()}`,
    });

    await expect(buildAdapter().estPublic(authUserId)).resolves.toBe(false);
  });

  it('verified + masque_admin → false (FR-023)', async () => {
    const authUserId = buildUuid(PREFIX, '00000004');
    const profilId = buildUuid(PREFIX, '10000004');
    const compId = buildUuid(PREFIX, '20000004');
    await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
    await seedCompliance({ id: compId, conseillerId: authUserId, status: 'verified' });
    await seedProfil({
      id: profilId,
      authUserId,
      statut: 'masque_admin',
      raisonMasquageAdmin: 'Test masquage',
    });

    await expect(buildAdapter().estPublic(authUserId)).resolves.toBe(false);
  });

  it('verified + anonymise → false (FR-016)', async () => {
    const authUserId = buildUuid(PREFIX, '00000005');
    const profilId = buildUuid(PREFIX, '10000005');
    const compId = buildUuid(PREFIX, '20000005');
    await seedAuthUser({ id: authUserId, firstName: 'A', lastName: 'B' });
    await seedCompliance({ id: compId, conseillerId: authUserId, status: 'verified' });
    await seedProfil({
      id: profilId,
      authUserId,
      statut: 'anonymise',
      anonymizedAt: new Date(),
    });

    await expect(buildAdapter().estPublic(authUserId)).resolves.toBe(false);
  });

  it('conseiller inexistant → false (fail-safe)', async () => {
    const ghostId = buildUuid(PREFIX, '99999999');
    await expect(buildAdapter().estPublic(ghostId)).resolves.toBe(false);
  });

  it('conseillerId vide ou null → false', async () => {
    await expect(buildAdapter().estPublic('')).resolves.toBe(false);
  });

  it('filtrerPublics([]) → []', async () => {
    await expect(buildAdapter().filtrerPublics([])).resolves.toEqual([]);
  });

  it('filtrerPublics batch mixte → seuls les éligibles', async () => {
    const eligibleId = buildUuid(PREFIX, '00000010');
    const incompleteId = buildUuid(PREFIX, '00000011');
    const ghostId = buildUuid(PREFIX, '00000012');

    await seedAuthUser({ id: eligibleId, firstName: 'A', lastName: 'Eligible' });
    await seedCompliance({
      id: buildUuid(PREFIX, '20000010'),
      conseillerId: eligibleId,
      status: 'verified',
    });
    await seedProfil({
      id: buildUuid(PREFIX, '10000010'),
      authUserId: eligibleId,
      statut: 'pret',
      slug: `a02-elig-${Date.now()}`,
    });

    await seedAuthUser({ id: incompleteId, firstName: 'A', lastName: 'Incomplete' });
    await seedCompliance({
      id: buildUuid(PREFIX, '20000011'),
      conseillerId: incompleteId,
      status: 'verified',
    });
    await seedProfil({
      id: buildUuid(PREFIX, '10000011'),
      authUserId: incompleteId,
      statut: 'incomplet',
    });

    const result = await buildAdapter().filtrerPublics([eligibleId, incompleteId, ghostId]);
    expect(result).toEqual([eligibleId]);
  });
});
