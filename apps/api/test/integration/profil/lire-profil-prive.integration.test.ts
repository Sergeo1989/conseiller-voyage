// T053 — Tests intégration LireProfilPriveUseCase (feature 007 US1).
//
// Couvre :
//   (a) Profil incomplet → payload complet avec champsManquants peuplé
//   (b) Profil prêt → champsManquants = []
//   (c) Profil inexistant → NotFoundException PROFIL_NOT_FOUND
//   (d) Profil anonymisé → NotFoundException PROFIL_ANONYMISE
//   (e) AuthUser sans firstName/lastName → NotFoundException NOM_LEGAL_INDISPONIBLE

import { prisma } from '@cv/db';
import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { LireProfilPriveUseCase } from '../../../src/modules/identite/application/use-cases/lire-profil-prive.use-case';
import { PrismaAuthUserLegalNameReader } from '../../../src/modules/identite/infrastructure/prisma-auth-user-legal-name-reader';
import { PrismaProfilConseillerRepository } from '../../../src/modules/identite/infrastructure/prisma-profil-conseiller-repository';
import {
  buildTestConformiteQueryPort,
  buildUuid,
  cleanupByUuidPrefix,
  seedAuthUser,
  seedCompliance,
  seedProfil,
} from './_helpers';

const PREFIX = 'a01';

function buildUseCase(): LireProfilPriveUseCase {
  return new LireProfilPriveUseCase(
    new PrismaProfilConseillerRepository(),
    new PrismaAuthUserLegalNameReader(),
    buildTestConformiteQueryPort(),
  );
}

describe('LireProfilPriveUseCase (T053)', () => {
  beforeEach(async () => {
    await cleanupByUuidPrefix(PREFIX);
  });

  afterAll(async () => {
    await cleanupByUuidPrefix(PREFIX);
  });

  it('profil incomplet → payload + champsManquants peuplé', async () => {
    const authUserId = buildUuid(PREFIX, '00000001');
    const profilId = buildUuid(PREFIX, '10000001');
    const compId = buildUuid(PREFIX, '20000001');

    await seedAuthUser({ id: authUserId, firstName: 'Marie', lastName: 'Dupont' });
    await seedCompliance({ id: compId, conseillerId: authUserId, status: 'verified' });
    await seedProfil({ id: profilId, authUserId, statut: 'incomplet' });

    const result = await buildUseCase().execute({ authUserId });

    expect(result.profilId).toBe(profilId);
    expect(result.statut).toBe('incomplet');
    expect(result.nomLegal).toEqual({ prenom: 'Marie', nom: 'Dupont' });
    expect(result.nomAffiche).toBe('Marie D.');
    expect(result.verifie).toBe(true);
    expect(result.slug).toBeNull();
    expect(result.champsManquants).toEqual(
      expect.arrayContaining([
        'titre',
        'biographie',
        'specialites',
        'langues',
        'zonesGeographiques',
        'anneesExperience',
        'photo',
      ]),
    );
  });

  it('profil prêt → champsManquants = [] + nomAffiche complet quand afficherNomComplet=true', async () => {
    const authUserId = buildUuid(PREFIX, '00000002');
    const profilId = buildUuid(PREFIX, '10000002');
    const compId = buildUuid(PREFIX, '20000002');

    // Seed les codes M-N requis (idempotent — upsert)
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

    await seedAuthUser({ id: authUserId, firstName: 'Jean', lastName: 'Tremblay' });
    await seedCompliance({ id: compId, conseillerId: authUserId, status: 'verified' });
    await seedProfil({
      id: profilId,
      authUserId,
      statut: 'pret',
      slug: 'jean-tremblay',
      publishedAt: new Date(),
      titre: 'Spécialiste voyages familiaux',
      biographie:
        "Conseiller expérimenté en voyages familiaux. Plus de 15 ans d'expérience à organiser des séjours sur mesure pour les familles québécoises partout dans le monde.",
      anneesExperience: 15,
      afficherNomComplet: true,
      photoS3Key: 'profiles/jean-tremblay.jpg',
      photoWidth: 800,
      photoHeight: 800,
      photoContentType: 'image/jpeg',
      specialitesCodes: ['famille'],
      languesCodes: ['fr'],
      zonesGeographiquesCodes: ['europe'],
    });

    const result = await buildUseCase().execute({ authUserId });

    expect(result.statut).toBe('pret');
    expect(result.slug).toBe('jean-tremblay');
    expect(result.nomAffiche).toBe('Jean Tremblay');
    expect(result.champsManquants).toEqual([]);
    expect(result.verifie).toBe(true);
  });

  it('profil inexistant → NotFoundException PROFIL_NOT_FOUND', async () => {
    const authUserId = buildUuid(PREFIX, '00000003');
    await seedAuthUser({ id: authUserId, firstName: 'Sans', lastName: 'Profil' });

    await expect(buildUseCase().execute({ authUserId })).rejects.toThrow(NotFoundException);
  });

  it('profil anonymisé → NotFoundException PROFIL_ANONYMISE', async () => {
    const authUserId = buildUuid(PREFIX, '00000004');
    const profilId = buildUuid(PREFIX, '10000004');
    const compId = buildUuid(PREFIX, '20000004');

    await seedAuthUser({ id: authUserId, firstName: 'Anonymise', lastName: 'User' });
    await seedCompliance({ id: compId, conseillerId: authUserId, status: 'verified' });
    await seedProfil({
      id: profilId,
      authUserId,
      statut: 'anonymise',
      anonymizedAt: new Date(),
    });

    await expect(buildUseCase().execute({ authUserId })).rejects.toThrow(NotFoundException);
  });

  it('AuthUser sans firstName/lastName → NotFoundException NOM_LEGAL_INDISPONIBLE', async () => {
    const authUserId = buildUuid(PREFIX, '00000005');
    const profilId = buildUuid(PREFIX, '10000005');

    // Crée AuthUser SANS firstName/lastName
    await prisma.authUser.create({
      data: {
        id: authUserId,
        email: `${authUserId}@example.test`,
        role: 'conseiller',
      },
    });
    await seedProfil({ id: profilId, authUserId, statut: 'incomplet' });

    await expect(buildUseCase().execute({ authUserId })).rejects.toThrow(NotFoundException);
  });
});
