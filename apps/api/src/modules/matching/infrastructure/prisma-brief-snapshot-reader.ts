// T058 — Adapter Prisma : BriefSnapshotReader.
// Lit intake_voyageur_briefs + intake_voyageur_contacts via Prisma, extrait
// FSA depuis postalCode (parseFsaFromPostalCode), résout suggestedConseillerId
// depuis le champ brief (capturé au moment de la soumission par 008 quand
// cookie cv_suggested HMAC valide — extension T070 Phase 4).
//
// Retourne null si :
//   - brief inconnu
//   - brief en pending_verification (jamais matché)
//   - brief anonymisé Loi 25 (status='anonymized' OU briefId nullifié cascade)

import { prisma } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type {
  BriefSnapshot,
  BriefSnapshotReader,
  TravelFamiliarity,
  TravelSpeciality,
} from '../application/ports/brief-snapshot-reader.port';
import { parseFsaFromPostalCode } from '../domain/value-objects/fsa-code.vo';

@Injectable()
export class PrismaBriefSnapshotReader implements BriefSnapshotReader {
  async readByBriefId(briefId: string): Promise<BriefSnapshot | null> {
    const brief = await prisma.voyageurBrief.findUnique({
      where: { id: briefId },
      include: { voyageurContact: true },
    });
    if (!brief) return null;
    // Brief activé requis pour matching (pending_verification exclu)
    if (brief.status !== 'active' && brief.status !== 'matched') return null;
    if (!brief.voyageurContact) return null;

    const fsa = parseFsaFromPostalCode(brief.voyageurContact.postalCode ?? null);
    const destinations =
      (brief.destinations as Array<{ country?: string; region?: string }> | null) ?? [];

    return {
      briefId: brief.id,
      destinations: destinations
        .filter((d): d is { country: string; region?: string } => typeof d.country === 'string')
        .map((d) =>
          d.region === undefined
            ? { country: d.country }
            : { country: d.country, region: d.region },
        ),
      conseillerLanguage: brief.conseillerLanguage === 'en' ? 'en' : 'fr', // les autres enum tombent en 'fr' par défaut
      speciality: brief.speciality as TravelSpeciality,
      familiarity: brief.familiarity as TravelFamiliarity,
      voyageurFsa: fsa,
      // T070 (Phase 4 US2) : populer depuis brief.suggestedConseillerId
      // une fois le champ ajouté à intake_voyageur_briefs.
      suggestedConseillerId: null,
    };
  }
}
