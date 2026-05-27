// T034 — Port lecture page publique profil (feature 007, contracts/profil-public.port.md).
//
// Adapté côté infrastructure par PrismaProfilPublicReader (T044) qui
// combine la lecture profil + jointure conformité (verifié OPC/TICO) +
// construction URL CloudFront publique stable (cf. R2 + M7).
//
// **Anti-énumération (FR-007 + SC-003)** : retourne null pour TOUS les
// cas non-visibles sans distinguer la raison. Le caller (use case)
// déclenche notFound() Next.js sans message différenciant.

export interface CertificationPubliqueBadge {
  /** A3 exploration — au MVP, seul un boolean `verified OPC/TICO`. */
  readonly verifieOPCTICO: boolean;
}

export interface ProfilPublicPayload {
  readonly conseillerId: string;
  readonly slug: string;
  readonly nomAffiche: string;
  readonly titre: string | null;
  readonly biographie: string;
  readonly photoUrlPublique: string;
  readonly photoWidth: number;
  readonly photoHeight: number;
  readonly specialites: readonly { code: string; label: string }[];
  readonly langues: readonly { code: string; label: string }[];
  readonly zonesGeographiques: readonly { code: string; label: string }[];
  readonly anneesExperience: number;
  readonly verifieOPCTICO: boolean;
  readonly publishedAt: Date;
}

export interface ProfilPublicReader {
  /**
   * Lit le profil public à exposer pour un slug donné.
   * Retourne `null` pour TOUS les cas non-visibles (anti-énumération) :
   *   - slug inexistant
   *   - slug réservé (Loi 25 / révocation)
   *   - conseiller en statut conformité != 'verified'
   *   - profil en statut != 'pret'
   */
  lireParSlug(slug: string): Promise<ProfilPublicPayload | null>;

  /**
   * Énumère les slugs publiables (statut profil = 'pret' ET conformité
   * = 'verified'). Utilisé par sitemap.xml et generateStaticParams (SSG ISR).
   */
  lireSlugsPubliables(): Promise<readonly string[]>;
}

export const PROFIL_PUBLIC_READER = Symbol.for('ProfilPublicReader');
