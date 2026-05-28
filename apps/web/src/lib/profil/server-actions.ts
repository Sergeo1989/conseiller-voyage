// Server Actions Next.js pour la feature 007 US1 (profil conseiller).
//
// T063 editerProfilAction : POST /api/profil — édition partielle.
// T064 uploaderPhotoAction : POST /api/profil/photo — multipart.
//
// Le cookie de session Auth.js est forwardé en header Cookie vers l'API
// NestJS, qui le valide via AuthGuard + RoleGuard('conseiller').

'use server';

import { EditerProfilDto, MAX_PHOTO_SIZE_BYTES } from '@cv/profil-domain/dtos';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const SESSION_COOKIE_NAME_DEV = 'authjs.session-token';
const SESSION_COOKIE_NAME_PROD = '__Host-cv.session.token';

async function getSessionCookieHeader(): Promise<string | null> {
  const store = await cookies();
  const isProd = process.env.NODE_ENV === 'production';
  const cookieName = isProd ? SESSION_COOKIE_NAME_PROD : SESSION_COOKIE_NAME_DEV;
  const value = store.get(cookieName)?.value;
  if (!value) return null;
  return `${cookieName}=${value}`;
}

// ---------------------------------------------------------------------
// editerProfilAction (T063)
// ---------------------------------------------------------------------

export type EditerProfilResult =
  | {
      readonly kind: 'ok';
      readonly statut: 'incomplet' | 'pret' | 'masque_admin';
      readonly slug: string | null;
      readonly publishedAt: string | null;
    }
  | { readonly kind: 'validation_error'; readonly champ: string; readonly messageFr: string }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'conflict'; readonly code: 'PROFIL_ANONYMISE' | 'PROFIL_NOT_FOUND' }
  | { readonly kind: 'service_unavailable' }
  | { readonly kind: 'error'; readonly message: string };

export async function editerProfilAction(formData: FormData): Promise<EditerProfilResult> {
  const cookieHeader = await getSessionCookieHeader();
  if (!cookieHeader) return { kind: 'unauthorized' };

  const body = buildBodyFromFormData(formData);
  const parsed = EditerProfilDto.safeParse(body);
  if (!parsed.success) return toClientValidationError(parsed.error);

  const { status, data } = await postJson('/api/profil', parsed.data, cookieHeader);
  return mapEditerProfilResponse(status, data);
}

function toClientValidationError(error: {
  issues: { path: (string | number)[]; message: string }[];
}): EditerProfilResult {
  const issue = error.issues[0];
  return {
    kind: 'validation_error',
    champ: issue?.path.join('.') ?? 'unknown',
    messageFr: issue?.message ?? 'Validation échouée',
  };
}

async function postJson(
  path: string,
  body: unknown,
  cookieHeader: string,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

type EditerProfilOkData = {
  statut: 'incomplet' | 'pret' | 'masque_admin';
  slug: string | null;
  publishedAt: string | null;
};

function mapEditerProfilResponse(status: number, data: unknown): EditerProfilResult {
  if (status === 200 && isOkData(data)) {
    revalidatePath('/[locale]/conseiller', 'layout');
    if (data.slug) revalidatePath(`/[locale]/conseiller/${data.slug}`, 'page');
    return { kind: 'ok', statut: data.statut, slug: data.slug, publishedAt: data.publishedAt };
  }
  return mapEditerErrorStatus(status, data);
}

function mapEditerErrorStatus(status: number, data: unknown): EditerProfilResult {
  if (status === 401) return { kind: 'unauthorized' };
  if (status === 503) return { kind: 'service_unavailable' };
  if (status === 400 && hasCode(data, 'VALIDATION_FAILED')) {
    return toValidationFromBody(data);
  }
  if (status === 409) {
    const conflict = mapConflict(data);
    if (conflict) return conflict;
  }
  return { kind: 'error', message: `Erreur ${status}` };
}

function toValidationFromBody(data: unknown): EditerProfilResult {
  const d = data as { champ?: string; messageFr?: string };
  return {
    kind: 'validation_error',
    champ: d.champ ?? 'unknown',
    messageFr: d.messageFr ?? 'Validation échouée',
  };
}

function mapConflict(data: unknown): EditerProfilResult | null {
  if (hasCode(data, 'PROFIL_ANONYMISE')) return { kind: 'conflict', code: 'PROFIL_ANONYMISE' };
  if (hasCode(data, 'PROFIL_NOT_FOUND')) return { kind: 'conflict', code: 'PROFIL_NOT_FOUND' };
  return null;
}

function isOkData(data: unknown): data is EditerProfilOkData {
  return typeof data === 'object' && data !== null && 'statut' in data;
}

function hasCode(data: unknown, code: string): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'code' in data &&
    (data as { code: unknown }).code === code
  );
}

function buildBodyFromFormData(formData: FormData): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const titre = formData.get('titre');
  if (titre !== null) body.titre = String(titre);
  const biographie = formData.get('biographie');
  if (biographie !== null) body.biographie = String(biographie);
  const annees = formData.get('anneesExperience');
  if (annees !== null && annees !== '') body.anneesExperience = Number(annees);
  const afficherNomComplet = formData.get('afficherNomComplet');
  if (afficherNomComplet !== null)
    body.afficherNomComplet = afficherNomComplet === 'true' || afficherNomComplet === 'on';
  const specialites = formData.getAll('specialitesCodes').map(String);
  if (specialites.length > 0) body.specialitesCodes = specialites;
  const langues = formData.getAll('languesCodes').map(String);
  if (langues.length > 0) body.languesCodes = langues;
  const zones = formData.getAll('zonesGeographiquesCodes').map(String);
  if (zones.length > 0) body.zonesGeographiquesCodes = zones;
  return body;
}

// ---------------------------------------------------------------------
// uploaderPhotoAction (T064)
// ---------------------------------------------------------------------

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
  const res = await fetch(`${API_BASE_URL}/api/profil/photo`, {
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

// ---------------------------------------------------------------------
// lireProfilPriveAction (helper RSC — pour la page édition)
// ---------------------------------------------------------------------

export interface ProfilPriveDto {
  readonly profilId: string;
  readonly authUserId: string;
  readonly titre: string | null;
  readonly biographie: string | null;
  readonly anneesExperience: number | null;
  readonly afficherNomComplet: boolean;
  readonly specialitesCodes: readonly string[];
  readonly languesCodes: readonly string[];
  readonly zonesGeographiquesCodes: readonly string[];
  readonly photoUrlPublique: string | null;
  readonly photoWidth: number | null;
  readonly photoHeight: number | null;
  readonly nomLegal: { prenom: string; nom: string };
  readonly nomAffiche: string;
  readonly slug: string | null;
  readonly statut: 'incomplet' | 'pret' | 'masque_admin';
  readonly raisonMasquageAdmin: string | null;
  readonly verifie: boolean;
  readonly lastVerifiedAt: string | null;
  readonly champsManquants: readonly string[];
}

// ---------------------------------------------------------------------
// Page publique (US2) — pas d'auth, anti-énumération côté API
// ---------------------------------------------------------------------

// Note : `lireProfilPublicBySlug` + `lireSlugsPubliables` + le type
// `ProfilPublicPayloadDto` ont été DÉPLACÉS vers lib/profil/public-reader.ts
// pour éviter DYNAMIC_SERVER_USAGE (les Server Actions sont toujours
// dynamiques, conflit avec `export const revalidate = 300` de la page slug).
// Les caller (page.tsx, sitemap.ts, opengraph-image.tsx) importent depuis
// public-reader.ts directement.

// ---------------------------------------------------------------------
// Aperçu (US4)
// ---------------------------------------------------------------------

export interface ProfilApercuDto {
  readonly payloadPublic: {
    readonly conseillerId: string;
    readonly slug: string | null;
    readonly nomAffiche: string;
    readonly titre: string | null;
    readonly biographie: string | null;
    readonly photoUrlPublique: string | null;
    readonly photoWidth: number | null;
    readonly photoHeight: number | null;
    readonly specialitesCodes: readonly string[];
    readonly languesCodes: readonly string[];
    readonly zonesGeographiquesCodes: readonly string[];
    readonly anneesExperience: number | null;
    readonly verifieOPCTICO: boolean;
  };
  readonly bandeauApercu: {
    readonly type: 'profil_incomplet' | 'non_verifie' | 'masque_admin' | 'anonymise';
    readonly elementsManquants: readonly string[];
    readonly raisonMasquage: string | null;
  } | null;
}

export async function lireProfilApercuAction(): Promise<ProfilApercuDto | null> {
  const cookieHeader = await getSessionCookieHeader();
  if (!cookieHeader) return null;
  const res = await fetch(`${API_BASE_URL}/api/profil/apercu`, {
    method: 'GET',
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
  });
  if (res.status !== 200) return null;
  return (await res.json().catch(() => null)) as ProfilApercuDto | null;
}

export async function lireProfilPriveAction(): Promise<ProfilPriveDto | null> {
  const cookieHeader = await getSessionCookieHeader();
  if (!cookieHeader) return null;
  const res = await fetch(`${API_BASE_URL}/api/profil/me`, {
    method: 'GET',
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
  });
  if (res.status !== 200) return null;
  const data = (await res.json().catch(() => null)) as ProfilPriveDto | null;
  return data;
}
