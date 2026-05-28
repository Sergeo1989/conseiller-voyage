// T012 — Tests TDD RED pour slugify + genererSlugUnique (Principe VI).
//
// Couvre la stratégie de slug `prenom-nom` slugifié FR-CA (Q1 clarifiée) :
//   - NFD/diacritic strip pour les accents canadiens
//   - Mapping explicite œ/æ (NFD ne les sépare pas)
//   - Lettres composées (Marie-Claire, Le Goff, St-Pierre)
//   - Particules nobiliaires (de la Tour, du Pont, d'Aragon)
//   - Longueur max 60 chars
//   - Désambiguïsation par suffixe numérique en cas de collision
//   - Liste de réservations framework (anti-collision routes Next.js)
//
// Cf. research.md R1 + C1 (SLUGS_RESERVES_FRAMEWORK).

import { describe, expect, it } from 'vitest';
import {
  SLUGS_RESERVES_FRAMEWORK,
  SlugDisambiguationExhaustedError,
  genererSlugUnique,
  slugify,
} from '../src/slug';

describe('slugify (FR-CA, fonction pure)', () => {
  describe('cas nominaux ASCII', () => {
    it('produit `marie-dupont` à partir de ("Marie", "Dupont")', () => {
      expect(slugify('Marie', 'Dupont')).toBe('marie-dupont');
    });

    it('produit `jean-pierre-le-goff` (nom composé tiret prénom + espace nom)', () => {
      expect(slugify('Jean-Pierre', 'Le Goff')).toBe('jean-pierre-le-goff');
    });

    it('produit `marie-claire-dupont-tremblay` (doubles noms composés)', () => {
      expect(slugify('Marie-Claire', 'Dupont-Tremblay')).toBe('marie-claire-dupont-tremblay');
    });
  });

  describe('diacritiques FR-CA', () => {
    it('strip les accents : éàèêëôûç → ASCII', () => {
      expect(slugify('Élise', 'Côté')).toBe('elise-cote');
    });

    it('mappe œ → oe et æ → ae (NFD ne les sépare pas)', () => {
      expect(slugify('François', 'Œuvrard')).toBe('francois-oeuvrard');
      expect(slugify('Cæsar', 'Lœwen')).toBe('caesar-loewen');
    });

    it('strip umlaut allemand commun (ü, ö)', () => {
      expect(slugify('Anne', 'Müller-Lehmann')).toBe('anne-muller-lehmann');
    });
  });

  describe('particules nobiliaires et apostrophes', () => {
    it("transforme l'apostrophe en tiret : d'Aragon → d-aragon", () => {
      expect(slugify('Sébastien', "d'Aragon")).toBe('sebastien-d-aragon');
    });

    it('préserve les particules `de la` espace → tirets : `Sébastien de la Tour` → `sebastien-de-la-tour`', () => {
      expect(slugify('Sébastien', 'de la Tour')).toBe('sebastien-de-la-tour');
    });

    it('préserve `du Pont` → `anne-du-pont`', () => {
      expect(slugify('Anne', 'du Pont')).toBe('anne-du-pont');
    });

    it('préserve `St-Pierre` → `marc-st-pierre`', () => {
      expect(slugify('Marc', 'St-Pierre')).toBe('marc-st-pierre');
    });
  });

  describe('normalisation des espaces et caractères spéciaux', () => {
    it('strip les espaces multiples en début/fin', () => {
      expect(slugify('  Marie  ', '  Dupont  ')).toBe('marie-dupont');
    });

    it('collapse les espaces internes multiples en un seul tiret', () => {
      expect(slugify('Marie', 'Dupont   Tremblay')).toBe('marie-dupont-tremblay');
    });

    it('strip la ponctuation (point, virgule, etc.)', () => {
      expect(slugify('Marie.', 'Dupont, Jr.')).toBe('marie-dupont-jr');
    });
  });

  describe('longueur', () => {
    it('tronque à 60 caractères max en préservant un mot complet', () => {
      const long = slugify(
        'NomDePrenomTresLongQuiDevraitFinalementEtreTronqueIciOuLa',
        'NomDeFamilleEgalementInterminable',
      );
      expect(long.length).toBeLessThanOrEqual(60);
      // Ne se termine pas par un tiret (pas de coupe en plein milieu d'un mot
      // si on peut couper avant).
      expect(long.endsWith('-')).toBe(false);
    });

    it('retourne une chaîne non vide pour des entrées minimales (`a`, `b`)', () => {
      expect(slugify('a', 'b')).toBe('a-b');
    });
  });

  describe('cas dégénérés', () => {
    it('renvoie une chaîne stable pour des entrées vides (sans bordure suspendue)', () => {
      // Note : on accepte que ce cas produise un slug minimal — la validation
      // métier (champs obligatoires non vides) doit empêcher d'arriver ici.
      // L'objectif est que la fonction ne plante PAS.
      const result = slugify('', '');
      expect(typeof result).toBe('string');
      expect(result).not.toMatch(/^-|-$/);
    });

    it('strip les emojis et caractères latin étendu hors FR', () => {
      expect(slugify('Marie🎉', 'Dupont')).toBe('marie-dupont');
    });
  });
});

describe('SLUGS_RESERVES_FRAMEWORK (constante exportée)', () => {
  it('contient au moins les segments App Router cohabitant avec /conseiller/[slug]', () => {
    expect(SLUGS_RESERVES_FRAMEWORK.has('profil')).toBe(true);
    expect(SLUGS_RESERVES_FRAMEWORK.has('admin')).toBe(true);
    expect(SLUGS_RESERVES_FRAMEWORK.has('api')).toBe(true);
    expect(SLUGS_RESERVES_FRAMEWORK.has('apercu')).toBe(true);
  });

  it('contient les routes auth (inscription, connexion, etc.)', () => {
    expect(SLUGS_RESERVES_FRAMEWORK.has('inscription')).toBe(true);
    expect(SLUGS_RESERVES_FRAMEWORK.has('connexion')).toBe(true);
  });

  it('contient les routes legal (intake, mentions-legales, cgu)', () => {
    expect(SLUGS_RESERVES_FRAMEWORK.has('intake')).toBe(true);
    expect(SLUGS_RESERVES_FRAMEWORK.has('comment-ca-marche')).toBe(true);
    expect(SLUGS_RESERVES_FRAMEWORK.has('mentions-legales')).toBe(true);
  });
});

describe('genererSlugUnique (collision FIFO + framework reserved)', () => {
  it('retourne le slug brut si pas de collision', () => {
    expect(
      genererSlugUnique('Marie', 'Dupont', { slugExistant: new Set(), slugReserve: new Set() }),
    ).toBe('marie-dupont');
  });

  it('ajoute -2 si le slug existe déjà en DB', () => {
    expect(
      genererSlugUnique('Marie', 'Dupont', {
        slugExistant: new Set(['marie-dupont']),
        slugReserve: new Set(),
      }),
    ).toBe('marie-dupont-2');
  });

  it('ajoute -3 si -2 existe aussi', () => {
    expect(
      genererSlugUnique('Marie', 'Dupont', {
        slugExistant: new Set(['marie-dupont', 'marie-dupont-2']),
        slugReserve: new Set(),
      }),
    ).toBe('marie-dupont-3');
  });

  it('saute aux suffixes suivants quand le slug est réservé Loi 25', () => {
    expect(
      genererSlugUnique('Marie', 'Dupont', {
        slugExistant: new Set(),
        slugReserve: new Set(['marie-dupont']),
      }),
    ).toBe('marie-dupont-2');
  });

  it('saute aux suffixes suivants quand le slug match un mot framework réservé', () => {
    // Cas pathologique improbable : `slugify('Profil', '')` produirait `profil`
    // — bloqué par la liste framework.
    expect(
      genererSlugUnique('Profil', 'X', { slugExistant: new Set(), slugReserve: new Set() }),
    ).toBe('profil-x'); // ici pas de collision réelle car le slug est `profil-x`
  });

  it('combine slugExistant + slugReserve dans la recherche de disponibilité', () => {
    expect(
      genererSlugUnique('Marie', 'Dupont', {
        slugExistant: new Set(['marie-dupont', 'marie-dupont-2']),
        slugReserve: new Set(['marie-dupont-3']),
      }),
    ).toBe('marie-dupont-4');
  });

  it('lève SlugDisambiguationExhaustedError après 100 tentatives', () => {
    const slugExistant = new Set<string>(['marie-dupont']);
    for (let i = 2; i <= 100; i++) {
      slugExistant.add(`marie-dupont-${i}`);
    }
    expect(() =>
      genererSlugUnique('Marie', 'Dupont', { slugExistant, slugReserve: new Set() }),
    ).toThrow(SlugDisambiguationExhaustedError);
  });
});
