<!--
SYNC IMPACT REPORT
==================
Version change: 2.0.0 → 2.1.0 (MINEUR)

Justification du bump MINEUR :
  - Plusieurs composants de la *Stack canonique* sont ajoutés ou modifiés :
    Biome remplace ESLint + Prettier ; Turborepo ajouté ;
    Auth.js / Zustand / shadcn/ui / Tailwind v4 / next-intl / Fastify /
    AWS SES / Pino / react-email / Testcontainers / MSW / date-fns /
    lucide-react inscrits formellement.
  - Nouvelle section *Infrastructure et opérations* (AWS ECS Fargate
    ca-central-1, Grafana Cloud Canada, Sentry self-hosted, AWS Secrets
    Manager, AWS CDK, CloudFront).
  - Cinq ADRs créés en lot (ADR-0003 à ADR-0007) pour formaliser les
    choix de fournisseurs.

Principes : inchangés.

Templates et fichiers dépendants — état :
  ✅ docs/adr/0003-observabilite-grafana-cloud-ca.md      — créé
  ✅ docs/adr/0004-auth-session-db-partagee.md            — créé
  ✅ docs/adr/0005-deploiement-aws-ecs-fargate.md         — créé
  ✅ docs/adr/0006-pivot-resend-vers-aws-ses.md           — créé
  ✅ docs/adr/0007-sentry-self-hosted.md                  — créé
  ✅ CLAUDE.md — mis à jour avec la stack étendue
  ⏳ specs/001-conformite-module/plan.md — phase B (refonte avec
     résolution des blockers B1-B6 + intégration stack confirmée)

==================
HISTORIQUE
==================
Version change: 1.0.0 → 2.0.0 (MAJEUR)

Justification du bump MAJEUR :
  - Ajout de trois nouveaux principes dont un NON-NÉGOCIABLE
    (IX. Sécurité applicative), qui modifie matériellement les portes
    de revue obligatoires.
  - Fixation d'une stack canonique : tout futur plan d'implémentation
    qui s'écarterait de TypeScript/Next.js/NestJS/Prisma/PostgreSQL
    doit désormais passer par un amendement.
  - Introduction d'une Definition of Done explicite et bloquante :
    un PR qui ne coche pas toutes les cases est rejeté de plein droit.

Principes — état :
  I.    Conformité réglementaire par conception (NON-NÉGOCIABLE)      inchangé
  II.   Vie privée et Loi 25 (NON-NÉGOCIABLE)                          inchangé + table de rétention ajoutée
  III.  Qualité de lead avant volume                                   inchangé
  IV.   Français d'abord                                               inchangé (accessibilité traitée ailleurs)
  V.    Architecture : monolithe modulaire                             inchangé + plafond coût LLM (sous-section)
  VI.   Logique métier déterministe et testée (NON-NÉGOCIABLE)         inchangé
  VII.  Observabilité de la boucle économique                          renforcé (seuils d'alerte explicites)
  VIII. Clean Architecture et SOLID                                    NOUVEAU
  IX.   Sécurité applicative (NON-NÉGOCIABLE)                          NOUVEAU
  X.    Fiabilité et résilience                                        NOUVEAU

Sections ajoutées :
  - Stack canonique
  - Patrons d'exécution et de scalabilité (async, cache, perf, WCAG, LLM)
  - Décisions architecturales et chaîne d'approvisionnement (ADR, API
    versioning, supply chain, licences)

Sections modifiées :
  - Contraintes de conformité et frontière transactionnelle : ajout
    table de rétention des données.
  - Flux de développement et portes qualité : ajout sous-sections
    Qualité de code, Migrations DB, Definition of Done.

Templates et fichiers dépendants — état de synchronisation :
  ✅ .specify/templates/plan-template.md   — section Constitution Check
       restructurée : un sous-titre par principe pour rendre la porte
       concrète et auditable.
  ✅ .specify/templates/spec-template.md   — pas de modification requise
       (le spec décrit le QUOI, la constitution cadre le COMMENT).
  ✅ .specify/templates/tasks-template.md  — pas de modification du
       template ; la DoD ajoute des tâches transversales (ADR, métriques,
       a11y) qui seront générées par `/speckit-tasks` au cas par cas.
  ✅ .specify/templates/checklist-template.md — gabarit générique
       inchangé.
  ✅ CLAUDE.md (racine) — enrichi avec la stack figée, l'architecture
       en couches, les portes non-négociables, et le rappel "pas de
       code sans spec".

TODOs reportés : aucun. Tous les choix sont concrets.
-->

# Conseiller Voyage — Constitution

## Principes fondamentaux

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE)

La plateforme **NE TOUCHE JAMAIS** la transaction de voyage. Aucune
fonctionnalité n'a le droit, directement ou indirectement, de :

- effectuer ou confirmer une réservation auprès d'un fournisseur (transporteur,
  hôtelier, voyagiste, croisiériste, etc.) ;
- encaisser des fonds en provenance d'un client final ;
- verser des fonds à un fournisseur de voyage ;
- détenir, séquestrer ou transmettre un acompte au nom d'un client.

L'objet du produit est exclusivement la **mise en relation qualifiée** entre un
voyageur et un conseiller en voyage déjà inscrit auprès d'une agence titulaire
d'un permis. Cette frontière maintient la plateforme **hors du périmètre** de
la *Loi sur les agents de voyages* (Office de la protection du consommateur,
Québec) et du *Travel Industry Act, 2002* (TICO, Ontario). Tout PR qui propose
une fonctionnalité franchissant cette frontière **DOIT** être rejeté à la
revue, peu importe la pression commerciale.

Tout conseiller **DOIT** avoir un statut de conformité explicitement marqué
« vérifié » dans la base — c'est-à-dire (a) certificat CCV (Québec) ou
enregistrement TICO (Ontario) déposé et contrôlé, et (b) affiliation active à
une agence titulaire de permis — **AVANT** d'être rendu visible dans toute
interface publique ou d'être éligible à un matching. Toute requête de matching
ou d'affichage **DOIT** filtrer sur ce statut au niveau de la couche de
données, pas seulement de l'UI.

**Raison** : un seul incident où la plateforme aurait encaissé un dépôt ou
diffusé un conseiller non vérifié suffit à requalifier l'entreprise en agent
de voyages — ce qui implique cautionnement, fonds d'indemnisation et licence
— et à détruire le modèle économique. Cette frontière est le produit.

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE)

Les données personnelles des voyageurs et des conseillers **DOIVENT** être
hébergées et traitées en **région canadienne**. Tout sous-traitant (hébergeur,
fournisseur LLM, outil d'analyse, service de courriel transactionnel)
**DOIT** offrir une résidence canadienne contractuelle ; à défaut, il **NE
PEUT PAS** recevoir de données personnelles identifiables.

Le consentement à la collecte **DOIT** être recueilli explicitement au moment
de l'intake, avec une finalité énoncée (« mise en relation avec un conseiller
vérifié ») — pas de case précochée, pas de bundling avec d'autres
consentements.

La collecte **DOIT** respecter la minimisation : ne sont stockés que les
champs qui servent directement au matching ou à la traçabilité du lead. Tout
nouveau champ ajouté à l'intake **DOIT** être justifié dans la spec par son
usage de matching, sinon il est refusé.

Le droit à l'effacement **DOIT** être implémenté de bout en bout, accessible
par une route authentifiée pour le titulaire des données, et propager la
suppression (ou l'anonymisation irréversible) aux backups, journaux de leads,
caches Redis et dérivés analytiques.

La rétention par classe de donnée est définie dans la section *Contraintes de
conformité et frontière transactionnelle*.

### III. Qualité de lead avant volume

La valeur produit est le **dossier préqualifié**, pas la visibilité passive.
Les décisions de design et d'algorithme **DOIVENT** maximiser le taux
d'acceptation par les conseillers, pas le volume brut de leads envoyés.

Le système **DOIT** plafonner à **3 conseillers maximum** notifiés par demande
de voyageur. Tout dépassement, y compris en mode dégradé, est interdit.

Chaque lead **DOIT** être traçable jusqu'à son état final via une machine à
états explicite :
`envoyé → vu → accepté → refusé → devis_envoyé → réservation_confirmée → perdu`.
Les transitions **DOIVENT** être horodatées et persistées de façon immuable
(append-only) pour permettre le calcul de la conversion lead → devis →
réservation. Toute fonctionnalité qui crée un lead **DOIT** instrumenter cette
traçabilité dès la première version.

### IV. Français d'abord

L'expérience par défaut **DOIT** être en français (variante FR-CA) sur tous
les parcours : intake, communications transactionnelles, espace conseiller,
pages publiques, courriels système, messages d'erreur. L'anglais (et toute
autre langue) **DOIT** être ajouté via une couche d'internationalisation
propre (clé/valeur, catalogues séparés), jamais par fork de gabarits.

Le SEO **DOIT** cibler en priorité les requêtes francophones ; les meta,
schémas structurés, sitemaps et URL canoniques en français **DOIVENT** être
les référentiels de vérité, les versions traduites étant des
`alternate hreflang`.

Tout nouveau contenu utilisateur (copie, libellé, message) **DOIT** être livré
en FR-CA en premier ; livrer une version EN-seulement est un défaut de spec.

Formats régionaux par défaut : locale `fr-CA`, dates `dd MMMM yyyy`, heure
24h, monnaie CAD au format `1 234,56 $`, adresses postales canadiennes
(province sur deux lettres, code postal `A1A 1A1`).

### V. Architecture : monolithe modulaire

L'application **DOIT** être un monolithe modulaire à frontières claires. Les
modules de premier niveau sont : **conformité**, **préqualification (intake)**,
**matching**, **SEO**, **facturation**, **identité**. Chaque module expose une
interface publique étroite ; les imports cross-module **DOIVENT** passer par
cette interface, pas par les internes.

Les microservices sont **interdits par défaut**. Un module n'est extrait en
service séparé que sur **preuve mesurée** d'un goulot (latence, scaling,
isolation de blast radius) — la preuve doit figurer dans le plan
d'implémentation avant l'extraction.

Le fournisseur de LLM **DOIT** être placé derrière une interface de domaine
(`LlmProvider`) qui n'expose que les opérations métier dont la plateforme a
besoin (résumer un brief, scorer une affinité, etc.). Aucun appel direct à un
SDK propriétaire de LLM en dehors de l'implémentation de cette interface.

Coût LLM : plafond par requête de **0,05 USD** (paramétrable par
environnement) ; au-delà, dégradation contrôlée vers la stratégie
déterministe. Les réponses LLM **DOIVENT** être cachées par hash SHA-256 de
l'entrée normalisée (TTL 7 jours par défaut) — détail dans *Patrons
d'exécution et de scalabilité*.

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE)

Le **scoring de matching** et la **validation des briefs** d'intake
**DOIVENT** être implémentés comme des **fonctions pures**, déterministes pour
des entrées données, sans appel I/O caché (pas de DB, pas de réseau, pas
d'horloge, pas d'aléa non injecté).

Les tests unitaires couvrant ces fonctions **DOIVENT** être écrits **avant**
l'implémentation (TDD, cycle Red-Green-Refactor) et **DOIVENT** échouer une
fois, puis passer. Un PR qui introduit ou modifie ces composants sans test
rouge → vert visible dans l'historique git est rejeté.

Toute branche de logique métier sensible (acceptation/refus de lead, calcul
de plafond conseiller, règles de conformité) **DOIT** avoir une couverture
par cas nominal **et** par cas d'erreur. Aucun seuil de couverture en
pourcentage n'est imposé ; l'absence de test pour un chemin métier identifié
dans la spec est un défaut bloquant.

### VII. Observabilité de la boucle économique

Les quatre métriques de premier ordre **DOIVENT** être instrumentées dès la
première mise en production de chaque module concerné :

1. **Taux de complétion de l'intake** (visiteur entré → brief soumis) ;
2. **Pourcentage de leads acceptés** (lead envoyé → accepté par au moins un
   conseiller) ;
3. **Conversion lead → devis → réservation confirmée** (par cohorte
   mensuelle) ;
4. **Churn conseiller** (taux de désactivation mensuelle, distingué entre
   départ volontaire et désactivation pour non-conformité).

Seuils d'alerte par défaut (ajustables par PATCH de la constitution) :

| Métrique | Seuil | Sévérité |
|---|---|---|
| Taux de complétion intake | < 30 % sur 7 j glissants | WARN |
| % leads acceptés | < 40 % sur 7 j glissants | WARN |
| Conversion devis → réservation | < 5 % sur 30 j | INFO (signal commercial) |
| Churn conseiller | > 10 % mensuel | WARN |

Les alertes **DOIVENT** être routées vers un canal de garde
(Slack/Discord/courriel) selon sévérité. Chaque feature qui touche l'un de
ces parcours **DOIT** documenter dans son plan comment elle alimente les
compteurs, et le tableau de bord correspondant **DOIT** être créé et lié dans
le README du module **avant** déploiement.

### VIII. Clean Architecture et SOLID

L'application **DOIT** suivre une architecture en quatre couches, avec règle
de dépendance stricte :

```
interface  →  application  →  domaine  ←  infrastructure
(HTTP,         (cas d'usage)    (entités,     (Prisma, Redis,
 RSC, CLI)                       VO, services  LLM, SMTP)
                                 de domaine)
```

- **domaine** : entités, value objects, événements de domaine, services de
  domaine purs. **NE DOIT PAS** importer NestJS, Next.js, Prisma, ni aucune
  dépendance d'infrastructure ou de framework HTTP.
- **application** : un cas d'usage = une classe avec une méthode `execute`
  (ex. `CreateLeadUseCase`, `MatchAdvisorsUseCase`). Orchestre le domaine et
  les ports. Dépend uniquement du domaine et des interfaces de ports.
- **infrastructure** : adaptateurs concrets implémentant les ports
  (`PrismaLeadRepository`, `RedisCache`, `BedrockLlmProvider`,
  `ResendMailer`). Importe librement les SDK externes.
- **interface** : contrôleurs NestJS, Server Actions Next.js, commandes CLI.
  Mince — ne contient pas de logique métier, délègue à un cas d'usage.

**SOLID** **DOIT** être appliqué concrètement :

- **S — Single Responsibility** : un cas d'usage = une action métier. Pas de
  classe « Service » fourre-tout. Si une classe a deux raisons de changer, on
  la scinde.
- **O — Open/Closed** : étendre par composition (nouveau cas d'usage,
  nouvelle stratégie) plutôt que par modification d'une classe existante
  chargée de branches `if`.
- **L — Liskov Substitution** : toute implémentation d'un port (ex. un
  `InMemoryLeadRepository` pour les tests) **DOIT** respecter le contrat
  publié — pas de comportement surprenant en remplacement.
- **I — Interface Segregation** : ports granulaires. Si un cas d'usage n'a
  besoin que de lire, le port qu'il dépend ne **DOIT PAS** exposer aussi
  l'écriture. Scinder `LeadRepository` en `LeadReader` / `LeadWriter` si
  utile.
- **D — Dependency Inversion** : l'application dépend d'**abstractions**
  (ports), jamais d'implémentations concrètes. L'injection se fait via le
  conteneur DI de NestJS côté backend, par paramètres explicites ou React
  Context côté Next.js.

Toute violation (ex. import direct de Prisma dans un cas d'usage pour
optimisation perf) **DOIT** être documentée dans le plan d'implémentation
sous *Complexity Tracking* avec la raison et la dette acceptée.

### IX. Sécurité applicative (NON-NÉGOCIABLE)

Distinct de la vie privée (Principe II) : couvre la surface d'attaque
applicative.

- **Autorisation (RBAC)** : trois rôles minimum — `voyageur` (souvent anonyme
  par session), `conseiller`, `admin`. La vérification du rôle **DOIT** se
  faire au niveau du cas d'usage (couche application), pas seulement du
  contrôleur. Aucun accès direct à une ressource d'un autre utilisateur sans
  passer par un cas d'usage qui valide la propriété.

- **Authentification** : conseiller **DOIT** activer une seconde
  authentification (TOTP via passkey ou app authenticator) avant d'accéder à
  un lead. Voyageur peut rester en session anonyme pendant l'intake mais
  reçoit un magic-link pour suivre son dossier.

- **Secrets** : aucun secret en clair dans le repo (scan pré-commit
  obligatoire). Gestion via Doppler, AWS Secrets Manager, ou équivalent en
  région canadienne. Rotation annuelle minimum, mensuelle pour clés LLM.

- **En-têtes HTTP** par défaut sur toutes les réponses :
  - `Content-Security-Policy` strict (no inline script sans nonce)
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

- **Protections** : CSRF sur toute mutation (token + vérification d'origine ;
  Server Actions Next.js le font d'office). XSS bloqué par défaut React,
  jamais `dangerouslySetInnerHTML` sur contenu utilisateur. Injection SQL
  rendue impossible par usage exclusif de Prisma (pas de SQL brut sauf ADR
  justifié). Validation d'entrée systématique côté serveur via Zod (pas
  uniquement côté client).

- **OWASP Top 10** (édition 2021 ou ultérieure) : revue obligatoire pour
  toute feature touchant un endpoint HTTP authentifié. La checklist OWASP
  **DOIT** apparaître dans la section *Constitution Check* du plan.

- **Patch CVE** : critique (CVSS ≥ 9,0) sous **7 jours**, haute (CVSS
  7,0–8,9) sous **30 jours**. Suivi par Renovate + scan SCA (`npm audit` /
  Snyk) en CI.

- **Pen test** : audit annuel par tiers ; obligatoire avant lancement public
  et après tout changement majeur d'authentification ou de modèle de
  données.

### X. Fiabilité et résilience

Cibles de service (SLO) — minimums non-négociables :

- **Disponibilité** : 99,5 % mensuel sur les endpoints publics (≤ 3 h 39 min
  de downtime par mois).
- **Latence p95** : < 800 ms sur tout endpoint HTTP synchrone hors LLM. Les
  appels LLM **DOIVENT** être asynchronisés (cf. *Patrons d'exécution*) ou
  cadrés par un timeout dur de 3 s avec fallback déterministe.
- **RPO** : 24 h (perte de données maximale acceptable en cas de désastre).
- **RTO** : 4 h (temps de remise en service maximal).
- **Test de restauration de backup** : trimestriel, scripté, journalisé.

**Modes dégradés** documentés et implémentés pour chaque dépendance externe :

- **LLM HS** → matching règles déterministes seules ; bandeau UI explicite ;
  pas de blocage de l'intake.
- **Courriel HS** → file BullMQ avec backoff exponentiel ; dead-letter après
  5 échecs ; alerte opérationnelle.
- **DB primaire HS** → bascule lecture seule depuis réplique avec UI en mode
  consultation ; mutations bloquées avec message clair.

**Idempotence** obligatoire pour toute écriture publique :

- Création de lead (intake)
- Notification conseiller
- Paiement de l'abonnement conseiller
- Demande d'effacement Loi 25

Le client **DOIT** envoyer un header `Idempotency-Key` (UUID v4) ; le serveur
**DOIT** retourner le même résultat pour la même clé pendant 7 jours.

**Circuit breakers** sur tout appel à un service externe : ouverture après 5
échecs en 60 s, demi-ouverture après 30 s, fermeture après 1 succès.

**Health checks** : tout service expose `/healthz` (liveness, dépendances
minimales) et `/readyz` (readiness, dépendances complètes y compris DB).

---

## Stack canonique

La stack est figée par cette constitution. Tout changement de composant nommé
ici constitue un amendement **MINEUR** au minimum et **DOIT** être motivé par
un ADR.

### Fondations

| Domaine | Choix | Contraintes / Note |
|---|---|---|
| Langage | **TypeScript ≥ 5** | `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitAny: true` |
| Package manager | **pnpm** | workspaces : `apps/web`, `apps/api`, `packages/shared` minimum |
| Orchestration monorepo | **Turborepo** | cache local + distant, pipelines parallèles |
| Lint + format | **Biome** | erreur bloquante en CI |
| Git hooks | **Husky** + **lint-staged** | enforce lint/format/typecheck pré-commit |
| Convention commits | **Conventional Commits** + **commitlint** | `type(scope): description` |
| Validation runtime | **Zod** | schémas partagés via `packages/shared` |
| CI | **GitHub Actions** | pipelines obligatoires (cf. *Flux de développement*) |
| Documentation interne | **Markdown dans `docs/`** | versionné avec le code |

### Frontend

| Domaine | Choix | Contraintes / Note |
|---|---|---|
| Framework | **Next.js (App Router)** | RSC par défaut ; client components seulement quand nécessaire |
| State serveur | **Hybride RSC + TanStack Query** | RSC par défaut, TanStack pour client-heavy (file admin, dashboards live) |
| State client | **Zustand** | hooks-based, sans provider |
| Forms | **react-hook-form** + **@hookform/resolvers/zod** | adapté à l'intake multi-step |
| UI components | **shadcn/ui** | Radix UI sous le capot, accessible WCAG par construction |
| CSS | **Tailwind CSS v4** | imposé par shadcn/ui |
| Icons | **lucide-react** | cohérent avec shadcn/ui |
| Dates | **date-fns** | locale `fr-CA` (Principe IV) |
| i18n | **next-intl** | App Router natif, ICU MessageFormat |
| Auth web | **Auth.js v5 (NextAuth)** | sessions DB Postgres, passkeys + TOTP (cf. ADR-0004) |

### Backend

| Domaine | Choix | Contraintes / Note |
|---|---|---|
| Framework | **NestJS** | conteneur DI pour appliquer Principe VIII |
| HTTP adapter | **Fastify** via `@nestjs/platform-fastify` | 2-3× plus rapide qu'Express |
| ORM | **Prisma** | jamais de SQL brut sans ADR |
| Logging | **Pino** | JSON structuré, intégration OTel native |
| API documentation | **@nestjs/swagger** | OpenAPI 3.x auto-généré depuis décorateurs |
| Templates email | **react-email** | HTML statique + plain-text auto-généré |
| Auth API | session DB Auth.js lue via Prisma | révocation instantanée (cf. ADR-0004) |
| MFA conseiller | TOTP via passkey ou app authenticator | Principe IX, obligatoire avant accès aux leads |

### Données et services externes

| Domaine | Choix | Contraintes / Note |
|---|---|---|
| DB primaire | **PostgreSQL ≥ 16** | région canadienne (Principe II) |
| Cache + file d'attente | **Redis ≥ 7** + **BullMQ** | région canadienne |
| Stockage objet | **AWS S3 `ca-central-1`** | SSE-KMS, URLs signées (cf. ADR-0001) |
| Email transactionnel | **AWS SES `ca-central-1`** | DKIM/SPF/DMARC (cf. ADR-0006) |
| LLM | derrière interface `LlmProvider` (Principe V) | fournisseur précisé par ADR séparé, résidence canadienne |

### Tests

| Domaine | Choix | Contraintes / Note |
|---|---|---|
| Unit + intégration | **Vitest** | TDD obligatoire sur logique métier (Principe VI) |
| E2E | **Playwright** | parcours utilisateurs critiques |
| Test DB | **Testcontainers** | Postgres + Redis isolés par suite |
| Mock HTTP | **MSW** (Mock Service Worker) | intercepte au niveau réseau, mêmes handlers dev/test |
| A11y | **axe-core** | bloquant en CI sur pages publiques (WCAG 2.1 AA) |

Toute dépendance ajoutée au `package.json` **DOIT** être justifiée dans le
plan d'implémentation et conforme à la politique de licence (cf. *Chaîne
d'approvisionnement*).

---

## Infrastructure et opérations

Cette section fixe les choix d'infrastructure et d'opérationnel. Comme la
*Stack canonique*, tout changement de composant nommé ici constitue un
amendement MINEUR de la constitution et **DOIT** être motivé par un ADR.

Tous les services hébergeant ou traitant du PII **DOIVENT** être en région
canadienne (Principe II, NON-NÉGOCIABLE).

### Déploiement et infrastructure

| Domaine | Choix | Contraintes / Note |
|---|---|---|
| Plateforme de déploiement | **AWS ECS Fargate** dans `ca-central-1` | Next.js + NestJS + workers BullMQ (cf. ADR-0005) |
| Infrastructure as Code | **AWS CDK** en TypeScript | même langage que la stack applicative |
| CDN | **AWS CloudFront** | edge YYZ + YUL, signed URLs pour S3 privé |
| Conteneurs | **Docker** (images distroless Node 22 LTS) | build multi-stage avec pnpm |
| Dev local | **Docker Compose** + **LocalStack** | Postgres + Redis + S3/SES/KMS émulés |
| Auto-scaling | sur CPU 70 % + p95 latency (CloudWatch) | autoscale 2-N par service |
| Migrations DB | **Prisma Migrate** | forward-only, expand/contract (cf. *Migrations DB*) |

### Observabilité et qualité de service

| Domaine | Choix | Contraintes / Note |
|---|---|---|
| Tracing + métriques + logs | **OpenTelemetry SDK** → **Grafana Cloud (région Canada)** | DPA Loi 25 signé (cf. ADR-0003) |
| Error tracking | **Sentry self-hosted** sur AWS `ca-central-1` | scrubbing PII via `beforeSend` (cf. ADR-0007) |
| Tableaux de bord | Grafana, versionnés en JSON dans `docs/dashboards/` | un par module au minimum |
| Alerting | Grafana Alertmanager | routes Slack/Discord/courriel selon sévérité |
| Health checks | `/healthz` (liveness) et `/readyz` (readiness) | par service (Principe X) |

### Secrets et sécurité opérationnelle

| Domaine | Choix | Contraintes / Note |
|---|---|---|
| Secrets prod | **AWS Secrets Manager `ca-central-1`** | rotation auto, IAM granulaire |
| Secrets dev | **1Password CLI** (`op run -- ...`) | jamais de `.env` en clair sur disque |
| Secrets CI | GitHub Actions OIDC → IAM role | lit Secrets Manager au runtime |
| Rotation | annuelle minimum, mensuelle pour clés LLM | (cf. Principe IX) |

Toute introduction d'un nouveau service tiers (SaaS, fournisseur géré)
**DOIT** vérifier la résidence canadienne **avant** sélection (cf.
ADR-0006 pour la leçon retenue).

---

## Contraintes de conformité et frontière transactionnelle

Ces contraintes opérationnalisent les Principes I et II et s'appliquent à
toute spec, plan et tâche.

- **Frontière de paiement** : aucun code de paiement (Stripe Checkout,
  terminal marchand, agrégateur, virement) **NE PEUT** transiter par les
  modules de matching ou de mise en relation. Le seul paiement autorisé sur
  la plateforme est l'**abonnement du conseiller** au service (B2B, modèle
  SaaS), géré par le module `facturation` et isolé.
- **Vérification conseiller** : le statut de conformité d'un conseiller est
  source de vérité dans le module `conformité`. Tout accès à ce statut par
  un autre module **DOIT** passer par l'interface publique du module, jamais
  par un JOIN direct sur la table.
- **Résidence des données** : les choix d'hébergement, de stockage objet et
  de fournisseur LLM **DOIVENT** être documentés dans un ADR avec la région
  retenue. Toute région non canadienne est un défaut bloquant.
- **Journal d'audit** : toute opération qui change le statut de conformité
  d'un conseiller, qui crée/transitionne un lead, ou qui supprime des
  données personnelles **DOIT** produire une entrée d'audit horodatée,
  immuable et retrouvable par identifiant de sujet.
- **Mentions légales et CGU** : toute interface publique **DOIT** rappeler
  que la plateforme n'est pas un agent de voyages, ne perçoit aucun fonds
  client et agit uniquement comme service de mise en relation.

### Cycle de vie et rétention des données

| Classe de donnée | Durée de rétention | Action post-rétention |
|---|---|---|
| Brief soumis avec contact (identifiable client) | 24 mois après dernier événement | Anonymisation (suppression PII, conservation événements agrégés) |
| Brouillon de brief non soumis | 30 jours | Suppression complète |
| Profil conseiller actif | Tant qu'actif | — |
| Profil conseiller désactivé | 6 mois | Pseudonymisation |
| Lead (état + transitions) | 24 mois après état final | Anonymisation |
| Journal d'audit (conformité, accès données personnelles) | 7 ans | Archivage chiffré, retrait des index actifs |
| Logs applicatifs | 90 jours | Suppression |
| Logs d'accès (sécurité) | 1 an | Suppression |

Toute opération de suppression / anonymisation **DOIT** propager aux backups,
caches Redis, et dérivés analytiques. Un job planifié `data-retention-sweep`
**DOIT** s'exécuter quotidiennement et son exécution **DOIT** être tracée
dans le journal d'audit.

---

## Patrons d'exécution et de scalabilité

### Asynchrone et files d'attente

Toute opération > 200 ms ou avec effet de bord externe (envoi courriel,
appel LLM, notification conseiller) **DOIT** être exécutée en arrière-plan
via BullMQ. Chaque job **DOIT** être :

- idempotent (relance sans effet secondaire)
- retriable (backoff exponentiel, max 5 tentatives)
- mis en dead-letter avec alerte après épuisement
- observable (latence, échecs, profondeur de file dans le tableau de bord)

Notification multi-conseillers : **un job par destinataire**, jamais un job
unique pour les 3. Isole les échecs.

### Politique de cache

- **CDN** : assets statiques et pages publiques rendues côté serveur.
- **Redis** : sessions, résultats LLM identiques (clé = SHA-256 de l'entrée
  normalisée), agrégats lourds (annuaire conseillers vérifiés).
- **Application** (RSC cache, React `cache()`) : memoization par requête.

**Invalidation explicite** par tag/clé pour donnée critique (statut de
conformité d'un conseiller, état d'un lead). TTL seul **INTERDIT** pour ces
classes. TTL acceptable pour donnée publique non sensible.

### Performance utilisateur

Cibles sur pages publiques (P75 mesuré via CrUX) :

- **LCP** (Largest Contentful Paint) < 2,5 s
- **INP** (Interaction to Next Paint) < 200 ms
- **CLS** (Cumulative Layout Shift) < 0,1
- Budget JS initial : < 200 kB compressé (gzip)

Lighthouse CI en pipeline GitHub Actions ; dégradation > 10 % sur une de ces
métriques **DOIT** bloquer le merge.

### Accessibilité

Toute interface publique **DOIT** être conforme **WCAG 2.1 niveau AA**. Test
automatique via `axe-core` en CI (bloquant sur les erreurs critiques). Audit
manuel par release majeure avec test au lecteur d'écran (NVDA ou VoiceOver).
L'audit a11y fait partie de la Definition of Done pour toute modification UI.

### Coût et cache LLM

- Plafond par requête LLM : **0,05 USD** (paramétrable par environnement) ;
  au-delà → erreur contrôlée et fallback déterministe.
- Cache des réponses LLM par hash SHA-256 de l'entrée normalisée, TTL **7
  jours** par défaut.
- Monitoring du coût total par jour, par feature, dans le tableau de bord
  d'observabilité ; seuil d'alerte WARN à 80 % du budget mensuel défini.

---

## Flux de développement et portes qualité

### Portes de revue

- **Porte 1 — Plan** : chaque fonctionnalité passe par `/speckit.specify`
  puis `/speckit.plan`. Le plan **DOIT** inclure une section *Constitution
  Check* qui adresse, principe par principe, comment la feature s'y conforme
  (ou justifie une dérogation, qui ne peut être que mineure et jamais pour
  les principes I, II, VI, IX).
- **Porte 2 — Tests d'abord pour la logique métier** : pour tout changement
  touchant scoring, matching ou validation de brief, les tests unitaires
  **DOIVENT** être commités avant l'implémentation, dans des commits séparés
  et ordonnés.
- **Porte 3 — Revue de code** : un PR **DOIT** être revu par au moins une
  autre personne (ou par une revue IA documentée si l'équipe est
  mono-développeur en phase d'amorçage). La revue **DOIT** explicitement
  vérifier les Principes I, II, VI, IX.
- **Porte 4 — Observabilité avant mise en production** : aucun module qui
  alimente une métrique de Principe VII ne **PEUT** être déployé sans que
  les compteurs correspondants soient instrumentés et visibles.
- **Porte 5 — Documentation** : un changement de comportement utilisateur
  **DOIT** mettre à jour la copie FR-CA et, si une couche EN existe déjà,
  la version EN dans le même PR.

### Qualité de code

- **Typage strict** TypeScript : zéro `any` non justifié, options strictes
  activées (voir *Stack canonique*).
- **ESLint + Prettier** : exécution en CI, zéro erreur, warnings ignorés
  seulement avec `// eslint-disable-next-line` + raison commentée.
- **Complexité cyclomatique** max **10** par fonction (ESLint rule
  `complexity`).
- **Code mort** : détection en CI (ts-prune ou knip) ; suppression
  obligatoire ou justification dans le PR.
- **Couverture de tests** : pas de seuil rigide en pourcentage (Principe VI
  est plus fort — chaque cas métier explicite). Ce qui est mesuré : nombre
  de cas métier couverts vs. nombre identifié dans la spec.

### Migrations de base de données

- **Forward-only** : aucune méthode `down` dans les migrations Prisma.
- **Idempotentes** : une migration relancée n'a aucun effet supplémentaire.
- **Expand/contract** : pour tout changement breaking de schéma, déployer
  d'abord la migration *expand* (ajout compatible) avant le code qui en
  dépend, puis *contract* (retrait de l'ancien) après vérification.
- **Pas de migration destructive** sans backup vérifié dans les 60 minutes
  précédentes.
- **Rollback applicatif** (revert du code) **DOIT** rester possible pendant
  au moins 1 h après déploiement.

### Definition of Done

Une fonctionnalité n'est livrable que si **toutes** les cases sont cochées :

- [ ] `specs/<###-feature>/spec.md` mergée
- [ ] `specs/<###-feature>/plan.md` mergé avec section *Constitution Check*
      explicite (un paragraphe par principe pertinent)
- [ ] `specs/<###-feature>/tasks.md` généré et toutes les tâches cochées
- [ ] Tests unitaires : passent + couvrent les cas métier nominal et erreur
      (Principe VI)
- [ ] Tests d'intégration : couvrent les flux principaux du cas d'usage
- [ ] Tests e2e Playwright : couvrent le user journey si modification UI
- [ ] `axe-core` (a11y) passe sans erreur critique
- [ ] Lighthouse CI : pas de régression > 10 % sur LCP/INP/CLS
- [ ] ESLint + `tsc --noEmit` : zéro erreur
- [ ] Métriques Principe VII : instrumentées si la feature touche un parcours
      de la boucle économique ; tableau de bord lié dans README du module
- [ ] SLO Principe X : endpoints synchrones < 800 ms p95 mesurés en charge
      nominale
- [ ] Sécurité Principe IX : checklist OWASP revue, secrets propres,
      en-têtes HTTP en place, validation Zod côté serveur
- [ ] Documentation FR-CA mise à jour (copie utilisateur, README de module)
- [ ] ADR créé si décision architecturale (cf. *Décisions architecturales*)
- [ ] Migrations Prisma testées en staging avec rollback applicatif vérifié
- [ ] Revue de code approuvée par au moins une autre personne (ou revue IA
      documentée si mono-développeur en amorçage)

**Pas de code sans spec.** Ouvrir un PR de code sans `spec.md` et `plan.md`
mergés au préalable **DOIT** entraîner un rejet automatique à la revue,
quelle que soit la pression commerciale.

---

## Décisions architecturales et chaîne d'approvisionnement

### ADR (Architecture Decision Records)

Toute décision avec impact sur plus d'un module, ou irréversible à court
terme (choix de framework, de fournisseur LLM, de schéma DB structurant,
politique de cache), **DOIT** faire l'objet d'un ADR au format MADR :

- Fichier : `docs/adr/NNNN-titre-kebab.md` (numérotation séquentielle).
- Sections : *Contexte*, *Décision*, *Statut* (proposé / accepté /
  déprécié / remplacé par), *Conséquences*, *Alternatives considérées*.
- Lié depuis le `plan.md` de la feature qui motive la décision.
- Un ADR n'est **jamais** modifié rétroactivement : pour le changer, créer
  un nouvel ADR qui le remplace, et marquer l'ancien `remplacé par #NNNN`.

### API versioning

Toute API publique (consommée par un tiers ou exposée comme contrat externe)
**DOIT** être versionnée par URI : `/api/v1/...`. Un changement breaking
impose `v2`. Politique de dépréciation : annonce 6 mois minimum avant
retrait. Les routes internes (Server Actions Next.js → handlers internes
NestJS, communications via `packages/shared`) sont exemptées tant qu'elles
restent internes.

### Chaîne d'approvisionnement (supply chain)

- **Renovate** configuré ; PR automatique hebdomadaire pour patches et
  minors ; majors traitées manuellement avec test de régression.
- **CVE patching SLA** : critique sous 7 jours, haute sous 30 jours (cf.
  Principe IX).
- **Licences interdites** en production : GPL-2.0, GPL-3.0, AGPL-3.0, SSPL
  (incompatibles avec le modèle SaaS hébergé).
- **Licences autorisées** : MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause,
  ISC, MPL-2.0.
- **Vérification de licences** automatisée en CI (`license-checker` ou
  équivalent) ; merge bloqué en cas de licence non listée.
- **SBOM** (format CycloneDX) généré automatiquement à chaque release et
  archivé.

---

## Governance

Cette constitution **supplante** toute autre pratique informelle ou habitude
d'équipe. En cas de conflit entre cette constitution et un document de plus
bas niveau (README, commentaire, convention orale), la constitution prévaut.

**Procédure d'amendement** :

1. Un amendement est proposé via un PR dédié modifiant
   `.specify/memory/constitution.md`.
2. Le PR **DOIT** inclure un *Sync Impact Report* mis à jour en commentaire
   HTML en tête du fichier (version, principes touchés, templates impactés).
3. Le PR **DOIT** être approuvé explicitement par le porteur produit avant
   merge.
4. Les principes marqués **NON-NÉGOCIABLE** (I, II, VI, IX) **NE PEUVENT**
   être affaiblis que par un amendement MAJEUR documentant la raison
   réglementaire ou stratégique du changement.

**Politique de versionnement** (semver appliqué à la constitution) :

- **MAJEUR** : retrait d'un principe, redéfinition incompatible d'un
  principe existant, ou affaiblissement d'un principe NON-NÉGOCIABLE.
- **MINEUR** : ajout d'un nouveau principe ou d'une nouvelle section,
  élargissement matériel d'une règle existante, changement d'un composant
  de la *Stack canonique*.
- **PATCH** : clarification, reformulation, correction de typo, ajustement
  non sémantique, ajustement de seuil de SLO ou d'alerte.

**Revue de conformité** : à chaque `/speckit.plan` et `/speckit.tasks`, le
contenu de la constitution **DOIT** être relu pour cadrer les portes
qualité du plan ou de la liste de tâches. La présence d'un *Constitution
Check* explicite et complet dans le plan est obligatoire.

**Guidance d'exécution runtime** : pour les détails techniques par feature
(structure exacte de répertoires, commandes, snippets), se référer au plan
courant dans `specs/<feature>/plan.md` et aux ADR dans `docs/adr/`. Le
fichier `CLAUDE.md` à la racine du dépôt résume la stack et les portes
non-négociables pour les agents IA.

**Version**: 2.1.0 | **Ratified**: 2026-05-22 | **Last Amended**: 2026-05-23
