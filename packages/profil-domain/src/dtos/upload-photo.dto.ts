// Schéma Zod pour POST /api/profil/photo.
// Note : la validation de format (JPEG/PNG/WebP) et de contenu (magic
// number) est faite par `detecterFormatImage` côté use case, pas via Zod
// (Zod ne valide pas les buffers binaires). Zod valide ici la déclaration
// content-type et la taille.

import { z } from 'zod';

export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo
export const ALLOWED_PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const UploadPhotoDto = z.object({
  declaredContentType: z.enum(ALLOWED_PHOTO_CONTENT_TYPES, {
    message: 'Format non supporté (JPEG, PNG ou WebP uniquement)',
  }),
  // Note : le buffer est passé hors Zod (multipart middleware). Cette
  // déclaration sert pour les metadata uniquement.
});

export type UploadPhotoDtoType = z.infer<typeof UploadPhotoDto>;
