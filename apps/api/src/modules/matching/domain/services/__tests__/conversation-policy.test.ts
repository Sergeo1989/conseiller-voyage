// T004 [US-foundational] [TDD RED] — Politique de conversation (fonctions PURES,
// Principe VI). Autorisation d'écriture (canWrite), validation message/pièce jointe.
// Écrit ROUGE avant l'implémentation.

import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ATTACHMENT_MIME,
  MAX_ATTACHMENT_BYTES,
  MAX_MESSAGE_LENGTH,
  canWrite,
  validateAttachment,
  validateMessage,
} from '../conversation-policy';

describe('canWrite (FR-005)', () => {
  it('autorise si lead post-acceptation non terminal-négatif ET conseiller vérifié', () => {
    expect(canWrite('accepte', true)).toBe(true);
    expect(canWrite('devis_envoye', true)).toBe(true);
    expect(canWrite('reservation_confirmee', true)).toBe(true);
  });

  it('refuse si conseiller non vérifié (re-filtrage dynamique)', () => {
    expect(canWrite('accepte', false)).toBe(false);
  });

  it('refuse avant acceptation (envoye, vu) et sur terminal-négatif (refuse, perdu)', () => {
    expect(canWrite('envoye', true)).toBe(false);
    expect(canWrite('vu', true)).toBe(false);
    expect(canWrite('refuse', true)).toBe(false);
    expect(canWrite('perdu', true)).toBe(false);
  });
});

describe('validateMessage (FR-017)', () => {
  it('accepte un corps non vide et trim', () => {
    expect(validateMessage('  Bonjour  ')).toEqual({ ok: true, value: 'Bonjour' });
  });

  it('refuse un corps vide / espaces seulement', () => {
    expect(validateMessage('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(validateMessage('')).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuse au-delà de la longueur max', () => {
    const tooLong = 'a'.repeat(MAX_MESSAGE_LENGTH + 1);
    expect(validateMessage(tooLong)).toEqual({ ok: false, reason: 'too_long' });
  });
});

describe('validateAttachment (FR-008)', () => {
  it('accepte un type autorisé sous la taille max', () => {
    expect(validateAttachment('application/pdf', 1024)).toEqual({ ok: true });
    for (const mime of ALLOWED_ATTACHMENT_MIME) {
      expect(validateAttachment(mime, 1).ok).toBe(true);
    }
  });

  it('refuse un type non autorisé', () => {
    expect(validateAttachment('application/x-msdownload', 10)).toEqual({
      ok: false,
      reason: 'type',
    });
  });

  it('refuse un fichier trop volumineux ou vide', () => {
    expect(validateAttachment('application/pdf', MAX_ATTACHMENT_BYTES + 1)).toEqual({
      ok: false,
      reason: 'too_large',
    });
    expect(validateAttachment('application/pdf', 0)).toEqual({ ok: false, reason: 'empty' });
  });
});
