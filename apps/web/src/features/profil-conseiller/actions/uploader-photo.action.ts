// Server Action — upload de la photo profil conseiller (T064, US1).
// POST multipart vers /api/profil/photo — l'API NestJS valide le content
// type, la taille, et stocke vers S3 ca-central-1 (ADR-0001).

'use server';

import { MAX_PHOTO_SIZE_BYTES } from '@cv/profil-domain/dtos';
import { revalidatePath } from 'next/cache';
import { PROFIL_API_BASE_URL, getSessionCookieHeader, hasCode } from '../lib/api';

export type UploaderPhotoResult =
  | {
      readonly kind: 'ok';
      readonly photoUrlPublique: string;
      readonly photoWidth: number;
      readonly photoHeight: number;
    }
  | { readonly kind: 'taille_depasse'; readonly tailleOctets: number }
  | { readonly kind: 'format_non_supporte' }
  | { readonly kind: 'contenu_non_image' }
  | { readonly kind: 'dimensions_depasse' }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'storage_hs' }
  | { readonly kind: 'error'; readonly message: string };

export async function uploaderPhotoAction(formData: FormData): Promise<UploaderPhotoResult> {
  const cookieHeader = await getSessionCookieHeader();
  if (!cookieHeader) return { kind: 'unauthorized' };
  const file = formData.get('file');
  if (!(file instanceof File)) return { kind: 'error', message: 'Aucun fichier reçu' };
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    return { kind: 'taille_depasse', tailleOctets: file.size };
  }
  const { status, data } = await postPhotoMultipart(file, cookieHeader);
  return mapUploadResponse(status, data, file.size);
}

async function postPhotoMultipart(
  file: File,
  cookieHeader: string,
): Promise<{ status: number; data: unknown }> {
  const fd = new FormData();
  fd.set('file', file, file.name);
  const res = await fetch(`${PROFIL_API_BASE_URL}/api/profil/photo`, {
    method: 'POST',
    headers: { Cookie: cookieHeader },
    body: fd,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

type PhotoOkData = { photoUrlPublique: string; photoWidth: number; photoHeight: number };
function isPhotoOk(data: unknown): data is PhotoOkData {
  return typeof data === 'object' && data !== null && 'photoUrlPublique' in data;
}

function mapUploadResponse(status: number, data: unknown, fileSize: number): UploaderPhotoResult {
  if (status === 200 && isPhotoOk(data)) {
    revalidatePath('/[locale]/conseiller/profil', 'page');
    return {
      kind: 'ok',
      photoUrlPublique: data.photoUrlPublique,
      photoWidth: data.photoWidth,
      photoHeight: data.photoHeight,
    };
  }
  const STATUS_MAP: Record<number, UploaderPhotoResult> = {
    401: { kind: 'unauthorized' },
    413: { kind: 'taille_depasse', tailleOctets: fileSize },
    415: { kind: 'format_non_supporte' },
    409: { kind: 'conflict' },
    503: { kind: 'storage_hs' },
  };
  const mapped = STATUS_MAP[status];
  if (mapped) return mapped;
  if (status === 422 && hasCode(data, 'CONTENU_NON_IMAGE')) return { kind: 'contenu_non_image' };
  if (status === 422 && hasCode(data, 'DIMENSIONS_DEPASSE')) return { kind: 'dimensions_depasse' };
  return { kind: 'error', message: `Erreur ${status}` };
}
