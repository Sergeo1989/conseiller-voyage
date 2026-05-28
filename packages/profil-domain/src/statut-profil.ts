// T017 — Calcul du statut profil dérivé + complétude des champs obligatoires.
//
// Statut persisté (data-model.md M6) mais recalculé à chaque transition via
// les use cases (EditerProfilUseCase, UploaderPhotoUseCase, etc.). Le port
// public EstProfilPublicPort lit cette valeur sans recalculer.
//
// Règles d'override (anti-régression de l'invariant Loi 25 + admin) :
//   1. anonymise → terminal, override TOUT le reste (FR-016)
//   2. masqueAdmin → override calcul dérivé (FR-023)
//   3. verifie + profilComplet → pret (FR-003)
//   4. sinon → incomplet (FR-003)

export type StatutProfil = 'incomplet' | 'pret' | 'masque_admin' | 'anonymise';

export interface CalculerStatutInput {
  /** Conseiller en statut conformité `verified` (lu via ConformiteQueryPort). */
  readonly verifie: boolean;
  /** Tous les champs obligatoires du profil sont remplis (cf. profilEstComplet). */
  readonly profilComplet: boolean;
  /** Profil masqué administrativement (FR-023). */
  readonly masqueAdmin: boolean;
  /** Profil anonymisé Loi 25 (FR-016, terminal). */
  readonly anonymise: boolean;
}

/**
 * Calcule le statut effectif d'un profil à partir des 4 booléens.
 *
 * Fonction pure : entrées identiques → sortie identique.
 */
export function calculerStatutProfil(input: CalculerStatutInput): StatutProfil {
  // 1. anonymise est terminal — override tout
  if (input.anonymise) return 'anonymise';
  // 2. masqueAdmin override le calcul dérivé
  if (input.masqueAdmin) return 'masque_admin';
  // 3. pret si verifie + complet
  if (input.verifie && input.profilComplet) return 'pret';
  // 4. sinon incomplet
  return 'incomplet';
}

export interface ProfilCompletudeInput {
  readonly titre: string | null;
  readonly biographie: string | null;
  readonly specialitesCount: number;
  readonly languesCount: number;
  readonly zonesGeographiquesCount: number;
  readonly anneesExperience: number | null;
  readonly photoS3Key: string | null;
}

const BIOGRAPHIE_MIN_LENGTH = 100;

/**
 * Détermine si tous les champs OBLIGATOIRES d'un profil sont remplis
 * (FR-001).
 *
 * Champs obligatoires : titre (non-vide), biographie (≥ 100 chars),
 * ≥ 1 spécialité, ≥ 1 langue, ≥ 1 zone, années d'expérience renseignées,
 * photo uploadée.
 *
 * Fonction pure.
 */
export function profilEstComplet(input: ProfilCompletudeInput): boolean {
  const checks = [
    isNonEmptyString(input.titre),
    isBiographieValide(input.biographie),
    input.specialitesCount >= 1,
    input.languesCount >= 1,
    input.zonesGeographiquesCount >= 1,
    input.anneesExperience !== null && input.anneesExperience !== undefined,
    isNonEmptyString(input.photoS3Key),
  ];
  return checks.every((c) => c);
}

function isNonEmptyString(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isBiographieValide(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.length >= BIOGRAPHIE_MIN_LENGTH;
}
