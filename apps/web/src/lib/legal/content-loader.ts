// Helper de chargement des fichiers MDX éditoriaux depuis
// `packages/legal-content/`. Consommé par les 5 pages publiques sous
// `apps/web/src/app/[locale]/(legal)/`.
//
// Stratégie : lecture synchrone disk via `node:fs/promises` au moment
// du SSG (Server Component async). Pas de cache explicite car
// `export const dynamic = 'force-static'` garantit que les pages sont
// pré-rendues une seule fois au build et servies depuis CloudFront —
// aucune ré-exécution runtime.
//
// Note : la locale dans `params.locale` est la locale INTERNE (`fr-CA`
// ou `en`), pas le préfixe URL (`/fr` ou `/en`). next-intl
// `localePrefix.prefixes` fait la conversion automatiquement.

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type LegalMdxFrontmatter, LegalMdxFrontmatterSchema } from '@cv/legal';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/web/src/lib/legal/ → 6 niveaux up = racine repo → /packages/legal-content
const LEGAL_CONTENT_ROOT = resolve(__dirname, '../../../../..', 'packages', 'legal-content');

export interface LoadedLegalMdx {
  readonly frontmatter: LegalMdxFrontmatter;
  /** Corps MDX brut (sans frontmatter), prêt à passer à <MDXRemote source={...}/>. */
  readonly content: string;
}

/**
 * Charge un MDX légal depuis le package partagé.
 *
 * @param locale locale interne (`fr-CA` ou `en`)
 * @param slug nom du fichier sans extension (ex: `comment-ca-marche`)
 * @throws si le fichier est introuvable, mal-formé, ou si le frontmatter
 *   ne respecte pas le schéma Zod (typiquement détecté en amont par
 *   `pnpm legal:verify` en CI)
 */
export async function loadLegalMdx(locale: string, slug: string): Promise<LoadedLegalMdx> {
  const path = join(LEGAL_CONTENT_ROOT, locale, `${slug}.mdx`);
  const raw = await readFile(path, 'utf-8');
  const parsed = matter(raw);
  const frontmatter = LegalMdxFrontmatterSchema.parse(parsed.data);
  return { frontmatter, content: parsed.content };
}
