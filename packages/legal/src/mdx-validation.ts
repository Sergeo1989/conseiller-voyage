// Validation pure des fichiers MDX éditoriaux légaux.
// Cf. specs/004-mentions-legales/contracts/mdx-frontmatter.md.
//
// Garde-fous appliqués :
//   1. Chaque frontmatter conforme à LegalMdxFrontmatterSchema
//   2. Unicité (type, version) à travers tous les fichiers
//   3. Strict-croissance par type
//   4. Calcul du checksum SHA-256 du corps MDX (sans frontmatter)
//
// Le CLI (`tools/check-legal-mdx.ts`) consomme ces fonctions et y ajoute
// les opérations disk (glob + readFile).

import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import type { LegalDocumentType } from './document-types';
import { type LegalMdxFrontmatter, LegalMdxFrontmatterSchema } from './schemas';

export interface MdxFile {
  /** Chemin relatif depuis la racine du repo */
  readonly path: string;
  readonly contents: string;
}

export interface ParsedMdx {
  readonly path: string;
  readonly frontmatter: LegalMdxFrontmatter;
  readonly body: string;
  readonly checksum: string;
}

export interface ValidationError {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly parsed: ReadonlyArray<ParsedMdx>;
  readonly errors: ReadonlyArray<ValidationError>;
}

/**
 * Parse un fichier MDX : sépare frontmatter et corps, valide via Zod,
 * calcule le checksum SHA-256 du corps trim.
 *
 * @returns ParsedMdx en cas de succès, ValidationError sinon
 */
export function parseLegalMdx(file: MdxFile): ParsedMdx | ValidationError {
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(file.contents);
  } catch (err) {
    return {
      path: file.path,
      message: `gray-matter parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const validation = LegalMdxFrontmatterSchema.safeParse(parsed.data);
  if (!validation.success) {
    return {
      path: file.path,
      message: `frontmatter validation failed: ${validation.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    };
  }

  const checksum = createHash('sha256').update(parsed.content.trim()).digest('hex');
  return {
    path: file.path,
    frontmatter: validation.data,
    body: parsed.content,
    checksum,
  };
}

/**
 * Valide un ensemble de fichiers MDX (toutes locales confondues) :
 *   - chaque frontmatter parse OK
 *   - couples (type, version) uniques à travers les fichiers
 *   - versions strictement croissantes par type (1, 2, 3... sans gap)
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 3 invariants distincts (frontmatter, unicité, strict-croissance) ; 14 tests valident le comportement
export function validateLegalMdxFiles(files: ReadonlyArray<MdxFile>): ValidationResult {
  const parsedItems: ParsedMdx[] = [];
  const errors: ValidationError[] = [];

  for (const file of files) {
    const result = parseLegalMdx(file);
    if ('frontmatter' in result) {
      parsedItems.push(result);
    } else {
      errors.push(result);
    }
  }

  // Unicité (type, version, locale) — un même triplet ne peut apparaître
  // qu'une fois. Mais (type, version) peut être présent dans plusieurs
  // locales (chaque locale fournit sa traduction de la même version
  // du document).
  const seenByTypeVersionLocale = new Map<string, string>();
  for (const item of parsedItems) {
    const key = `${item.frontmatter.type}:${item.frontmatter.version}:${item.frontmatter.locale}`;
    const existing = seenByTypeVersionLocale.get(key);
    if (existing !== undefined && existing !== item.path) {
      errors.push({
        path: item.path,
        message: `duplicate (type=${item.frontmatter.type}, version=${item.frontmatter.version}, locale=${item.frontmatter.locale}) — also found in ${existing}`,
      });
    } else {
      seenByTypeVersionLocale.set(key, item.path);
    }
  }

  // Strict-croissance par type : versions doivent former une séquence
  // 1, 2, 3... sans trou.
  const versionsByType = new Map<LegalDocumentType, Set<number>>();
  for (const item of parsedItems) {
    const set = versionsByType.get(item.frontmatter.type) ?? new Set<number>();
    set.add(item.frontmatter.version);
    versionsByType.set(item.frontmatter.type, set);
  }
  for (const [type, versions] of versionsByType) {
    const sorted = [...versions].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      const expected = i + 1;
      if (sorted[i] !== expected) {
        errors.push({
          path: `type=${type}`,
          message: `version regression: expected ${expected} but found ${sorted[i]} (gap or non-monotonic)`,
        });
        break;
      }
    }
  }

  return {
    ok: errors.length === 0,
    parsed: parsedItems,
    errors,
  };
}
