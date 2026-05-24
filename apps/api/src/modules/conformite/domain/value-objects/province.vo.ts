// T035 — Value Object Province (juridiction du certificat / permis).
// QC = Office de la protection du consommateur (certificat CCV).
// ON = Travel Industry Council of Ontario (enregistrement TICO).

export const PROVINCES = ['QC', 'ON'] as const;

export type Province = (typeof PROVINCES)[number];

export function isValidProvince(value: string): value is Province {
  return (PROVINCES as readonly string[]).includes(value);
}
