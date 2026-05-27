// T035 — Port public EstProfilPublicPort exposé aux consommateurs futurs
// (feature 011 matching + feature 016 SEO).
//
// **Source de vérité unique** combinant :
//   - conformité : statut === 'verified' (lu via ConformiteQueryPort)
//   - profil : statut === 'pret' (lu via ProfilConseillerRepository)
//
// Cf. contracts/est-profil-public.port.md spec 007.
// Le contract test (futur) garantit que l'adapter PrismaEstProfilPublic
// (T045) respecte ce contrat.

export interface EstProfilPublicPort {
  /**
   * Retourne `true` si et seulement si le conseiller est éligible à
   * apparaître publiquement (page profil, matching, listings SEO).
   *
   * Définition formelle :
   *   estPublic(id) = conformite.estVerifie(id) && profil.statut(id) === 'pret'
   *
   * Cas null/undefined / id invalide : retourne `false` (fail-safe).
   * Aucune fuite d'information : retourne uniquement `bool`, jamais la
   * raison d'exclusion (Insecure Design OWASP A04).
   */
  estPublic(conseillerId: string): Promise<boolean>;

  /**
   * Variante batch — filtrage d'un pool de candidats matching.
   * Retourne la sous-liste des IDs réellement publics, dans l'ordre d'entrée.
   */
  filtrerPublics(conseillerIds: readonly string[]): Promise<readonly string[]>;
}
