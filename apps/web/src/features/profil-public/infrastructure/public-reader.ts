// Lecture publique des profils — server-only, MAIS PAS Server Action.
//
// Séparé de server-actions.ts (qui a `'use server'` au top, rendant toutes
// les exports des Server Actions POST). Les lectures publiques sont
// appelées depuis les Server Components SSG/ISR (page slug, sitemap,
// opengraph-image) — elles doivent être de simples async functions
// importables sans déclencher DYNAMIC_SERVER_USAGE (qui ferait crasher
// la page avec `revalidate = 300`).

import 'server-only';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ProfilPublicPayloadDto {
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
  readonly publishedAt: string;
}

/**
 * Lit la page publique d'un conseiller par slug. Retourne null pour TOUS
 * les cas non-visibles (anti-énumération SC-003). Consommé en SSG/ISR.
 *
 * Utilise next.revalidate au lieu de cache: 'no-store' pour rester
 * compatible avec `export const revalidate = 300` de la page caller.
 * En cas d'API HS, dégradation gracieuse → null → notFound().
 */
export async function lireProfilPublicBySlug(slug: string): Promise<ProfilPublicPayloadDto | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/profil/${encodeURIComponent(slug)}`, {
      method: 'GET',
      next: { revalidate: 300 },
    });
    if (res.status !== 200) return null;
    const data = (await res.json().catch(() => null)) as ProfilPublicPayloadDto | null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Liste les slugs publiables (statut=pret + verified). Consommé par
 * sitemap.xml + generateStaticParams (futur). Dégradation gracieuse →
 * [] si API HS.
 */
export async function lireSlugsPubliables(): Promise<readonly string[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/public/profil`, {
      method: 'GET',
      next: { revalidate: 300 },
    });
    if (res.status !== 200) return [];
    const data = (await res.json().catch(() => null)) as { slugs?: readonly string[] } | null;
    return data?.slugs ?? [];
  } catch {
    return [];
  }
}
