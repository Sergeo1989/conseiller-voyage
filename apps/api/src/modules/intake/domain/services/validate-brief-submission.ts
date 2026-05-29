// T043 [TDD GREEN] — Service validateBriefSubmission.
// Règles métier au-delà du Zod schema (qui vérifie la structure) :
//   - date de départ pas dans le passé
//   - date de retour > date de départ (redondant avec Zod, défense en
//     profondeur côté domaine)
//   - voyage < 3 ans dans le futur
//   - destinations non vides
//   - adultsCount ≥ 1
// Pure (prend `now` en input pour être testable).

const MAX_YEARS_IN_FUTURE = 3;

interface ValidateInput {
  readonly departureDate: Date;
  readonly returnDate: Date;
  readonly destinations: ReadonlyArray<{ readonly country: string }>;
  readonly adultsCount: number;
  readonly childrenAges: ReadonlyArray<number>;
  readonly infantsCount: number;
  readonly now: Date;
}

export function validateBriefSubmission(input: ValidateInput): void {
  if (input.destinations.length === 0) {
    throw new Error('validateBriefSubmission : au moins une destination requise.');
  }

  if (input.adultsCount < 1) {
    throw new Error('validateBriefSubmission : au moins un adulte requis.');
  }

  if (input.returnDate.getTime() <= input.departureDate.getTime()) {
    throw new Error(
      'validateBriefSubmission : la date de retour doit être strictement après la date de départ.',
    );
  }

  // Date de départ pas dans le passé (au jour près — on tolère la même
  // journée par rapport à `now` pour éviter les off-by-one timezone).
  const startOfTodayUtc = new Date(
    Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate()),
  );
  if (input.departureDate.getTime() < startOfTodayUtc.getTime()) {
    throw new Error('validateBriefSubmission : la date de départ est dans le passé.');
  }

  // Voyage < 3 ans dans le futur.
  const maxFutureDate = new Date(
    Date.UTC(
      input.now.getUTCFullYear() + MAX_YEARS_IN_FUTURE,
      input.now.getUTCMonth(),
      input.now.getUTCDate(),
    ),
  );
  if (input.departureDate.getTime() > maxFutureDate.getTime()) {
    throw new Error(
      'validateBriefSubmission : la date de départ est > 3 ans dans le futur (too far).',
    );
  }
}
