// T005 [TDD GREEN] — Politique de conversation (fonctions PURES, Principe VI).
// Sans I/O, déterministe. Source d'autorité de l'autorisation d'écriture et de
// la validation des messages / pièces jointes. Anti-marketplace : ne manipule
// jamais de montant — les pièces jointes sont opaques (type/poids seulement).

import type { LeadState } from '@cv/shared/matching';

// États du lead où l'écriture est permise (post-acceptation, non terminal-négatif).
export const WRITABLE_LEAD_STATES: readonly LeadState[] = [
  'accepte',
  'devis_envoye',
  'reservation_confirmee',
];

/**
 * Autorise l'écriture dans un fil ssi le lead est dans un état post-acceptation
 * non terminal-négatif ET le conseiller est vérifié au moment de l'action
 * (re-filtrage dynamique, FR-005). Lecture seule sinon.
 */
export function canWrite(leadState: LeadState, conseillerVerifie: boolean): boolean {
  return conseillerVerifie && WRITABLE_LEAD_STATES.includes(leadState);
}

// ---------------------------------------------------------------------------
// Validation des messages (FR-017)
// ---------------------------------------------------------------------------

export const MAX_MESSAGE_LENGTH = 4000;

export type MessageValidation =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: 'empty' | 'too_long' };

export function validateMessage(body: string): MessageValidation {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };
  if (trimmed.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: 'too_long' };
  return { ok: true, value: trimmed };
}

// ---------------------------------------------------------------------------
// Validation des pièces jointes (FR-008) — devis = fichier opaque, AUCUN montant
// ---------------------------------------------------------------------------

export const ALLOWED_ATTACHMENT_MIME: readonly string[] = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
];

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 Mo

export type AttachmentValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'type' | 'too_large' | 'empty' };

export function validateAttachment(mimeType: string, sizeBytes: number): AttachmentValidation {
  if (!ALLOWED_ATTACHMENT_MIME.includes(mimeType)) return { ok: false, reason: 'type' };
  if (sizeBytes <= 0) return { ok: false, reason: 'empty' };
  if (sizeBytes > MAX_ATTACHMENT_BYTES) return { ok: false, reason: 'too_large' };
  return { ok: true };
}
