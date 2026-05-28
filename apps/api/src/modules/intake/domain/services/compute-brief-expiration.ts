// T041 [TDD GREEN] — Service computeBriefExpiration.
// FR-024 : J+90 par défaut (env INTAKE_BRIEF_EXPIRATION_DAYS).
// Pure / stable / déterministe — aucun appel à `new Date()` interne.

const DEFAULT_EXPIRATION_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface ComputeInput {
  readonly submittedAt: Date;
  readonly expirationDays?: number;
}

export function computeBriefExpiration(input: ComputeInput): Date {
  const days = input.expirationDays ?? DEFAULT_EXPIRATION_DAYS;
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error(
      `computeBriefExpiration : expirationDays doit être un entier > 0 (reçu ${days}).`,
    );
  }
  return new Date(input.submittedAt.getTime() + days * MS_PER_DAY);
}
