// T072 — Tests intégration LirePageProfilPubliqueUseCase (feature 007 US2).
//
// Anti-énumération SC-003 : retourne null pour TOUS les cas non-visibles
// sans distinguer la raison. Couvre 5 cas → null + 1 nominal :
//   (1) slug inexistant → null
//   (2) slug réservé (anonymisé) → null
//   (3) profil incomplet → null
//   (4) profil masque_admin → null
//   (5) conformité non verified → null
//   (6) verified + pret + champs complets → payload nominal
//   (7) lireSlugsPubliables → liste les slugs publiables

import { prisma } from '@cv/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { LirePageProfilPubliqueUseCase } from '../../../src/modules/identite/application/use-cases/lire-page-profil-publique.use-case';
import { PrismaAuthUserLegalNameReader } from '../../../src/modules/identite/infrastructure/prisma-auth-user-legal-name-reader';
import { PrismaProfilPublicReader } from '../../../src/modules/identite/infrastructure/prisma-profil-public-reader';
import {
  buildTestConformiteQueryPort,
  buildUuid,
  cleanupBySlug,
  cleanupByUuidPrefix,
  seedAuthUser,
  seedCompliance,
  seedProfil,
} from './_helpers';

const PREFIX = 'a07';

function buildUseCase(): LirePageProfilPubliqueUseCase {
  return new LirePageProfilPubliqueUseCase(
    new PrismaProfilPublicReader(
      buildTestConformiteQueryPort(),
      new PrismaAuthUserLegalNameReader(),
    ),
  );
}

async function seedReadyProfileBundle(
  suffix: string,
  overrides: { slug: string; statut?: 'pret' | 'incomplet' | 'masque_admin' } & {
    complianceStatus?: 'pending' | 'verified' | 'suspended' | 'revoked';
    raisonMasquageAdmin?: string | null;
  },
): Promise<{ authUserId: string; profilId: string }> {
  const authUserId = buildUuid(PREFIX, `0${suffix}`);
  const profilId = buildUuid(PREFIX, `1${suffix}`);
  const compId = buildUuid(PREFIX, `2${suffix}`);

  await prisma.profileSpeciality.upsert({
    where: { code: 'famille' },
    update: {},
    create: { code: 'famille', labelFr: 'Voyages en famille', ordre: 1 },
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

  await seedAuthUser({ id: authUserId, firstName: 'Marie', lastName: 'Tremblay' });
  await seedCompliance({
    id: compId,
    conseillerId: authUserId,
    status: overrides.complianceStatus ?? 'verified',
  });
  await seedProfil({
    id: profilId,
    authUserId,
    statut: overrides.statut ?? 'pret',
    slug: overrides.slug,
    publishedAt: new Date(),
    titre: 'Spécialiste familles',
    biographie:
      "Conseiller expérimenté en voyages familiaux. 12 ans d'expérience pour des familles québécoises.",
    anneesExperience: 12,
    afficherNomComplet: false,
    photoS3Key: `profiles/${overrides.slug}.jpg`,
    photoWidth: 800,
    photoHeight: 800,
    photoContentType: 'image/jpeg',
    raisonMasquageAdmin: overrides.raisonMasquageAdmin ?? null,
    specialitesCodes: ['famille'],
    languesCodes: ['fr'],
    zonesGeographiquesCodes: ['europe'],
  });

  return { authUserId, profilId };
}

describe('LirePageProfilPubliqueUseCase (T072, anti-énumération SC-003)', () => {
  const allSlugs: string[] = [];

  beforeEach(async () => {
    await cleanupByUuidPrefix(PREFIX);
    for (const slug of allSlugs) await cleanupBySlug(slug);
  });

  afterAll(async () => {
    await cleanupByUuidPrefix(PREFIX);
    for (const slug of allSlugs) await cleanupBySlug(slug);
  });

  it('slug inexistant → null', async () => {
    await expect(buildUseCase().execute({ slug: 'inconnu-no-existe-jamais' })).resolves.toBeNull();
  });

  it('slug réservé Loi 25 (sans profil actif) → null', async () => {
    const reservedSlug = `a07-reserved-${Date.now()}`;
    allSlugs.push(reservedSlug);
    await prisma.slugReservation.create({
      data: { slug: reservedSlug, raison: 'loi25', conseillerIdOrigine: null },
    });

    await expect(buildUseCase().execute({ slug: reservedSlug })).resolves.toBeNull();
  });

  it('profil incomplet → null', async () => {
    const slug = `a07-incomplet-${Date.now()}`;
    allSlugs.push(slug);
    await seedReadyProfileBundle('0000001', { slug, statut: 'incomplet' });

    await expect(buildUseCase().execute({ slug })).resolves.toBeNull();
  });

  it('profil masque_admin → null', async () => {
    const slug = `a07-masque-${Date.now()}`;
    allSlugs.push(slug);
    await seedReadyProfileBundle('0000002', {
      slug,
      statut: 'masque_admin',
      raisonMasquageAdmin: 'Test',
    });

    await expect(buildUseCase().execute({ slug })).resolves.toBeNull();
  });

  it('conformité pending → null (FR-022)', async () => {
    const slug = `a07-pending-${Date.now()}`;
    allSlugs.push(slug);
    await seedReadyProfileBundle('0000003', {
      slug,
      statut: 'pret',
      complianceStatus: 'pending',
    });

    await expect(buildUseCase().execute({ slug })).resolves.toBeNull();
  });

  it('verified + pret + champs complets → payload nominal', async () => {
    const slug = `a07-nominal-${Date.now()}`;
    allSlugs.push(slug);
    await seedReadyProfileBundle('0000004', { slug, statut: 'pret' });

    const payload = await buildUseCase().execute({ slug });
    expect(payload).toBeTruthy();
    expect(payload?.slug).toBe(slug);
    expect(payload?.nomAffiche).toBe('Marie T.'); // afficherNomComplet=false
    expect(payload?.titre).toBe('Spécialiste familles');
    expect(payload?.anneesExperience).toBe(12);
    expect(payload?.verifieOPCTICO).toBe(true);
    // Le label est partagé global (upsert sans MAJ), on vérifie seulement
    // que les codes sont présents — le label dépend de l'état global DB.
    expect(payload?.specialites.map((s) => s.code)).toEqual(['famille']);
    expect(payload?.langues.map((l) => l.code)).toEqual(['fr']);
    expect(payload?.zonesGeographiques.map((z) => z.code)).toEqual(['europe']);
  });

  it('lireSlugsPubliables → seuls les slugs des profils statut=pret', async () => {
    const slugPret = `a07-pubsitemap-pret-${Date.now()}`;
    const slugIncomplet = `a07-pubsitemap-incomp-${Date.now()}`;
    allSlugs.push(slugPret, slugIncomplet);
    await seedReadyProfileBundle('0000005', { slug: slugPret, statut: 'pret' });
    await seedReadyProfileBundle('0000006', { slug: slugIncomplet, statut: 'incomplet' });

    const slugs = await buildUseCase().lireSlugsPubliables();
    expect(slugs).toContain(slugPret);
    expect(slugs).not.toContain(slugIncomplet);
  });
});
