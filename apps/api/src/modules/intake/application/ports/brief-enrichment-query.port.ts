// T005 [016] — Port PUBLIC BriefEnrichmentQueryPort.
//
// Surface inter-module : SEULE interface par laquelle le matching (011) lit
// l'enrichi (Principe V). Le matching ne touche jamais la table. Retourne une
// vue minimale (aucun texte libre / PII / montant) — cf. contracts/brief-enrichment.port.md.

import type { BriefEnrichmentView } from '@cv/shared/intake';

export interface BriefEnrichmentQueryPort {
  /** `null` si aucun enrichissement → le matching procède en déterministe. */
  getByBriefId(briefId: string): Promise<BriefEnrichmentView | null>;
}

export const BRIEF_ENRICHMENT_QUERY_PORT = Symbol.for('BriefEnrichmentQueryPort');
