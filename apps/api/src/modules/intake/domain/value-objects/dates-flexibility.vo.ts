// T033 [TDD GREEN] — Value Object DatesFlexibility.
// FR-003 : bool flexible + amplitude conditionnel 1-30j si flexible=true.

export type DatesFlexibility =
  | { readonly flexible: false }
  | { readonly flexible: true; readonly flexibilityDays: number };

interface DatesFlexibilityInput {
  flexible: boolean;
  flexibilityDays?: number;
}

const MIN_FLEXIBILITY_DAYS = 1;
const MAX_FLEXIBILITY_DAYS = 30;

export function create(input: DatesFlexibilityInput): DatesFlexibility {
  if (input.flexible === false) {
    if (input.flexibilityDays !== undefined) {
      throw new Error(
        'DatesFlexibility : flexible=false ne doit pas avoir flexibilityDays renseigné.',
      );
    }
    return { flexible: false };
  }

  // flexible=true
  if (input.flexibilityDays === undefined) {
    throw new Error('DatesFlexibility : flexible=true exige flexibilityDays (1-30).');
  }
  if (!Number.isInteger(input.flexibilityDays)) {
    throw new Error('DatesFlexibility : flexibilityDays doit être un entier.');
  }
  if (
    input.flexibilityDays < MIN_FLEXIBILITY_DAYS ||
    input.flexibilityDays > MAX_FLEXIBILITY_DAYS
  ) {
    throw new Error(
      `DatesFlexibility : flexibilityDays doit être entre ${MIN_FLEXIBILITY_DAYS} et ${MAX_FLEXIBILITY_DAYS} (reçu ${input.flexibilityDays}).`,
    );
  }
  return { flexible: true, flexibilityDays: input.flexibilityDays };
}

export function isFlexible(vo: DatesFlexibility): boolean {
  return vo.flexible;
}
