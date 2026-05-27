// T019 — Formatage du nom affiché publiquement (FR-006a, R5).
//
// Stratégie FR-CA :
//   - Mode compact (afficherNomComplet=false) : `Prénom + initiale + "."`.
//     Skip les particules nobiliaires (de, du, de la, le, la) ; utiliser
//     l'initiale du mot suivant. Pour les noms composés à tiret (Dupont-Tremblay,
//     St-Pierre), utiliser l'initiale du premier sous-mot.
//   - Mode complet (afficherNomComplet=true) : `Prénom + Nom` brut.
//
// Référence : research.md R5 table de tests.

/** Particules nobiliaires / agglutinations qu'on skip pour trouver le mot porteur d'initiale. */
const PARTICULES = new Set(['de', 'du', 'la', 'le', 'des']);

export interface FormaterNomAfficheInput {
  readonly prenomLegal: string;
  readonly nomLegal: string;
  readonly afficherNomComplet: boolean;
}

/**
 * Formate le nom affiché publiquement selon le toggle `afficherNomComplet`.
 *
 * Fonction pure : entrées identiques → sortie identique.
 *
 * @example
 *   formaterNomAffiche({prenomLegal:'Marie', nomLegal:'Dupont', afficherNomComplet:false})
 *   // → 'Marie D.'
 *   formaterNomAffiche({prenomLegal:'Sébastien', nomLegal:'de la Tour', afficherNomComplet:false})
 *   // → 'Sébastien T.' (particules `de la` skippées)
 */
export function formaterNomAffiche(input: FormaterNomAfficheInput): string {
  if (input.afficherNomComplet) {
    return `${input.prenomLegal} ${input.nomLegal}`;
  }
  const initiale = extraireInitialeFR(input.nomLegal);
  return `${input.prenomLegal} ${initiale}.`;
}

/**
 * Extrait l'initiale FR-CA d'un nom de famille.
 *
 * Algorithme :
 *   1. Split sur les espaces — détermine les mots.
 *   2. Trouve le premier mot qui N'EST PAS une particule nobiliaire.
 *   3. Si le mot porte un tiret (`Dupont-Tremblay`, `St-Pierre`), prend
 *      l'initiale du premier sous-mot.
 *   4. Retourne la première lettre en majuscule.
 */
function extraireInitialeFR(nomLegal: string): string {
  const mots = nomLegal.trim().split(/\s+/);
  for (const mot of mots) {
    if (PARTICULES.has(mot.toLowerCase())) continue;
    const sousMot = mot.split('-')[0] ?? mot;
    if (sousMot.length > 0) {
      return sousMot.charAt(0).toUpperCase();
    }
  }
  // Fallback dégénéré : si tous les mots sont des particules (improbable),
  // prend la 1re lettre du dernier mot.
  const dernier = mots[mots.length - 1];
  if (dernier && dernier.length > 0) {
    return dernier.charAt(0).toUpperCase();
  }
  return '';
}
