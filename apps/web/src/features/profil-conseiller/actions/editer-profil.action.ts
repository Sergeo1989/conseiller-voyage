// Server Action — édition partielle du profil conseiller (T063, US1).

'use server';

import { EditerProfilDto } from '@cv/profil-domain/dtos';
import { revalidatePath } from 'next/cache';
import { PROFIL_API_BASE_URL, getSessionCookieHeader, hasCode } from '../lib/api';

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
  const res = await fetch(`${PROFIL_API_BASE_URL}${path}`, {
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
