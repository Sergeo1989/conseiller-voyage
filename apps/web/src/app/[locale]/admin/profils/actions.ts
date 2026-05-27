// T124 — Server Actions admin modération profil (feature 007 US6).
//
// Appellent ProfilAdminController côté API NestJS via apiClient.
// revalidatePath rafraîchit la file + détail après action.

'use server';

import { revalidatePath } from 'next/cache';
import { toUrlLocale } from '../../../../i18n';
import { apiClient } from '../../../_lib/api-client';

export type AdminActionResult = { ok: true } | { ok: false; error: string };

interface ActionInput {
  readonly profilId: string;
  readonly raison: string;
  readonly locale: string;
}

interface RetablirInput {
  readonly profilId: string;
  readonly raison?: string;
  readonly locale: string;
}

function validateRaison(raison: string): { ok: true } | { ok: false; error: string } {
  if (raison.trim().length < 10) {
    return {
      ok: false,
      error: 'La raison doit faire au moins 10 caractères (audit Loi 25).',
    };
  }
  return { ok: true };
}

async function callAction(
  profilId: string,
  endpoint: 'retirer-photo' | 'masquer' | 'retablir',
  body: Record<string, unknown>,
  locale: string,
): Promise<AdminActionResult> {
  const urlLocale = toUrlLocale(locale);
  const res = await apiClient.post<{ ok: true } | Record<string, unknown>>(
    `/api/admin/profils/${profilId}/${endpoint}`,
    body,
  );
  if (!res.ok) {
    return { ok: false, error: extractApiError(res.errorBody) };
  }
  revalidatePath(`/${urlLocale}/admin/profils`);
  revalidatePath(`/${urlLocale}/admin/profils/${profilId}`);
  return { ok: true };
}

export async function retirerPhotoAction(input: ActionInput): Promise<AdminActionResult> {
  const validation = validateRaison(input.raison);
  if (!validation.ok) return validation;
  return callAction(input.profilId, 'retirer-photo', { raison: input.raison }, input.locale);
}

export async function masquerProfilAction(input: ActionInput): Promise<AdminActionResult> {
  const validation = validateRaison(input.raison);
  if (!validation.ok) return validation;
  return callAction(input.profilId, 'masquer', { raison: input.raison }, input.locale);
}

export async function retablirProfilAction(input: RetablirInput): Promise<AdminActionResult> {
  return callAction(
    input.profilId,
    'retablir',
    input.raison ? { raison: input.raison } : {},
    input.locale,
  );
}

function extractApiError(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    if (typeof b.code === 'string') {
      return mapCodeToMessageFr(b.code);
    }
    if (typeof b.message === 'string') return b.message;
  }
  return 'Erreur API inattendue. Réessayez ou consultez les logs.';
}

function mapCodeToMessageFr(code: string): string {
  const messages: Record<string, string> = {
    PROFIL_NOT_FOUND: 'Profil introuvable.',
    PROFIL_ANONYMISE: "Profil anonymisé Loi 25 — action irrévocable, impossible de l'annuler.",
    AUCUNE_PHOTO: "Ce profil n'a pas de photo à retirer.",
    DEJA_MASQUE: 'Ce profil est déjà masqué.',
    PAS_MASQUE: "Ce profil n'est pas masqué — rien à rétablir.",
    RAISON_TROP_COURTE: 'La raison doit faire au moins 10 caractères.',
    STEP_UP_REQUIRED: 'Authentification step-up MFA requise pour cette action destructive.',
  };
  return messages[code] ?? `Erreur ${code}.`;
}
