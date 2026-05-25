// T036 — Value Object PermitNumber.
// Numéro de permis OPC (Québec) ou TICO (Ontario) saisi par le conseiller
// au moment de déclarer une affiliation (clarification Q1 — saisie texte
// libre, validation manuelle par admin).
//
// Normalisation systématique : trim + uppercase. C'est le **regroupement
// canonique** pour FR-015 (cascade retrait de permis), donc deux saisies
// différemment cassées doivent collisionner.
//
// Format MVP : non-vide, ≤ 50 chars. Les formats provinciaux exacts
// (OPC : 5 chiffres, TICO : 7 chiffres) seront validés ultérieurement
// quand on intégrera les registres publics (cf. recherche R1, alternative
// considérée).

import type { Province } from './province.vo';

const MAX_LENGTH = 50;

export class PermitNumber {
  private constructor(
    public readonly value: string,
    public readonly province: Province,
  ) {}

  static parse(raw: string, province: Province): PermitNumber {
    const normalized = raw.trim().toUpperCase();
    if (normalized.length === 0) {
      throw new Error('PermitNumber: cannot be empty.');
    }
    if (normalized.length > MAX_LENGTH) {
      throw new Error(`PermitNumber: max ${MAX_LENGTH} characters.`);
    }
    return new PermitNumber(normalized, province);
  }

  /** Égalité par valeur normalisée + province (clé canonique de regroupement FR-015). */
  equals(other: PermitNumber): boolean {
    return this.value === other.value && this.province === other.province;
  }

  toString(): string {
    return `${this.province}:${this.value}`;
  }
}
