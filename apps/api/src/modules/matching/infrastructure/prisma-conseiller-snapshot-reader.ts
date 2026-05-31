// T059 — Adapter Prisma : ConseillerSnapshotReader.
//
// Pipeline d'assemblage du snapshot :
//   1. Lit `profile_conseiller_profiles` avec statut='pret' + relations
//      (langues, specialités, zones géographiques)
//   2. Filtre dur langue (Q3) — exclu si filterLanguage absent de
//      `profile.langues.code`
//   3. Pour chaque profil restant : appelle ConformiteQueryPort.getVerificationStatus
//      (cross-module 001) ; exclu si non-verified
//   4. Hiérarchie adresse (R5/Q2/ADR-0024) : `profile.codePostal` (Mode A,
//      ajouté en T015) → parseFsaFromPostalCode. Pas de fallback siège
//      social 001 car non disponible (ADR-0024 documente le gap)
//   5. Dérivation experienceTier depuis `anneesExperience` (Int? sur 007) :
//      0-3 → pair_junior, 4-9 → pair, 10+ → mentor
//   6. Mapping zonesGeographiques.code → destinations.country (proxy MVP
//      ADR-0024)

import { prisma } from '@cv/db';
import { CONFORMITE_QUERY_PORT, type ConformiteQueryPort } from '@cv/shared/conformite';
import { Inject, Injectable } from '@nestjs/common';
import type {
  ConseillerExperienceTier,
  ConseillerLanguage,
  ConseillerSnapshot,
  ConseillerSnapshotReader,
} from '../application/ports/conseiller-snapshot-reader.port';
import { parseFsaFromPostalCode } from '../domain/value-objects/fsa-code.vo';

@Injectable()
export class PrismaConseillerSnapshotReader implements ConseillerSnapshotReader {
  constructor(
    @Inject(CONFORMITE_QUERY_PORT)
    private readonly conformiteQuery: ConformiteQueryPort,
  ) {}

  async readAllVerifiedSnapshots(
    filterLanguage: ConseillerLanguage,
  ): Promise<ReadonlyArray<ConseillerSnapshot>> {
    const profiles = await prisma.conseillerProfile.findMany({
      where: {
        statut: 'pret',
        langues: { some: { code: filterLanguage } }, // filtre dur Q3 au niveau DB
      },
      include: {
        langues: true,
        specialites: true,
        zonesGeographiques: true,
      },
    });

    const snapshots: ConseillerSnapshot[] = [];
    for (const p of profiles) {
      // Filtre verified via ConformiteQueryPort (cross-module 001)
      const status = await this.conformiteQuery.getVerificationStatus({
        conseillerId: p.id,
      });
      if (!status.verified) continue;

      snapshots.push({
        conseillerId: p.id,
        languages: p.langues
          .map((l) => l.code)
          .filter((c): c is ConseillerLanguage => c === 'fr' || c === 'en'),
        specialities: p.specialites.map((s) => s.code),
        destinations: p.zonesGeographiques.map((z) => ({ country: z.code })),
        experienceTier: deriveExperienceTier(p.anneesExperience),
        fsa: parseFsaFromPostalCode(p.codePostal),
      });
    }

    return snapshots;
  }
}

/**
 * Mapping anneesExperience (Int?) → ConseillerExperienceTier.
 *   - null ou 0-3 ans  → pair_junior (peut manquer d'expérience MVP)
 *   - 4-9 ans          → pair (pair-à-pair standard)
 *   - 10+ ans          → mentor (peut guider un novice efficacement)
 * Documenté dans ADR-0024 (extension cross-module — mapping plutôt que
 * migration mineure 007).
 */
function deriveExperienceTier(anneesExperience: number | null): ConseillerExperienceTier {
  if (anneesExperience === null || anneesExperience <= 3) return 'pair_junior';
  if (anneesExperience <= 9) return 'pair';
  return 'mentor';
}
