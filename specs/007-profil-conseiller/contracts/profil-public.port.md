# Contract — Lecture page publique

**Module** : `identite` (extension)
**Couche** : application
**Consommateurs** : page Next.js `/conseiller/[slug]`, sitemap dynamique, OG image

## Vocabulaire (clarification)

- **`ProfilPublicReader`** — *port* (interface) côté application, défini
  dans `apps/api/src/modules/identite/application/ports/profil-public-reader.port.ts`.
  Décrit le contrat de lecture (DB + S3 URL building + jointure conformité).
- **`LirePageProfilPubliqueUseCase`** — *use case* (classe avec
  `execute`) qui orchestre le port + le port public de la conformité
  (`ConformiteQueryPort` pour `estVerifie` et `certifications`). C'est
  ce que les controllers / Server Actions appellent.

L'**adaptateur infrastructure** `PrismaProfilPublicReader` implémente le
port et fait la requête SQL + construit l'URL CloudFront publique.

---

## Signature TypeScript

```typescript
// apps/api/src/modules/identite/application/ports/profil-public-reader.port.ts

export interface ProfilPublicReader {
  /**
   * Lit le profil public à exposer pour un slug donné.
   * Retourne null pour TOUS les cas non-visibles (anti-énumération) :
   *   - slug inexistant
   *   - slug réservé (SlugReservation existe)
   *   - conseiller en statut conformité != 'verified'
   *   - profil en statut != 'pret'
   * L'appelant déclenche notFound() Next.js sur null sans distinction.
   */
  lireParSlug(slug: string): Promise<ProfilPublicPayload | null>;

  /**
   * Énumère les slugs publiables (statut profil = 'pret' ET conformité = 'verified').
   * Utilisé pour generateStaticParams (SSG ISR) et /sitemap.xml.
   */
  lireSlugsPubliables(): Promise<string[]>;
}

export type ProfilPublicPayload = {
  conseillerId: string;
  slug: string;
  nomAffiche: string;          // déjà formaté (cf. R5)
  titre: string | null;
  biographie: string;          // requis (sinon profil incomplet, retourné null)
  photoUrlPublique: string;    // URL CloudFront stable (OAC, pas signée) — cacheable browser/CDN long terme (cf. R2)
  photoWidth: number;
  photoHeight: number;
  specialites: { code: string; label: string }[];
  langues: { code: string; label: string }[];
  zonesGeographiques: { code: string; label: string }[];
  anneesExperience: number;
  verifieOPCTICO: boolean;     // A3 exploration : ConformiteQueryPort actuel n'expose que `verified: boolean`, pas le détail des certificats. La liste détaillée (type CCV/TICO + référence + date d'expiration) sera ajoutée par feature 016 SEO qui étendra le port conformité. Au MVP, le badge boolean suffit pour la confiance.
  publishedAt: string;         // ISO 8601
};
```

## Invariants

1. **`lireParSlug` retourne `null` ou `ProfilPublicPayload` complet** — aucun
   payload partiel. Si la photo est absente (cas anormal post-vérif),
   considéré comme profil incomplet → `null`.
2. **Aucune fuite d'identifiant interne** : `conseillerId` est exposé (UUID
   public utilisé dans `?suggested=`), mais aucun ID de table interne.
3. **`photoUrlPublique`** : URL CloudFront stable via OAC (cf. R2).
   Cacheable browser + CDN long terme (`Cache-Control: public,
   max-age=31536000, immutable`). Rotation de photo = nouvelle URL
   (UUID dans le path), ancienne URL invalidée CloudFront à l'eviction
   FIFO.
4. **`certificationsVisibles`** : lecture via `ConformiteQueryPort.certifications(conseillerId)`
   (port existant 001). Si conformité retourne 0 certification, le payload
   est tout de même retourné — la section UI affichera une variante
   (« Profil vérifié OPC/TICO » sans liste détaillée si vide).

## Conditions retour `null`

| Condition | Détecté par |
|---|---|
| Slug inexistant | `prisma.conseillerProfile.findUnique({where: {slug}}) === null` |
| Slug réservé (Loi 25 / révoqué) | `prisma.slugReservation.findUnique({where: {slug}}) !== null` |
| Statut profil = `incomplet`, `masque_admin`, `anonymise` | Lecture du champ `statut` |
| Statut conformité ≠ `verified` | `ConformiteQueryPort.estVerifie(id)` |
| Champs obligatoires manquants (cas anormal — invariant DB violé) | Validation post-lecture |

L'ordre d'évaluation est :
1. Lookup `slug` dans `slug_reservations` (rejet précoce).
2. Lookup dans `conseiller_profiles`.
3. Si statut ≠ `pret` → `null`.
4. Si conformité ≠ `verified` → `null`.
5. Sinon → construire `ProfilPublicPayload`.

## Erreurs gérées

Aucune erreur métier — la fonction retourne `null` pour tous les cas
non-visibles (anti-énumération). Les erreurs techniques (DB HS, S3 HS
pour générer l'URL signée) propagent en exception et sont gérées par
le contrôleur (qui retourne 503 dans ce cas, cohérent avec le mode
dégradé du plan).

## Performances attendues

- p95 < 50 ms pour `lireParSlug` (un index `slug` + jointures simples).
- p95 < 200 ms pour `lireSlugsPubliables` à 500 profils (lecture filtrée,
  utilisable en build SSG / sitemap rare).

## Tests

- `tests/integration/profil-public-reader.spec.ts` (Testcontainers Postgres) :
  - retourne null pour slug inexistant
  - retourne null pour slug réservé
  - retourne null pour statut incomplet
  - retourne null pour conformité non vérifiée
  - retourne payload complet pour cas nominal
  - URL signée valide (regex CloudFront)
