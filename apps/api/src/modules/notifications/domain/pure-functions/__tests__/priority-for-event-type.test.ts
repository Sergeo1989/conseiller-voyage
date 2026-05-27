// T023 — Tests Vitest priorityForEventType.

import { describe, expect, test } from 'vitest';
import {
  PRIORITY_BATCH,
  PRIORITY_CRITICAL,
  priorityForEventType,
} from '../priority-for-event-type';

describe('priorityForEventType — feature 003', () => {
  test('auth.email_verification → critique', () => {
    expect(priorityForEventType('auth.email_verification')).toBe(PRIORITY_CRITICAL);
  });

  test('auth.password_reset → critique', () => {
    expect(priorityForEventType('auth.password_reset')).toBe(PRIORITY_CRITICAL);
  });

  test('auth.admin_invitation → critique', () => {
    expect(priorityForEventType('auth.admin_invitation')).toBe(PRIORITY_CRITICAL);
  });

  test('mfa.totp_activated → critique', () => {
    expect(priorityForEventType('mfa.totp_activated')).toBe(PRIORITY_CRITICAL);
  });

  test('mfa.stepup_session_killed → critique', () => {
    expect(priorityForEventType('mfa.stepup_session_killed')).toBe(PRIORITY_CRITICAL);
  });

  test('conformite.expiration_reminder_j30 → batch', () => {
    expect(priorityForEventType('conformite.expiration_reminder_j30')).toBe(PRIORITY_BATCH);
  });

  test('conformite.expiration_reminder_j1 → batch', () => {
    expect(priorityForEventType('conformite.expiration_reminder_j1')).toBe(PRIORITY_BATCH);
  });

  test('conformite.dossier_approved → batch (notification mais pas attente live)', () => {
    expect(priorityForEventType('conformite.dossier_approved')).toBe(PRIORITY_BATCH);
  });

  test('eventType inconnu → batch (conservative default)', () => {
    expect(priorityForEventType('unknown.something')).toBe(PRIORITY_BATCH);
    expect(priorityForEventType('')).toBe(PRIORITY_BATCH);
  });

  test('eventType auth/mfa avec suffixe → quand même critique', () => {
    expect(priorityForEventType('auth.email_verification.requested')).toBe(PRIORITY_CRITICAL);
  });

  test('match exact requis (pas de match partiel arbitraire)', () => {
    // `auth.something_else` n'est pas dans la liste → batch
    expect(priorityForEventType('auth.something_else')).toBe(PRIORITY_BATCH);
  });

  test('constantes exposées', () => {
    expect(PRIORITY_CRITICAL).toBe(1);
    expect(PRIORITY_BATCH).toBe(10);
  });
});
