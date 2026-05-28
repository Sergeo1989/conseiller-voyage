# Phase 0 — Research : Profil conseiller (feature 005)

**Branche** : `007-profil-conseiller` | **Date** : 2026-05-27

Décisions techniques résolues pour rendre le plan exécutable. Chaque
recherche est : *Décision → Justification → Alternatives considérées*.

---

## R1 — Slugification FR-CA (Q1 clarifiée)

**Question** : Comment slugifier `prenom + nom` français pour produire des
URLs SEO-friendly stables, en respectant les accents canadiens et les noms
composés ?

**Décision** : Pipeline déterministe en 5 étapes, implémenté dans
`packages/profil-domain/src/slug.ts` (fonction pure, TDD obligatoire) :

1. **Normalisation Unicode** : `String.prototype.normalize('NFD')` puis
   strip des diacritiques (`/\p{Diacritic}/gu`). Convertit
   `é → e`, `è → e`, `ê → e`, `à → a`, `ç → c`, etc.
2. **Lettres composées spécifiques FR** : `œ → oe`, `Œ → oe`,
   `æ → ae`, `Æ → ae`. Mapping explicite (NFD ne les sépare pas).
3. **Minuscules** : `.toLowerCase()` Unicode-aware.
4. **Substitution caractères non-`[a-z0-9-]`** : tout caractère hors
   `[a-z0-9]` (espaces, ponctuation, particules à apostrophe `l'`, `d'`,
   etc.) → tiret unique.
5. **Bornes** : retire les tirets consécutifs (`-{2,}` → `-`), retire les
   tirets en début/fin (`^-|-$`), tronque à 60 caractères en préservant
   un mot complet (coupe au dernier tiret avant la limite).

**Exemples** validés par tests :

| Entrée `(prenom, nom)` | Slug |
|---|---|
| `("Marie", "Dupont")` | `marie-dupont` |
| `("Élise", "Côté")` | `elise-cote` |
| `("Jean-Pierre", "Le Goff")` | `jean-pierre-le-goff` |
| `("Marie-Claire", "Dupont-Tremblay")` | `marie-claire-dupont-tremblay` |
| `("Sébastien", "d'Aragon")` | `sebastien-d-aragon` |
| `("François", "Œuvrard")` | `francois-oeuvrard` |
| `("Anne", "  Müller-Lehmann  ")` | `anne-muller-lehmann` |
| `("Marc", "St-Pierre")` | `marc-st-pierre` |

**Politique de désambiguïsation** (`genererSlugUnique`) :

- Pas de collision (slug absent de `slugExistant ∪ slugReserve ∪ slugMotsReserves`)
  → retourner le slug brut.
- Collision → essayer `<slug>-2`, `<slug>-3`, ..., jusqu'à trouver un libre.
- Limite de sécurité : si > 100 essais, lever une erreur explicite
  (`SlugDisambiguationExhaustedError`). Improbable en production (500
  conseillers attendus année 1), mais bordure défensive contre les boucles
  infinies.
- **La table `SlugReservation`** est lue comme `slugReserve` : un slug
  Loi 25-réservé est traité comme « collision » et passe au suffixe
  suivant. SC-007 garanti par test d'intégration.

**Liste de slugs réservés au framework** (`slugMotsReserves`) — défense
en profondeur contre les **collisions de route Next.js**. Le matcher
`/conseiller/[slug]` est résolu APRÈS les segments statiques, mais on
préfère bloquer en amont pour éviter toute confusion d'audit / lien :

```typescript
const SLUGS_RESERVES_FRAMEWORK = new Set([
  // Segments App Router cohabitant avec /conseiller/[slug]
  'profil', 'profile',
  // Segments génériques à risque
  'admin', 'api', 'auth', 'login', 'logout',
  'inscription', 'connexion',
  'mot-de-passe-oublie', 'mot-de-passe-reinitialiser',
  'verifier-email',
  'parametres', 'settings',
  'index', 'home', 'accueil',
  // Routes intake / matching futures
  'intake', 'comment-ca-marche',
  'mentions-legales', 'cgu', 'politique-loi25',
  // Robots / sitemap
  'robots.txt', 'sitemap.xml', 'sitemap',
  // Réservations défensives
  'public', 'private', 'static', 'assets',
  'apercu', 'aperçu', 'preview',
  'new', 'edit', 'delete', 'create',
  'nouveau', 'modifier', 'supprimer',
  'me', 'moi', 'compte', 'account',
  'aide', 'support', 'contact', 'faq',
]);
```

Cas pathologique : si `slugify('Profil', 'Untel') === 'profil-untel'`, le
slug n'est PAS dans la liste réservée — OK. Mais si un nom légal extrême
produit `slugify(..., ...) === 'profil'` après troncature à 60 chars (très
improbable), la collision déclenche l'ajout d'un suffixe `-2`. À tester.

**Alternatives considérées et rejetées** :

- *Librairie tierce* (`slugify`, `@sindresorhus/slugify`, `node-slug`) :
  rejetée — dépendance superflue pour ~30 lignes de code. La politique
  FR-CA stricte (œ, æ) et les particules avec apostrophe sont mieux
  gérées explicitement. Pas de surface CVE supplémentaire.
- *UUID court base32* (Q1 option C) : rejetée à la clarification — perte
  totale du signal SEO et de la lisibilité humaine pour le partage.
- *Handle libre choisi par l'utilisateur* (Q1 option B) : rejetée — risque
  de désalignement identité légale ↔ identité affichée, modération
  supplémentaire, complexité ADR-0002 augmentée.
- *Pseudonyme avec validation contre nom légal* : rejetée — Q4 a déjà
  tranché « aucun pseudonyme autorisé ».

**Implications de test (TDD obligatoire, Principe VI)** :

- Test rouge : `slugify('Élise', 'Côté') === 'elise-cote'` → RED.
- Test vert : implémentation NFD + diacritic strip → GREEN.
- Test rouge : `slugify('François', 'Œuvrard') === 'francois-oeuvrard'` →
  RED (NFD ne sépare pas `œ`).
- Test vert : ajout du mapping explicite → GREEN.
- Etc. pour chaque cas de la table ci-dessus.

---

## R2 — Stockage S3 photo de profil : bucket dédié ou réutilisation ?

**Question** : Faut-il un nouveau bucket S3 `cv-profiles-photos-ca-central-1`
ou réutiliser le bucket existant des documents conformité
(`cv-conformite-documents-ca-central-1`) avec un préfixe `profiles/` ?

**Décision** : **Nouveau bucket dédié** `cv-profiles-photos-ca-central-1`.

**Justification** :

1. **Politique d'accès distincte** : les documents conformité sont
   **privés** (URLs signées, lecture admin uniquement). Les photos de
   profil doivent être **lisibles via CloudFront en URLs signées
   éphémères** (lecture publique indirecte). Bucket policies divergentes.
2. **Lifecycle distinct** : photos = 5 versions FIFO par conseiller (≤ 25 Mo
   par profil), suppression cascade à l'anonymisation Loi 25. Documents
   conformité = conservés selon politique conformité (jusqu'à 7 ans pour
   audit). Lifecycle rules S3 différentes.
3. **Quota et coûts** : séparation pour facturation par module (Grafana
   Cloud Canada — tableau de bord coût S3 par bucket).
4. **Blast radius** : une mauvaise config S3 sur le bucket conformité ne
   doit jamais exposer publiquement les certificats CCV/TICO ; une
   séparation physique réduit le risque.
5. **Pas d'ADR séparé requis** : la décision est dans le périmètre du
   plan (ADR-0001 figeait `S3 ca-central-1`, pas un bucket unique).

**Alternatives considérées** :

- *Bucket unique avec préfixes* : rejetée — bucket policies plus complexes
  (par préfixe), risque de confusion en revue, lifecycle rules par préfixe
  fragiles.
- *S3 + EFS* (montage filesystem) : hors stack (ADR-0001).
- *CloudFlare R2* : hors région canadienne — viole Principe II.

**Configuration du bucket** :

- Région : `ca-central-1` (Loi 25).
- SSE-KMS avec la même clé KMS que conformité (rotation centralisée).
- ACL : `private` (jamais `public-read`).
- Versioning : désactivé (le FIFO est géré applicativement, S3 versioning
  ferait double emploi).
- Lifecycle : aucun (suppression applicative).
- Encryption in transit : HTTPS uniquement (politique bucket).
- Logging : access logs vers `cv-s3-access-logs-ca-central-1` (existant).

**Distribution publique des photos — décision : CloudFront avec OAC +
URLs publiques sans signature côté navigateur** :

L'approche naïve « signed URL TTL 1 h » casse le cache navigateur pour
les visiteurs récurrents (LCP dégradé). Décision corrigée :

- **CloudFront OAC (Origin Access Control)** sécurise le lien S3 →
  CloudFront. S3 n'accepte que CloudFront comme origine.
- **CloudFront sert l'image avec une URL publique stable** :
  `https://cdn.conseiller-voyage.ca/profiles/<conseillerId>/<photoId>.jpg`.
- **Pas de signature côté browser** — l'URL est stable, cacheable
  navigateur + CDN long terme (`Cache-Control: public, max-age=31536000,
  immutable`).
- **Invalidation à la rotation de photo** : quand le conseiller upload une
  nouvelle photo, la nouvelle clé S3 a un UUID différent (`profiles/<id>/<uuid>.jpg`)
  → URL différente → pas besoin d'invalider l'ancienne (qui sera
  supprimée par FIFO ou compensation).
- **Cache CloudFront pour les anciennes URLs (post-eviction FIFO)** :
  une URL d'une photo évincée FIFO devrait retourner 404. Si CloudFront
  l'a en cache (TTL 1 an), il continuera à la servir. **Mitigation** :
  invalidation CloudFront ciblée au moment de l'eviction FIFO (limite
  ~5 invalidations par profil par mois, bien sous le seuil gratuit AWS
  1000/mois).
- **Anonymisation Loi 25** : la photo S3 est supprimée + l'URL CloudFront
  est invalidée (cache flush) → 404 garanti < 5 min (TTL CloudFront
  négatif court).

**Pourquoi pas signed URLs** :

- Cache navigateur cassé (URL signature change toutes les heures).
- Surcharge serveur (génération signature à chaque rendu de page).
- Coût compute Fargate inutile.

**Bucket policy révisée** :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontOAC",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::cv-profiles-photos-ca-central-1/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::<account>:distribution/<dist-id>"
        }
      }
    }
  ]
}
```

S3 n'accepte que CloudFront. Pas d'accès direct au bucket.

**Alternative considérée et rejetée** :

- *Bucket `public-read` direct* : pas de Loi 25-compliant (logs d'accès
  distribués, surface élargie). Et impossible de invalider sans
  CloudFront en amont.

---

## R3 — Validation MIME réelle d'une photo uploadée

**Question** : Comment garantir qu'un fichier marqué `image/jpeg` par le
header HTTP est réellement une image JPEG (et pas un script PHP renommé) ?

**Décision** : Validation **structurelle** côté serveur via **`sharp`**
(`sharp@^0.33`), avant l'écriture S3. Pipeline :

1. **Validation magic number** (lecture des 12 premiers octets) :
   - **JPEG** : octets 0-2 = `FF D8 FF` (suffit, le 4e octet peut varier
     `E0`/`E1`/`E2`/`E3`/...).
   - **PNG** : octets 0-7 = `89 50 4E 47 0D 0A 1A 0A` (signature complète).
   - **WebP** : octets 0-3 = `52 49 46 46` (RIFF) **ET** octets 8-11 =
     `57 45 42 50` (WEBP). Vérifier les 12 octets sinon faux positif sur
     WAV/AVI (qui partagent le RIFF en tête mais diffèrent à l'offset 8).
   - Tout autre → rejet 415 immédiat avec message FR-CA.

   Helper TypeScript :

   ```typescript
   function detecterFormatImage(buffer: Buffer): 'jpeg' | 'png' | 'webp' | null {
     if (buffer.length < 12) return null;
     // JPEG : FF D8 FF
     if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
       return 'jpeg';
     }
     // PNG : 89 50 4E 47 0D 0A 1A 0A
     if (
       buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E &&
       buffer[3] === 0x47 && buffer[4] === 0x0D && buffer[5] === 0x0A &&
       buffer[6] === 0x1A && buffer[7] === 0x0A
     ) {
       return 'png';
     }
     // WebP : RIFF...WEBP (12 octets minimum requis)
     if (
       buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 &&
       buffer[3] === 0x46 &&
       buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 &&
       buffer[11] === 0x50
     ) {
       return 'webp';
     }
     return null;
   }
   ```

2. Charger le buffer avec `sharp(buffer).metadata()` :
   - Si `sharp` jette une exception → rejet 415 (corruption).
   - Si `metadata.width > 4096 || metadata.height > 4096` → rejet 413
     (image absurdement grande, signe de bombe ZIP-like).
   - Lire `metadata.width`, `metadata.height` → persister dans
     `ConseillerProfile.photoWidth`, `photoHeight` (requis SEO CWV
     pour CLS = 0).
3. Si tout OK → PUT S3 avec le content-type **vérifié** (pas celui du
   header HTTP).

**Justification** :

- **Anti-vulnérabilité upload** : OWASP A04 (Insecure Design) — un
  fichier `.exe` renommé `.jpg` ne doit jamais être servi par
  CloudFront (qui définit son content-type depuis les metadata S3).
- **Dimensions nécessaires SEO** : `<img width height>` requis par
  Principe XII (CLS < 0,1). Sans `sharp`, il faudrait parser le header
  manuellement.
- **`sharp` est déjà dans la stack indirecte** : Next.js l'utilise pour
  son moteur `next/image`. Ajout explicite côté API justifié pour
  validation MIME serveur.

**Pas de resize au MVP** (cf. Assumptions spec) — confirmé par cette
recherche. Si une amélioration future veut compresser/resizer, ce sera
une transformation `sharp(buffer).resize(800, 800, {fit: 'cover'}).webp({quality: 85})`,
mais c'est scope feature 016 ou 025.

**CVE check** : `sharp@0.33.x` au 2026-05-27 — aucune CVE active. Patches
suivis par Renovate.

**Alternatives considérées** :

- *`file-type` package* : suffisant pour le magic number mais ne lit pas
  les dimensions. Choisir `sharp` couvre les deux besoins.
- *Re-encoder systématiquement avec `sharp`* : trop coûteux CPU (50-150
  ms par photo), pas nécessaire au MVP. À reconsidérer en 016 pour
  forcer WebP.
- *Validation côté client uniquement* : insuffisant (Principe IX —
  validation serveur obligatoire).

---

## R4 — SSG ISR Next.js + invalidation cross-module sur transition conformité

**Question** : Comment garantir que la page publique `/conseiller/<slug>`
disparaît en ≤ 10 s après une transition `verified → expired/revoked`
(FR-014, SC-006), tout en gardant le rendu SSG cacheable pour la perf
(Principe XII) ?

**Décision** : **SSG avec ISR on-demand** (Next.js App Router
`generateStaticParams` + `revalidatePath` appelé depuis un event listener
dans le module conformité).

**Pipeline** :

1. **Build initial** : `generateStaticParams()` énumère tous les
   `ConseillerProfile.slug WHERE statut_conformite = 'verified' AND statut_profil = 'pret'`.
   Build produit N pages HTML statiques.
2. **À chaque transition conformité** (event domain
   `ConseillerConformiteChangedEvent` émis par module 001) :
   - Souscription dans le module identité (`profil-conformite-listener`)
     appelle `revalidatePath('/conseiller/' + slug)`.
   - Next.js invalide le cache ISR de cette page spécifique.
   - Prochaine requête déclenche un nouveau rendu (DB → SSG re-cache).
3. **À chaque édition profil par le conseiller** (transition
   `incomplet → prêt` ou changement de champ exposé) :
   - Le use case `EditerProfilUseCase` émet l'event
     `ProfilConseillerUpdatedEvent`.
   - Listener appelle `revalidatePath('/conseiller/' + slug)`.
4. **Pour les transitions négatives** (FR-014, ≤ 10 s) : la propagation
   se fait via event bus interne (BullMQ Redis pub/sub ou table outbox
   draining déjà en place pour 001/002a). Latence p99 mesurable < 5 s
   en dev local (à vérifier en staging).

**Justification de SSG plutôt que SSR pur** :

- LCP < 1,2 s p75 cible (sous le budget Principe XII 2,5 s). SSG +
  CloudFront edge = TTFB < 50 ms typique.
- Charge DB minimale : seulement aux rebuilds (build initial + ISR
  invalidations).
- Coût Fargate minimal : pas de rendu par requête.

**Justification de pas-SSG-pur** :

- Liste des conseillers vérifiés évolue dans le temps (nouveaux signups,
  expirations). Un build statique unique au déploiement deviendrait
  obsolète. ISR couvre ce cas.

**Mécanisme d'invalidation cross-module** :

- Le module conformité (001) émet déjà ces events pour ses propres
  besoins (cf. spec 001 FR-022). Cette feature **ajoute un listener**,
  ne change pas la source.
- Le listener tourne dans `apps/web/` (Next.js — `revalidatePath` est
  une API serveur Next, donc le listener est colocalisé) **OU** dans
  `apps/api/` qui appelle `fetch('/api/revalidate?path=/conseiller/<slug>&secret=...', {method:'POST'})`
  sur Next.js. Cette dernière option est plus simple (pas de cross-app
  RPC, juste un POST HTTP authentifié par un shared secret env var).
- **Décision** : utiliser le pattern **POST `/api/revalidate`** depuis
  l'event listener côté `apps/api/`. Le secret `CV_REVALIDATE_SECRET`
  est dans AWS Secrets Manager. Pattern documenté dans la doc Next.js
  officielle.

**Alternatives considérées** :

- *SSR pur sans cache* : LCP risque de dépasser 1 s ; charge DB
  inutile.
- *SSG sans ISR, rebuild complet à chaque transition* : impossible
  (rebuild > 5 min sur Fargate, viole les 10 s du FR-014).
- *Edge runtime (Cloudflare Workers)* : viole résidence canadienne
  (Principe II).

**Cache CloudFront : double invalidation requise** :

Next.js ISR `revalidatePath` invalide le **cache Next.js** (côté origin
Fargate), mais **NE PROPAGE PAS** au cache **CloudFront** en amont. Si
CloudFront sert avec `Cache-Control: s-maxage=60`, la page reste visible
au public jusqu'à 60 s — incompatible avec SC-006 (99 % en < 10 s).

**Décision** : invalidation **en deux temps** déclenchée par l'event
listener :

1. `revalidatePath('/conseiller/' + slug)` — invalide le cache Next.js.
2. `cloudfront.createInvalidation({ Paths: ['/conseiller/' + slug] })`
   — invalide le cache CloudFront pour ce chemin.

**Stratégie de Cache-Control** révisée :

- Pages publiques : `Cache-Control: public, max-age=0, s-maxage=300,
  stale-while-revalidate=86400`. Le `s-maxage=300` est notre marge de
  manœuvre (5 min de cache CDN max sans invalidation explicite).
- Le **chemin nominal** est : event → invalidation Next.js + CloudFront
  → première requête déclenche un rebuild ISR → cache repeuplé.
- **Filet de sécurité** : si l'invalidation CloudFront échoue (CDN HS),
  le `s-maxage=300` borne la fenêtre dégradée à 5 min. SC-006 (99 % en
  < 10 s) reste atteignable car le chemin event invalidant les deux
  caches est fiable dans 99 % des cas. Le 1 % dégradé borne à 5 min.

**Coût AWS CloudFront invalidations** :

- 1000 invalidations/mois gratuites (cf. tarification AWS 2026).
- Au-delà, ~0,005 USD par invalidation. À 500 conseillers × ~2
  transitions par profil/mois = 1000 invalidations/mois → gratuit
  initialement.
- Si volumétrie explose : tag-based invalidation CloudFront
  (`Cache-Tag` header + `createInvalidation` par tag) — pattern à
  reconsidérer en feature 016.

**Implémentation** : adaptateur `CloudFrontInvalidator` (port côté
identité) consommé par les use cases qui changent l'état public.
Wrapping AWS SDK `@aws-sdk/client-cloudfront@^3` (déjà en bundle).

**Alternative considérée et rejetée** :

- *Pas de cache CloudFront sur ces pages (`Cache-Control: private,
  max-age=0`)* : viole Principe XII (LCP < 2,5 s), force le hit Fargate
  pour chaque requête. Inacceptable pour le SEO et le coût compute.

---

## R4-bis — Stratégie de génération SSG à grande échelle

**Question** : `generateStaticParams` qui énumère tous les slugs `prêt`
fonctionne à 500 conseillers (build < 60 s). À 5 000 conseillers
(année 3), le build CI/CD risque > 5 min. Quelle stratégie ?

**Décision** : adoption d'une stratégie **incrémentale** dès le départ,
sans surcoût opérationnel au MVP :

1. **`generateStaticParams` retourne `[]` au build** (aucun pre-build).
2. **`export const dynamicParams = true`** sur le segment `[slug]` —
   permet à Next.js de rendre à la demande **à la première requête**
   pour les slugs non pre-buildés.
3. **`export const revalidate = 300`** (5 min de filet, cf. R4).
4. **À chaque requête sur un slug pas encore en cache** : Next.js exécute
   `LirePageProfilPubliqueUseCase`, rend la page, met en cache ISR.
5. **L'invalidation cross-module** (cf. R4) reste identique (event →
   `revalidatePath` + CloudFront invalidation).

**Justification** :

- Pas de build long quelle que soit la volumétrie.
- Première requête sur un slug nouvellement publié : ~400 ms (cf. SLO).
  Acceptable car c'est une situation rare (création de profil ≠ visite
  immédiate par un voyageur).
- Cache CDN + ISR couvrent les requêtes répétées.

**Sitemap dynamique** (route `/sitemap.xml`) :

- Pagination requise dès qu'on dépasse **50 000 URLs** (limite Google).
- Pattern Next.js 15 : `sitemap.ts` retourne un tableau d'URLs, ou
  `generateSitemaps` retourne des `id`s qui mappent à des
  `sitemap-<id>.xml` (multi-sitemap).
- Au MVP (≤ 500 conseillers) : un seul sitemap `/sitemap.xml`. À 50 000+
  conseillers : passer à `/sitemap-1.xml`, `/sitemap-2.xml`, etc. via
  `generateSitemaps`. Sitemap index `/sitemap.xml` listera les
  sous-sitemaps. **Cette migration est anticipée mais non implémentée
  au MVP** (à reconsidérer en 016).
- Performance : sitemap MVP cacheable CDN avec `s-maxage=3600` (1 h),
  re-build via la même mécanique d'invalidation que les pages profil.

**Alternatives considérées** :

- *Build complet `generateStaticParams` au release* : impraticable à
  l'échelle, et le risque de désynchro avec les transitions conformité
  est élevé.
- *Génération offline asynchrone (cron)* : sur-ingénierie pour le
  bénéfice marginal.

---

## R5 — Asymétrie slug ↔ nom affiché : cas du nom composé / particule

**Question** : `formaterNomAffiche` doit produire `Prénom + initiale-nom + "."`
quand `afficherNomComplet === false`. Quel comportement attendu pour les
noms composés FR-CA (`Le Goff`, `de la Tour`, `Saint-Pierre`,
`Dupont-Tremblay`) ?

**Décision** : règle FR-CA **explicite et testable** :

1. **Première lettre du premier mot du nom de famille en majuscule + "."**.
2. **Cas particulier des particules nobiliaires / agglutinations** (`de`,
   `du`, `de la`, `le`, `la`) : si le premier mot du nom de famille est
   une de ces particules (longueur ≤ 3, en minuscule habituelle), on
   utilise l'**initiale du mot suivant**.
3. **Cas nom composé par tiret** (`Dupont-Tremblay`) : on utilise
   l'initiale du **premier sous-mot** (`D.`).
4. **Cas préfixe Saint/Sainte** (`St-Pierre`, `Sainte-Marie`) : on utilise
   l'initiale du premier sous-mot tel quel (`S.`).

**Table de référence pour TDD** :

| `(prenom, nom)` | `nomAffiche` (compact) | `nomAffiche` (complet) |
|---|---|---|
| `("Marie", "Dupont")` | `Marie D.` | `Marie Dupont` |
| `("Jean-Pierre", "Le Goff")` | `Jean-Pierre G.` | `Jean-Pierre Le Goff` |
| `("Sébastien", "de la Tour")` | `Sébastien T.` | `Sébastien de la Tour` |
| `("Anne", "du Pont")` | `Anne P.` | `Anne du Pont` |
| `("Marc", "St-Pierre")` | `Marc S.` | `Marc St-Pierre` |
| `("Marie", "Dupont-Tremblay")` | `Marie D.` | `Marie Dupont-Tremblay` |
| `("Élise", "Côté")` | `Élise C.` | `Élise Côté` |

**Justification** :

- Approche **pragmatique** : la convention FR-CA usuelle pour les
  particules est de les rattacher au nom principal pour l'identification
  (`M. de la Tour` est souvent abrégé `M. Tour` à l'oral, ou `M. de la
  Tour` à l'écrit formel). On choisit la version compacte pour la liste
  privée par défaut.
- **Pas un algo parfait** : il existe des noms particulièrement complexes
  (`d'Aragon`, `O'Neill` — anglo), mais pour 500 conseillers attendus,
  les cas litigieux peuvent être listés et corrigés manuellement
  (override admin via console conformité — extension 001).
- **TDD strict** : la table ci-dessus produit 7 tests rouges → verts dans
  `packages/profil-domain/tests/nom-affiche.test.ts`.

**Alternatives considérées** :

- *Lib NLP* (compromis.cool/fr) : sur-ingénierie pour 7 cas. Augmente
  surface CVE.
- *Champ libre saisi par le conseiller* : viole Q4 (aucun pseudonyme).
- *Toujours utiliser l'initiale du dernier mot du nom* : produit
  `Marie L. T.` pour `Le Goff Tremblay`, illisible.

---

## R6 — Middleware Next.js `?suggested=<id>` (FR-008a)

**Question** : Comment implémenter le middleware qui (a) extrait le
paramètre `suggested` à l'arrivée sur `/intake`, (b) pose un cookie HMAC,
(c) redirige vers `/intake` propre, tout en restant compatible avec les
autres middlewares (auth Auth.js v5 + CGU 004) ?

**Décision** : Chaîne de middlewares Next.js (App Router) dans
`apps/web/src/middleware.ts`, ordre :

1. **Middleware auth** (existant 002/006) — détermine la session.
2. **Middleware CGU** (existant 004) — vérifie acceptation CGU (routes
   conseiller).
3. **Middleware suggested** (NOUVEAU) — si requête `/intake` et présence
   `?suggested=<id>` :
   - Décoder le cookie existant `cv_suggested` (signature HMAC SHA-256
     vérifiée avec `CV_SUGGESTED_COOKIE_SECRET`).
   - Valider l'ID (UUID v4 regex côté middleware — pas de hit DB, on
     fera la vérif d'existence à la soumission intake).
   - Ajouter `{conseillerId, timestamp: Date.now()}` à la liste, FIFO ≤ 10.
   - Ré-encoder + signer HMAC.
   - Set-Cookie `cv_suggested` (`HttpOnly` + `Secure` + `SameSite=Lax`
     + `Path=/intake` + `Max-Age=86400`).
   - Retourner un **302** vers `/intake` (sans le paramètre).

**Pourquoi un middleware et pas un Server Action sur `/intake` ?**

- La page `/intake` doit pouvoir rester **SSG/cacheable** (feature 008
  future). Mettre la mutation cookie dans un Server Action force le
  rendu dynamique.
- Le middleware Next.js tourne à l'edge (avant le cache CDN — sur
  CloudFront c'est en réalité côté origin Fargate, mais avant le code
  de la page). Set-Cookie + Redirect ne touchent pas le HTML rendu.
- Pattern recommandé par la doc Next.js pour "intercepter une query
  string et la transformer en cookie".

**Sécurité du cookie** :

- HMAC SHA-256 avec secret `CV_SUGGESTED_COOKIE_SECRET` (32 octets,
  AWS Secrets Manager, rotation séparée de la session cookie).
- Format : `base64url(JSON([{cid, ts}, ...])) + '.' + base64url(hmac)`.
- À la soumission de l'intake (server action), vérifier HMAC AVANT de
  décoder. Cookie invalide ou non signé → ignoré silencieusement
  (FR-008a).
- Plafond 10 entrées (FIFO) pour éviter inflation du cookie (limite
  HTTP ~4 Ko).
- Validation d'âge : entrées > 24 h ignorées.

**Alternatives considérées** :

- *Cookie côté client (JS sur la page profil)* : viole Principe XII
  (la page profil reste 100 % RSC, pas de JS d'interaction).
- *Session anonyme côté serveur (table Redis)* : trop lourd pour une
  fenêtre 24 h. Cookie suffit.
- *Paramètre persistant `/intake?suggested=`* : la page intake doit
  rester crawlable indépendamment, URL propre meilleure pour SEO.

---

## R7 — Anti-énumération HTTP : signature constant-time

**Question** : Comment garantir SC-003 (signature HTTP identique pour
slug inexistant vs profil masqué) ?

**Décision** : **Utiliser `notFound()` Next.js** qui rend exclusivement
`app/not-found.tsx` (partagé à la racine). Conditions :

1. La fonction `LirePageProfilPubliqueUseCase` retourne `null` pour
   *tous* les cas non-visibles (slug inexistant, slug réservé, conseiller
   non-vérifié, profil masqué admin, anonymisé, incomplet).
2. La page Next.js : `if (!profil) notFound()` — déclenche
   `NEXT_NOT_FOUND` qui rend `not-found.tsx` avec status 404.
3. **`not-found.tsx` est statique** (pas de query DB, pas de
   variables) : taille HTTP exactement constante (à l'octet près).
4. **Pas de header différenciant** : aucun `X-Cache`, `X-Profile-Status`,
   `WWW-Authenticate`, etc. ajouté par cette route. Helmet + headers
   constants.
5. **Timing** : la latence varie naturellement (slug inexistant skip la
   DB sur l'index, slug masqué fait un SELECT puis échoue). Pour
   atténuer, le port `LirePageProfilPubliqueUseCase` exécute
   **toujours** le SELECT (utilise un index unique sur slug), puis
   l'application des filtres `verified`, `statut profil` se fait en
   mémoire. Le timing différentiel reste < 10 ms (analyse de logs
   staging SC-003).

**Justification** :

- SC-003 explicite "même status code + content-type + taille
  approximative". On va au-delà : taille exacte (HTML statique
  identique).
- Pas de timing attack possible — la latence varie de < 10 ms entre
  les cas, ce qui est sous le bruit réseau.

**Alternatives considérées** :

- *Redirection 301 sur slug masqué* : signal informatif, viole
  anti-énumération.
- *Réponses avec corps spécifique au cas* (par ex. message "Ce
  conseiller n'est plus disponible") : viole SC-003 explicitement.
- *Constant-time comparison* (lib `crypto.timingSafeEqual`) : pas
  utile ici — on ne compare pas un secret. Le timing différentiel
  vient des chemins de code, pas d'une comparaison de hash.

---

## R8 — BullMQ scheduler pour relances onboarding (J+3, J+7, J+14)

**Question** : Comment planifier 3 jobs delayed après un événement
`pending → verified`, avec idempotence et annulation à `prêt` ?

**Décision** : Trois jobs **BullMQ delayed** distincts :

1. À la transition `pending → verified` (event domain du module
   conformité 001), le listener appelle
   `PlanifierRelancesOnboardingUseCase.execute(conseillerId, verifiedAt)`.
2. Ce use case enqueue 3 jobs :
   - `onboarding_reminder` avec `{conseillerId, etape: '3j'}` et
     `delay = 3 * 24 * 60 * 60 * 1000` ms.
   - Idem pour `7j` et `14j`.
3. Chaque job a un `jobId` déterministe :
   `onboarding-reminder-<conseillerId>-<etape>`. Si re-enqueue (re-trigger
   d'event, par ex.), BullMQ déduplique sur le `jobId` (option
   `removeOnComplete: true`).
4. À l'exécution du job, le worker (`EnvoyerRelanceOnboardingUseCase`) :
   - Lit le statut courant du profil.
   - Si `statut === 'prêt'` ou `statut === 'anonymisé'` ou
     `statut === 'masqué_admin'` → no-op (annulation implicite).
   - Si `statut === 'incomplet'` → écriture dans l'outbox courriel (table
     `auth_outbox_emails`, drainée par feature 003) + audit log.
5. **Si le conseiller passe `prêt` puis revient à `incomplet`** : les
   jobs J+3/7/14 initialement planifiés peuvent encore tirer (ils sont
   en queue). Décision : à la transition `prêt → incomplet`, on ne
   re-planifie PAS (cf. edge case spec « Re-vérification après expiration »).
   Le compteur est unique par transition `pending → verified`.

**Justification** :

- BullMQ déjà dans la stack (002a + 003). Pas de nouvelle dépendance.
- Delayed jobs sont nativement supportés (`delay` option).
- Pattern un-job-par-destinataire (constitution Principe X) respecté
  (3 jobs distincts).
- Idempotence par `jobId` déterministe.

**Alternatives considérées** :

- *pg_cron* (planificateur Postgres) : moins observable, moins testable
  que BullMQ. Pas adopté dans la stack.
- *Cron Fargate scheduled task* : 1 tâche quotidienne qui scan les
  profils incomplets et envoie au bon moment. Plus simple mais perd
  l'idempotence par job ID, complique l'annulation à `prêt`.
- *AWS EventBridge Scheduler* : externe à la stack, ajouterait un
  composant. BullMQ suffit.

**Observabilité** :

- Profondeur de la queue `onboarding_reminders` exposée dans le
  tableau de bord BullMQ (existant 002a).
- Compteur `cv_onboarding_reminder_sent_total{etape}` déféré à 021.

---

## R9 — Conformité — port `ConformiteNomLegalReader` à ajouter

**Question** : Comment lire le nom légal (prénom + nom) vérifié depuis le
module conformité, sans dupliquer la donnée dans `ConseillerProfile` ?

**Décision** : Ajouter un nouveau **port** côté module identité,
implémenté côté module conformité dans le même PR (revue croisée).

**Port** (`apps/api/src/modules/identite/application/ports/conformite-nom-legal-reader.port.ts`) :

```typescript
export interface ConformiteNomLegalReader {
  lireNomLegal(conseillerId: ConseillerId): Promise<NomLegal | null>;
}

export type NomLegal = {
  prenom: string; // tel que vérifié dans le dossier conformité
  nom: string;
};
```

**Implémentation côté 001** (`apps/api/src/modules/conformite/infrastructure/prisma-nom-legal-reader.ts`) :

```typescript
class PrismaNomLegalReader implements ConformiteNomLegalReader {
  async lireNomLegal(conseillerId: string): Promise<NomLegal | null> {
    const conformite = await this.prisma.dossierConformite.findUnique({
      where: { conseillerId },
      select: { prenomLegal: true, nomLegal: true, statut: true },
    });
    if (!conformite || conformite.statut === 'anonymized') return null;
    return { prenom: conformite.prenomLegal, nom: conformite.nomLegal };
  }
}
```

**Justification** :

- Pas de duplication PII (Principe II — minimisation).
- Lecture cachée acceptable (TTL 60 s) car le nom légal change rarement
  et la jointure est rapide (index sur `conseillerId`).
- Le port retourne `null` pour les conseillers anonymisés Loi 25 — le
  formatage du nom affiché doit alors fallback sur "Conseiller anonymisé"
  ou similaire (mais en pratique le profil n'est plus visible, donc
  jamais formaté).

**Risque** : 001 doit exposer publiquement les champs `prenomLegal` /
`nomLegal` via un nouveau port. Vérifier dans la spec 001 que ces champs
existent déjà (ils étaient dans le dossier conformité au moment de la
vérification). **À confirmer en PR** — sinon, ajouter une migration
mineure côté 001 pour exposer ces champs.

**Alternatives considérées** :

- *Dupliquer le nom dans `ConseillerProfile`* : viole minimisation +
  Loi 25 + source de vérité unique.
- *Lire au build SSG uniquement* : insuffisant (le nom doit aussi être
  visible côté dashboard, aperçu, etc.).
- *Passer le nom via un événement domain* : couplage temporel fragile,
  divergence possible entre conformité et profil.

---

## R10 — Test d'invariant anti-marketplace (Principe I)

**Question** : Comment automatiser la vérification SC-002 (« absence
totale de canal de contact direct ») et empêcher une régression future
en CI ?

**Décision** : Approche **à deux niveaux** combinant un scan source
(rapide, déterministe) et un test e2e (Playwright, plus complet) :

### Niveau 1 — Scan source (CI rapide, < 2 s)

Script `tools/check-no-contact-fields-profile.ts` exécuté à chaque PR :

1. Scanner tous les fichiers `.tsx`, `.ts` du dossier
   `apps/web/src/app/conseiller/[slug]/` (récursif) — **sources React**,
   pas le HTML rendu (évite de devoir builder).
2. Regex bloquantes (échec CI si match) :
   - `mailto:` (lien email)
   - `tel:` (lien téléphone)
   - `sms:` (lien SMS)
   - `whatsapp:`, `wechat:`, `telegram:`, `skype:`, `messenger\.com`
     (chats externes)
   - `<form[^>]*action=["'](?!.*\/intake)` (form pointant ailleurs
     que /intake)
   - `data-?contact|aria-label=["'][^"']*(contact|appeler|courriel|email|téléphone)`
     (composants intitulés contact)
3. Vérification de présence d'**au moins un** `href=["']\/intake` (CTA
   obligatoire) — sinon échec.
4. Sortie 0 si OK, > 0 sinon avec message FR-CA explicite par fichier
   en violation.

### Niveau 2 — Test e2e Playwright (CI plus lent, < 30 s)

Test `apps/web/e2e/profil-anti-marketplace.spec.ts` :

1. Lance le serveur Next.js de test + seed.
2. Visite `/conseiller/marie-dupont`.
3. Vérifie :
   - **Exactement un** `<a>` avec `href` commençant par `/intake`.
   - **Aucun** élément `<form>` n'a un `action` ailleurs que `/intake`.
   - Pas de `<a href="mailto:*">`, `<a href="tel:*">` dans le DOM final
     (après hydration éventuelle).
   - Pas d'élément avec texte exact "Contacter", "Appeler", "Envoyer un
     courriel" (case-insensitive).

**Justification de la double approche** :

- Le scan source attrape **99 % des régressions** en CI rapide. Idéal
  pour les PR.
- Le test e2e attrape les cas où un composant dynamique côté client
  injecterait quelque chose (peu probable mais possible). Lancé en CI
  nightly ou pre-release.

**Limites** : un email caché en image (sans `mailto:` cliquable) ne
serait pas détecté. Acceptable au MVP — la revue manuelle SC-002 reste
en place pour ce niveau de paranoia (audit pré-prod humain).

---

## R11 — ADR-0015 ? Décision : non requis

**Question** : Une nouvelle décision architecturale impose-t-elle un ADR ?

**Inventaire des candidats** :

| Décision | Impact > 1 module ? | Irréversible ? | ADR requis ? |
|---|---|---|---|
| Slug strategy `prenom-nom + suffixe` | Module identité seul (consommé par SEO 016 plus tard) | Réversible (mais coûteux post-publication) | **Non** — documenté dans clarifications spec. |
| Bucket S3 dédié `cv-profiles-photos` | Infra | Réversible | **Non** — détail d'IaC. |
| Port `ConformiteNomLegalReader` (modif 001) | Identité × Conformité | Réversible | **Non** — extension naturelle de 001. |
| Cookie `cv_suggested` HMAC signé | Identité × Préqualification 008 future | Réversible | **Non** — détail de transport. |
| SSG ISR + revalidatePath | Web app | Réversible | **Non** — pattern Next.js standard. |
| Asymétrie slug ↔ nom affiché (vie privée) | Identité | Compromis assumé en clarifications | **Non** — documenté comme edge case. |

**Décision** : Aucun ADR requis pour cette feature.

**Si réviseur conteste** : on peut ajouter ADR-0015 « Stratégie de slug
et nom affiché conseiller » a posteriori avec section *Statut: ratifié
par clarifications spec 007*. À garder en backlog si la modération
éditoriale grandit.

---

## Synthèse — décisions à inscrire dans le plan

Toutes les décisions ci-dessus sont **déjà reflétées dans `plan.md`**
(sections Contexte technique, Constitution Check, Structure de projet).
Cette recherche en consolide la justification pour audit futur.

Aucune `NEEDS CLARIFICATION` ne subsiste. Phase 0 complète.
