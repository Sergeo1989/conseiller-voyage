# Phase 0 — Recherche : Mentions légales, CGU, politique de confidentialité

**Date** : 2026-05-25

Décisions techniques structurantes pour le plan d'implémentation, motivées
par les contraintes de la spec et de la constitution v2.2.0.

---

## R1 — Format du contenu éditorial

### Décision

**MDX** sous `packages/legal-content/<locale>/<slug>.mdx`, avec frontmatter
standardisé.

### Rationale

- Contenu majoritairement narratif (paragraphes, listes, titres) — Markdown
  rendu naturel.
- Possibilité d'injecter des composants React quand utile (composant
  `<DefinitionLegale>` réutilisable, tableau de rétention dynamique
  référençant l'enum partagé `RetentionScheduleEnum`, lien vers
  `/comment-ca-marche` formaté par next-intl).
- Frontmatter typé (`version: number`, `publishedAt: string ISO`,
  `effectiveAt: string ISO`, `checksum?: string`) permet à un script de
  build de vérifier la cohérence et de générer la table `LegalDocument`
  au déploiement.
- Tooling Next.js 15 supporte nativement MDX via `@next/mdx`.
- Maintenance par un éditeur non technique : on attend de lui qu'il
  modifie le texte ; le frontmatter (3-4 lignes) est compréhensible avec
  une procédure documentée d'une page.

### Alternatives évaluées

- **Markdown pur (frontmatter YAML)** — perdu la capacité d'injecter des
  composants. Tableau de rétention dynamique impossible sans duplication.
- **JSON structuré** — illisible pour un juriste qui relit. Hostile au
  diff Git pour suivre les évolutions de texte.
- **CMS headless (Strapi, Sanity, etc.)** — surcouche disproportionnée
  au MVP. Nouvelle infrastructure régionale à déployer (Principe II).
  Coût opérationnel non justifié pour 5 pages qui changent < 1×/an.
- **Composants React pleins** — le contenu juridique vit dans la matière
  grise du juriste, pas dans le code. Le découpler en MDX permet la
  relecture par non-développeur.

---

## R2 — Versioning des documents légaux

### Décision

**Entier monotone** dans le frontmatter (`version: 1`, `version: 2`, ...)
**+ checksum SHA-256** du contenu rendu (corps MDX sans frontmatter).

Le bump de version est **manuel** lors d'un changement éditorial significatif
(décision juridique : un changement de texte qui modifie une obligation ou
un droit déclenche un bump ; une coquille n'en déclenche pas).

Une migration de schéma Prisma seed la table `auth_legal_documents` avec
les versions courantes au déploiement (script `seed-legal-documents.ts`
exécuté en post-deploy).

### Rationale

- **Entier monotone** : simple, lisible, pas d'ambiguïté sur l'ordre. Pas
  besoin de semver (ces documents n'ont pas de breaking changes au sens
  software — c'est binaire : tu acceptes la version actuelle ou pas).
- **Checksum** : garde-fou contre les modifications silencieuses du
  contenu sans bump de version. Le script de build refuse de déployer
  si le checksum d'un MDX a changé sans que sa version frontmatter ait
  été incrémentée.
- **Manuel** : forcer la décision humaine évite les bumps automatisés
  qui spammeraient les conseillers de demandes de ré-acceptation.

### Alternatives évaluées

- **SemVer (1.0.0)** — sur-ingénierie pour un document binaire.
- **Hash de contenu seul** — pas de garantie d'ordre lexicographique
  (`abc` vient avant `def` mais ça ne dit rien sur l'antériorité).
  Nécessite une métadonnée d'horodatage en plus, redondance.
- **Git commit SHA** — fragilise la lecture humaine (les SHAs sont des
  identifiants opaques) et lie le versioning au commit, pas à la
  décision éditoriale.
- **Date de publication comme version** (`2026-05-25`) — fonctionne mais
  rend les comparaisons SQL plus verboses, et expose la date dans
  l'API publique de ré-acceptation alors que ce n'est pas pertinent
  pour le frontend.

---

## R3 — Anonymisation du `subjectId` lors d'un effacement Loi 25

### Décision

**SHA-256(`subjectId` || `project_salt`)** où `project_salt` est un secret
de 32 bytes stocké dans AWS Secrets Manager `ca-central-1` (sous la clé
`conformite/loi25/subject-anonymization-salt`).

Le salt est généré **une fois** au déploiement initial et **jamais
roté** — la rotation invaliderait les hashes existants et casserait
l'invariant d'unicité historique.

### Rationale

- Cohérent avec l'arbitrage déjà acté en 001 pour le journal d'audit
  conformité (preuve > effacement, anonymisation préserve la preuve sans
  cross-reference).
- SHA-256 est cryptographiquement irréversible sans le salt + dictionnaire
  d'UUIDs candidats. Avec ~500 conseillers année 1 et un salt de 32 bytes,
  la difficulté d'attaque est ~2^256, suffisant.
- Le salt en AWS Secrets Manager protège contre les fuites partielles de
  BD : un attaquant qui obtient les hashes sans le salt ne peut pas
  reverser.
- Pas de rotation du salt : sinon perte de l'invariant « une `LegalAcceptance`
  anonymisée reste-t-elle distincte d'une autre du même utilisateur ? ».
  L'IAM enforce strict access au secret.

### Alternatives évaluées

- **Bcrypt** — conçu pour mots de passe (slow hash). Trop lent pour
  l'anonymisation de millions de rows en batch. Pas adapté à l'usage.
- **Argon2id** — même problème (slow hash). Trop coûteux pour notre
  scénario (effacement = job batch, pas validation login).
- **SHA-256 sans salt** — un attaquant qui devine un UUID (ou en a une
  liste de candidats — ils sont prévisibles via le module identité) peut
  trivialement reverser via dictionnaire.
- **Suppression pure et simple du `subjectId` (NULL)** — perd la
  distinction entre acceptations de différents utilisateurs anonymisés.
  La preuve « N personnes distinctes ont accepté la version X au moment
  Y » est cassée.
- **HMAC-SHA256** — équivalent fonctionnel à SHA-256 + salt côté
  irreversibilité. Marginalement plus sûr contre length-extension
  (non pertinent ici). Bonne option de seconde meilleure, sans gain
  pratique.

---

## R4 — Vérification de version CGU obsolète : où poser le check ?

### Décision

**Middleware Next.js** (`apps/web/src/middleware.ts`) qui intercepte les
requêtes vers les routes protégées du conseiller
(`/[locale]/(conseiller)/**`), lit la session Auth.js, et vérifie via un
appel léger au backend (cache local 5 min côté middleware) que la version
`cgu_b2b` acceptée par le conseiller est à jour. Si obsolète, redirige
vers `/[locale]/cgu-conseiller/re-accepter` qui affiche la nouvelle
version et un bouton « Je l'accepte ».

L'API publique conformité (port `ConformiteQueryPort` côté matching) **ne**
fait **pas** ce check — c'est une responsabilité UX du module identité,
pas un filtre métier.

### Rationale

- **Middleware Next.js** s'exécute sur l'edge avant tout RSC — le check
  est centralisé, pas dispersé page par page.
- Le voyageur n'est pas concerné : son acceptation est liée au `briefId`
  (one-shot par brief). Pas de ré-acceptation rétroactive.
- Le conseiller, lui, a une session persistante et peut traverser un bump
  de version sans s'en rendre compte sans ce check.
- Cache local 5 min : limite le nombre d'appels backend (chaque requête
  Next.js ne re-checke pas — le middleware honore un cookie de version
  acceptée qui expire à 5 min). Compromis raisonnable entre latence et
  fraîcheur.
- Routes touchées : tableau de bord conseiller, leads, profil. Pas les
  pages publiques (footer / pages légales restent accessibles même en
  cas de version obsolète — sinon impossible de la lire et de l'accepter).

### Alternatives évaluées

- **Interceptor NestJS** côté backend sur chaque endpoint — chaque action
  conseiller doit re-check. Coûteux en latence et duplique la logique
  partout.
- **Server Component check sur chaque page** — duplique le check, oublié
  facilement quand une nouvelle page est ajoutée.
- **Client Component avec polling** — fait quitter le SSR, dégrade UX
  (flash de contenu avant redirect).
- **Trigger DB sur insert/update conseiller** — couche métier dans la DB,
  refusé par Principe VIII (Clean Architecture, pas de logique business
  dans triggers sauf cas spéciaux comme l'append-only audit en 001).

---

## R5 — Granularité du consentement Loi 25 au brief intake (US4)

### Décision

**Deux cases à cocher séparées** dans le formulaire intake (livré par 002) :

```text
[ ] J'accepte la politique de confidentialité (Loi 25) — explique
    quelles données sont transmises à jusqu'à 3 conseillers et combien
    de temps elles sont conservées.

[ ] J'accepte les conditions générales d'utilisation voyageur — explique
    le modèle de mise en relation et l'absence de transaction sur la
    plateforme.
```

Chaque case produit une `LegalAcceptance` distincte
(`type='confidentialite'` et `type='cgu_b2c'`).

### Rationale

- **Loi 25 article 8** : « Le consentement doit être manifesté de façon
  libre et éclairée. Il doit être donné à des fins spécifiques. Il doit
  être demandé pour chacune de ces fins, en termes simples et clairs. »
  Le « pour chacune de ces fins » impose la granularité — un consentement
  groupé peut être qualifié de non-spécifique par la CAI.
- Précédent : le RGPD européen impose la même granularité (« unbundled
  consent ») et c'est la pratique standard des outils canadiens
  conformes Loi 25 (Cooktech, Termly Québec, etc.).
- Coût UX : minimal (deux clics au lieu d'un). Et la séparation visuelle
  aide le voyageur à comprendre qu'il accepte deux choses différentes.

### Alternatives évaluées

- **Une seule case groupée** — risque légal direct. Une plainte CAI
  pourrait obtenir l'invalidation de tous les consentements collectés
  groupés. Coût de non-conformité disproportionné face au coût UX
  d'un clic supplémentaire.
- **Trois cases (confidentialité, CGU, marketing)** — pas de
  finalité marketing au MVP, donc trois serait artificiel. Si du
  marketing est ajouté plus tard, on ajoutera une troisième case.
- **Pré-cochage** — interdit explicitement par Loi 25 art. 8. Le
  consentement doit être actif.

---

## R6 — Parsing User-Agent pour anonymisation

### Décision

**`ua-parser-js`** (v2.x) — librairie de facto standard, ~20 KB, maintenue.

Fonction pure `extractBrowserFamily(ua: string): string` dans
`packages/legal/src/anonymization.ts`. Retour : nom de la famille du
navigateur (`'Firefox'`, `'Chrome'`, `'Safari'`, etc.), ou `'unknown'`
si parsing échoue ou retourne vide.

Comportement explicite :

- UA standard détecté → `result.browser.name` (Firefox, Chrome, Safari, Edge, Opera, ...)
- UA exotique ou bot non identifié → `'unknown'`
- UA vide / `null` / non-string → `'unknown'`
- Cas Robots reconnus → `'bot'` (pas d'identifiant individuel)

### Rationale

Parser un User-Agent string proprement est notoirement complexe (UAs
incluent versions, OS, devices, navigateurs vendor-modifiés). Réinventer
le parsing est un gouffre. `ua-parser-js` couvre les cas connus, mis à
jour régulièrement.

Pour Loi 25 art. 8 traçabilité, on n'a pas besoin de la version exacte
ni de l'OS — la famille suffit (« le user a confirmé avec Firefox »).

### Alternatives évaluées

- **Parsing manuel par regex** — sera incorrect sur les UAs modernes.
- **`bowser`** — alternative décente, mais maintenance moins active que
  `ua-parser-js` en 2026.
- **`platform`** — déprécié.
- **Cloudflare Workers User-Agent API** — coût supplémentaire, dépendance
  cloud, latence ajoutée. Pas justifié.

---

## R7 — Stratégie de transaction cross-module pour le double consentement intake

### Décision

**Alternative 2 — séquentiel avec lifecycle de brief** :

1. Le module `002-voyageur-intake` crée le brief en état `consent_pending`.
2. `002` appelle `LegalAcceptanceFacade.acceptForBrief()` deux fois
   (confidentialité + cgu_b2c) **dans la même transaction Prisma côté
   `identité`**. Cette transaction est gérée *intégralement* par la façade —
   `002` ne passe pas son client Prisma à `identité`.
3. Si les deux acceptances réussissent, `identité` retourne `OK` à `002`.
4. `002` met le brief à `consent_ok` puis `submitted` dans une transaction
   séparée.
5. **Si `acceptForBrief` échoue après la création du brief**, le brief reste
   en `consent_pending`. Un job BullMQ `OrphanBriefCleanupJob` quotidien
   (côté module `002` mais utilisant les ports identité en lecture)
   détecte les briefs `consent_pending` > 1 heure et les marque
   `consent_failed` (invisible côté matching).

### Rationale

- **Respecte la frontière modulaire** (Principe V) : aucun module externe
  ne partage un client Prisma avec `identité`. La façade encapsule sa
  propre transaction.
- **Atomicité préservée à la granularité utile** : si l'une des deux
  acceptances échoue, l'autre est rollback dans la même transaction. Le
  brief est créé séparément mais marqué `consent_pending` jusqu'à
  confirmation — il n'est jamais visible côté matching tant que
  `consent_ok` n'est pas atteint.
- **Pas de saga distribuée** : surcouche disproportionnée pour 2 inserts.
- **Orphans détectables et nettoyables** : la table `briefs` reste cohérente
  avec un état explicite ; pas de garbage silencieux.

### Alternatives évaluées

- **Alt 1 — Outbox pattern** : `002` écrit brief + événement
  `BriefSubmitted` ; `identité` consomme et crée les acceptances. Casse
  la garantie « brief n'est pas valide sans consentement » (latence outbox
  drain ~5 s livré en 001 → brief temporairement visible sans
  acceptances). Refusé.
- **Alt 3 — Saga avec compensation** : pattern explicite avec rollback.
  Sur-ingénierie pour 2 inserts.
- **Alt 4 (originale, rejetée) — transaction Prisma partagée** :
  `002` ouvre la transaction et la passe à `identité`. Casse Principe V.

### Impact sur le contrat

Le contrat `LegalAcceptanceFacade.acceptForBrief()` ne reçoit plus de
client Prisma externe. Il gère sa propre transaction. Le diagramme dans
`data-model.md` est mis à jour.

---

## R8 — Cookie de cache version : signature et sécurité

### Décision

**Cookie HTTP-only signé HMAC-SHA256** avec :

- Nom : `__Host-cv.legal-version` (préfixe `__Host-` pour locking strict)
- Attributs : `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`
- TTL : 5 minutes (max-age 300)
- Format du payload : `base64url(JSON.stringify({ userId, cguB2bVersion, exp })) + '.' + hmac`
- Secret HMAC : nouveau secret `LEGAL_COOKIE_HMAC_SECRET` (32 bytes) stocké
  dans AWS Secrets Manager `ca-central-1`. Distinct du salt
  d'anonymisation (R3) et du secret Auth.js v5.

### Endpoint backend pour le refresh

`GET /api/me/legal/version-status` (authentifié, AuthGuard) :

- Lit la version `cgu_b2b` acceptée la plus récente pour le `userId`.
- Lit la version `cgu_b2b` courante (max `version` WHERE `effectiveAt <= now()`).
- Retourne `{ accepted, current, status: 'up_to_date' | 'outdated' | 'never_accepted' }`.
- Set le cookie `__Host-cv.legal-version` dans la réponse.

Le middleware Next.js consomme ce endpoint **seulement** quand le cookie
est absent ou expiré. Sinon il décode le cookie localement (vérification
HMAC) et applique la logique.

### Comportement multi-tab

Cookie partagé entre tabs (même origine). Le premier tab qui détecte
l'expiration appelle le backend ; les tabs suivants voient le cookie
fraîchement set. Race théoriquement possible mais sans impact (l'endpoint
est idempotent et le résultat est identique).

### Comportement après acceptation

Le Server Action `/api/me/legal/accept` (qui crée la nouvelle
`LegalAcceptance`) émet aussi un `Set-Cookie` avec la nouvelle version
acceptée. Le middleware sur la requête suivante voit immédiatement le
cookie à jour, sans appel backend supplémentaire.

### Rationale

- **HMAC empêche la forge** : un conseiller mal intentionné ne peut pas
  écrire un cookie `{ cguB2bVersion: 999 }` pour bypass le check. Le
  middleware vérifie la signature, rejette si invalide → re-check
  backend.
- **`__Host-` préfixe** : Chrome/Firefox/Safari refusent de poser ce
  cookie sur sous-domaine ou avec `Secure: false`. Protège contre les
  vecteurs de pollution cross-subdomain.
- **HttpOnly** : aucune lecture côté JS — pas de XSS exfiltration.
- **TTL 5 min** : compromis latence vs fraîcheur. Si un bump de version
  arrive en production, les conseillers connectés voient la redirection
  vers `/cgu-conseiller/re-accepter` dans les 5 minutes maxi.

### Alternatives évaluées

- **Cookie non signé** — faille de sécurité directe (cf. review issue 5.1).
- **JWT court (5 min)** — équivalent fonctionnel à cookie signé, mais JWT
  ajoute du parsing JWT + bibliothèque jsonwebtoken. HMAC raw plus
  léger.
- **Refresh à chaque requête** — surcouche backend inutile. La fraîcheur
  5 min est suffisante pour un changement de version (qui se compte en
  jours, pas en secondes).

---

## R9 — Threat model du salt d'anonymisation Loi 25

### Décision

Documenter explicitement le threat model du `project_salt` (cf. R3) :

**Qui peut lire le secret** :

- Rôle IAM ECS Fargate de l'application backend (lecture seule).
- Rôle IAM `terraform-deployer` (pour rotation manuelle, jamais utilisé
  sauf incident).
- Auditeur IAM (lecture des métadonnées du secret, pas de la valeur).

**Plan de réponse à incident en cas de fuite** :

1. Détection (alerte IAM CloudTrail sur accès non-attendu) → SecOps notifié.
2. Génération d'un nouveau salt v2 en AWS Secrets Manager (la v1 reste
   pour les hashs historiques — versionnement de secret natif AWS SM).
3. Job batch `RehashLegalAcceptancesJob` qui rehash tous les
   `subjectIdHash` avec salt v2 :
   - Pour les acceptations dont `subjectId` n'est PAS encore anonymisé
     (`subjectId` toujours présent) : recalcul direct.
   - Pour les acceptations déjà anonymisées (`subjectId IS NULL`,
     `subjectIdHash` calculé avec salt v1) : on ne peut **pas**
     recalculer (le `subjectId` original est perdu). Accepter la perte
     d'invariant d'unicité historique pour ces rows ; flag
     `anonymizationSaltVersion: 1` à conserver dans une colonne dédiée
     pour audit.
4. Rotation du secret v1 → v2 (l'app ne peut plus le lire en clair).

**Accept** : la rotation casse l'invariant « deux acceptances anonymisées
ne peuvent pas être confondues pour le même utilisateur ». C'est un
trade-off explicite documenté ici. Pour limiter l'impact, garder le salt
v1 lisible (`grant_decrypt` IAM) en read-only pour les jobs forensiques
si nécessaire.

**Garde-fous** :

- Audit IAM trail sur la valeur du secret (lecture loggée).
- Pas de copie du secret dans les logs, env vars en dev (utiliser
  1Password CLI à la place).
- Tests d'intégration n'utilisent pas le vrai salt (`TEST_SALT` fixe).

### Impact data-model

Ajouter colonne `anonymizationSaltVersion: int @default(1)` sur
`LegalAcceptanceAnonymization` (cf. data-model révisé) pour tracer quel
salt a été utilisé. Permet le rolling rotation.

---

## Synthèse

Les 9 décisions sont alignées avec :

- **Constitution v2.2.0** : Principes II (Loi 25), V (modularité — cf. R7
  cross-module sans partage Prisma), VIII (Clean Architecture), IX
  (sécurité, validation, cookie HMAC signé en R8, threat model salt en
  R9), XI (a11y — labels cases à cocher), XII (SEO — SSG préservé).
- **Stack canonique** : Next.js 15, Prisma 5, NestJS 10, AWS Secrets
  Manager (déjà en place via 001).
- **Patterns existants** en 001 : Auth.js v5 sessions partagées,
  CSRF middleware, idempotency interceptor, pattern outbox + BullMQ
  pour les jobs périodiques (orphan cleanup en R7).

Nouvelles dépendances externes introduites :

- `@next/mdx` + `@mdx-js/loader` + `@mdx-js/react` (R1) — écosystème Next.js
  officiel
- `ua-parser-js` (R6) — librairie standard légère, ~20 KB

Nouveaux secrets AWS Secrets Manager `ca-central-1` :

- `conformite/loi25/subject-anonymization-salt` (R3) — 32 bytes, jamais roté
  sauf incident (cf. R9 plan de réponse)
- `legal/cookie-hmac-secret` (R8) — 32 bytes, distinct du salt et d'Auth.js

ADRs à créer (documentation formelle des décisions structurantes) :

- **ADR-0008** — Anonymisation par hash salé pour traçabilité Loi 25
  (formalise R3 + R9)
- **ADR-0009** — Middleware Next.js avec cookie HMAC signé pour le check
  de version CGU obsolète (formalise R4 + R8)
