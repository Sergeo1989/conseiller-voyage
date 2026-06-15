// T005 [016] — Port PUBLIC BriefEnrichmentQueryPort.
//
// L'interface + le symbole vivent dans @cv/shared/intake (surface inter-module,
// Principe V) pour que le matching les importe sans import profond cross-module.
// Ce fichier les re-exporte pour le barrel des ports intake.

export {
  BRIEF_ENRICHMENT_QUERY_PORT,
  type BriefEnrichmentQueryPort,
} from '@cv/shared/intake';
