// Schéma Zod pour POST /api/admin/profils/:id/masquer et retirer-photo.
// La raison est obligatoire (FR-023).

import { z } from 'zod';

const RAISON_MIN_LENGTH = 10;
const RAISON_MAX_LENGTH = 1000;

export const MasquerProfilDto = z.object({
  raison: z
    .string()
    .min(RAISON_MIN_LENGTH, {
      message: `La raison doit faire au moins ${RAISON_MIN_LENGTH} caractères`,
    })
    .max(RAISON_MAX_LENGTH, {
      message: `La raison ne doit pas dépasser ${RAISON_MAX_LENGTH} caractères`,
    }),
});

export type MasquerProfilDtoType = z.infer<typeof MasquerProfilDto>;

// Rétablissement : raison optionnelle (FR-023 plan).
export const RetablirProfilDto = z.object({
  raison: z.string().max(RAISON_MAX_LENGTH).optional(),
});

export type RetablirProfilDtoType = z.infer<typeof RetablirProfilDto>;
