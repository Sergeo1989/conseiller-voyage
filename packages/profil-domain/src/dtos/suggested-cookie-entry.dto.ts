// Schéma Zod pour valider une entrée individuelle du cookie cv_suggested.
// Utilisé à la soumission de l'intake (feature 008 future) pour rejeter
// les entrées dont le format est devenu invalide entre temps.

import { z } from 'zod';

export const SuggestedCookieEntryDto = z.object({
  cid: z.string().uuid({ message: 'conseillerId doit être un UUID v4 valide' }),
  ts: z.number().int().positive(),
});

export type SuggestedCookieEntryDtoType = z.infer<typeof SuggestedCookieEntryDto>;
