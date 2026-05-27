// Schéma Zod pour POST /api/profil (édition partielle).
// Cf. contracts/profil-edition.port.md.

import { z } from 'zod';

export const EditerProfilDto = z.object({
  titre: z
    .string()
    .max(80, { message: 'Le titre ne doit pas dépasser 80 caractères' })
    .nullable()
    .optional(),
  biographie: z
    .string()
    .min(100, { message: 'La biographie doit faire au moins 100 caractères' })
    .max(2000, { message: 'La biographie ne doit pas dépasser 2000 caractères' })
    .nullable()
    .optional(),
  specialitesCodes: z
    .array(z.string())
    .min(1, { message: 'Sélectionnez au moins une spécialité' })
    .max(8, { message: 'Maximum 8 spécialités' })
    .optional(),
  languesCodes: z
    .array(z.string())
    .min(1, { message: 'Sélectionnez au moins une langue' })
    .max(6, { message: 'Maximum 6 langues' })
    .optional(),
  zonesGeographiquesCodes: z
    .array(z.string())
    .min(1, { message: 'Sélectionnez au moins une zone géographique' })
    .max(12, { message: 'Maximum 12 zones géographiques' })
    .optional(),
  anneesExperience: z
    .number()
    .int()
    .min(0, { message: "L'expérience ne peut pas être négative" })
    .max(60, { message: "L'expérience ne peut pas dépasser 60 ans" })
    .nullable()
    .optional(),
  afficherNomComplet: z.boolean().optional(),
});

export type EditerProfilDtoType = z.infer<typeof EditerProfilDto>;
