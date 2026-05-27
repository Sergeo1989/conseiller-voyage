// T039 — Tests de la validation MDX + détection de drift.
// Cf. contracts/mdx-frontmatter.md.

import { describe, expect, it } from 'vitest';
import { type MdxFile, parseLegalMdx, validateLegalMdxFiles } from '../mdx-validation';

// Helpers pour construire des fixtures MDX
function makeMdx(frontmatter: Record<string, unknown>, body: string): string {
  const fmYaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`)
    .join('\n');
  return `---\n${fmYaml}\n---\n${body}`;
}

const VALID_FRONTMATTER = {
  type: 'cgu_b2b',
  version: 1,
  slug: 'cgu-conseiller',
  title: "Conditions générales d'utilisation — Conseiller",
  description: 'Conditions B2B pour conseillers vérifiés.',
  publishedAt: '2026-05-25T00:00:00Z',
  effectiveAt: '2026-06-01T00:00:00Z',
  locale: 'fr-CA',
};

describe('parseLegalMdx (T039)', () => {
  it('parse un MDX valide et calcule un checksum', () => {
    const file: MdxFile = {
      path: 'packages/legal-content/fr-CA/cgu-conseiller.mdx',
      contents: makeMdx(VALID_FRONTMATTER, '# Titre\n\nContenu du document.\n'),
    };
    const result = parseLegalMdx(file);
    expect('frontmatter' in result).toBe(true);
    if ('frontmatter' in result) {
      expect(result.frontmatter.type).toBe('cgu_b2b');
      expect(result.frontmatter.version).toBe(1);
      expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('rejette frontmatter sans champ obligatoire', () => {
    const incomplete = { ...VALID_FRONTMATTER };
    // biome-ignore lint/performance/noDelete: test data manipulation
    delete (incomplete as Partial<typeof incomplete>).type;
    const file: MdxFile = {
      path: 'fixture-missing-type.mdx',
      contents: makeMdx(incomplete, '# Body'),
    };
    const result = parseLegalMdx(file);
    expect('frontmatter' in result).toBe(false);
    if (!('frontmatter' in result)) {
      expect(result.message).toContain('type');
    }
  });

  it('rejette frontmatter avec effectiveAt < publishedAt', () => {
    const broken = {
      ...VALID_FRONTMATTER,
      publishedAt: '2026-06-01T00:00:00Z',
      effectiveAt: '2026-05-01T00:00:00Z',
    };
    const file: MdxFile = {
      path: 'fixture-effective-before-published.mdx',
      contents: makeMdx(broken, '# Body'),
    };
    const result = parseLegalMdx(file);
    expect('frontmatter' in result).toBe(false);
    if (!('frontmatter' in result)) {
      expect(result.message).toContain('effectiveAt');
    }
  });

  it('rejette type invalide', () => {
    const broken = { ...VALID_FRONTMATTER, type: 'not_a_legal_type' };
    const file: MdxFile = {
      path: 'fixture-bad-type.mdx',
      contents: makeMdx(broken, '# Body'),
    };
    const result = parseLegalMdx(file);
    expect('frontmatter' in result).toBe(false);
  });

  it('rejette version ≤ 0', () => {
    const broken = { ...VALID_FRONTMATTER, version: 0 };
    const file: MdxFile = {
      path: 'fixture-version-zero.mdx',
      contents: makeMdx(broken, '# Body'),
    };
    const result = parseLegalMdx(file);
    expect('frontmatter' in result).toBe(false);
  });

  it('checksum est déterministe pour contenu identique', () => {
    const file: MdxFile = {
      path: 'fixture.mdx',
      contents: makeMdx(VALID_FRONTMATTER, '# Stable\n\nBody.\n'),
    };
    const a = parseLegalMdx(file);
    const b = parseLegalMdx(file);
    expect('frontmatter' in a).toBe(true);
    expect('frontmatter' in b).toBe(true);
    if ('frontmatter' in a && 'frontmatter' in b) {
      expect(a.checksum).toBe(b.checksum);
    }
  });

  it('🚨 P0 BLOQUANT : checksum CHANGE si le corps change (drift detection)', () => {
    const a: MdxFile = {
      path: 'fixture-a.mdx',
      contents: makeMdx(VALID_FRONTMATTER, '# Avant\n\nContenu v1.\n'),
    };
    const b: MdxFile = {
      path: 'fixture-b.mdx',
      contents: makeMdx(VALID_FRONTMATTER, '# Après\n\nContenu v1 modifié.\n'),
    };
    const ra = parseLegalMdx(a);
    const rb = parseLegalMdx(b);
    expect('frontmatter' in ra).toBe(true);
    expect('frontmatter' in rb).toBe(true);
    if ('frontmatter' in ra && 'frontmatter' in rb) {
      // Même frontmatter (donc même version) mais corps différent → checksums différents.
      // C'est précisément ce que tools/seed-legal-documents.ts utilise pour
      // détecter une modification silencieuse (drift) sans bump de version.
      expect(ra.checksum).not.toBe(rb.checksum);
    }
  });

  it('checksum ignore les espaces trailing (trim)', () => {
    const a: MdxFile = {
      path: 'a.mdx',
      contents: makeMdx(VALID_FRONTMATTER, '# Body\n'),
    };
    const b: MdxFile = {
      path: 'b.mdx',
      contents: makeMdx(VALID_FRONTMATTER, '# Body\n\n\n\n'),
    };
    const ra = parseLegalMdx(a);
    const rb = parseLegalMdx(b);
    if ('frontmatter' in ra && 'frontmatter' in rb) {
      expect(ra.checksum).toBe(rb.checksum);
    }
  });
});

describe('validateLegalMdxFiles (T039)', () => {
  it('accepte un set valide multi-locale multi-type', () => {
    const files: MdxFile[] = [
      { path: 'fr-CA/cgu-b2b-v1.mdx', contents: makeMdx(VALID_FRONTMATTER, '# v1') },
      {
        path: 'en/cgu-b2b-v1.mdx',
        contents: makeMdx({ ...VALID_FRONTMATTER, locale: 'en' }, '# v1 EN'),
      },
      {
        path: 'fr-CA/cgu-voyageur-v1.mdx',
        contents: makeMdx(
          { ...VALID_FRONTMATTER, type: 'cgu_b2c', slug: 'cgu-voyageur', title: 'CGU Voyageur' },
          '# Voyageur v1',
        ),
      },
    ];
    const result = validateLegalMdxFiles(files);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.parsed).toHaveLength(3);
  });

  it('rejette les couples (type, version) dupliqués entre fichiers de même locale', () => {
    const files: MdxFile[] = [
      { path: 'fr-CA/cgu-b2b-a.mdx', contents: makeMdx(VALID_FRONTMATTER, '# A') },
      { path: 'fr-CA/cgu-b2b-b.mdx', contents: makeMdx(VALID_FRONTMATTER, '# B') }, // duplicate (cgu_b2b, 1)
    ];
    const result = validateLegalMdxFiles(files);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes('duplicate'))).toBe(true);
  });

  it('rejette une régression de version (gap)', () => {
    const files: MdxFile[] = [
      { path: 'v1.mdx', contents: makeMdx(VALID_FRONTMATTER, '# v1') },
      // v2 manquant, on saute à v3 → gap
      { path: 'v3.mdx', contents: makeMdx({ ...VALID_FRONTMATTER, version: 3 }, '# v3') },
    ];
    const result = validateLegalMdxFiles(files);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes('version regression'))).toBe(true);
  });

  it('accepte plusieurs versions strictement croissantes par type', () => {
    const files: MdxFile[] = [
      { path: 'v1.mdx', contents: makeMdx(VALID_FRONTMATTER, '# v1') },
      { path: 'v2.mdx', contents: makeMdx({ ...VALID_FRONTMATTER, version: 2 }, '# v2') },
      { path: 'v3.mdx', contents: makeMdx({ ...VALID_FRONTMATTER, version: 3 }, '# v3') },
    ];
    const result = validateLegalMdxFiles(files);
    expect(result.ok).toBe(true);
  });

  it('accumule les erreurs de plusieurs fichiers', () => {
    const broken = { ...VALID_FRONTMATTER, version: 0 };
    const files: MdxFile[] = [
      { path: 'bad1.mdx', contents: makeMdx(broken, '# Bad 1') },
      { path: 'bad2.mdx', contents: makeMdx({ ...broken, type: 'invalid' }, '# Bad 2') },
    ];
    const result = validateLegalMdxFiles(files);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('retourne ok=true pour un set vide', () => {
    const result = validateLegalMdxFiles([]);
    expect(result.ok).toBe(true);
    expect(result.parsed).toHaveLength(0);
  });
});
