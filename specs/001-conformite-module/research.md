# Recherche — Phase 0 : Module Conformité

**Date** : 2026-05-22

Toutes les inconnues techniques de `plan.md > Technical Context` sont
résolues ici. Chaque décision suit le format Decision / Rationale /
Alternatives.

---

## R1 — Fournisseur de stockage objet en région canadienne

**Décision** : AWS S3 dans la région `ca-central-1` (Montréal), avec
chiffrement SSE-KMS au repos et accès aux documents via URLs signées V4 de
durée 5 minutes.

**Rationale** :
- Conformité Loi 25 (Principe II) : `ca-central-1` est officiellement une
  région canadienne d'AWS, et AWS publie ses engagements de résidence
  contractuels.
- Maturité du SDK Node (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`)
  avec typings TypeScript de premier ordre.
- Coût négligeable au volume cible année 1 : 5 MB × 5 fichiers × 500 dossiers
  + renouvellements ≈ 25 GB cumulés + ~10 000 PutObject/an = quelques USD/mois.
- Versioning et MFA Delete activables → renforce le respect de l'audit
  append-only au niveau objet.
- Permet de référencer AWS Bedrock `ca-central-1` ultérieurement si le LLM
  Anthropic / Claude est retenu par ADR séparé.

**Alternatives considérées** :

| Option | Avantage | Pourquoi rejetée |
|---|---|---|
| **Cloudflare R2** | API S3-compatible, pas d'egress | R2 ne garantit pas la résidence régionale au niveau objet (réplication globale possible). Non-conforme Principe II sans surcoût d'audit. |
| **Azure Blob Canada Central** | Équivalent fonctionnel d'AWS | Choix valable mais introduit Azure dans une stack majoritairement AWS-compatible. À reconsidérer si l'hébergement principal bascule vers Azure. |
| **OVH Object Storage Beauharnois** | Centre de données au Québec, souveraineté plus forte | Écosystème SDK Node moins mature, intégration BullMQ / monitoring plus laborieuse. À garder en réserve pour une exigence souveraineté renforcée. |
| **Self-hosted MinIO** | Contrôle total | Charge opérationnelle disproportionnée pour un MVP à 500 conseillers. |

**Formalisé dans** : [ADR-0001](../../docs/adr/0001-stockage-objet-canadien.md).

---

## R2 — Pattern d'audit log append-only en PostgreSQL

**Décision** : table dédiée `conformite_audit_entries` avec contrainte
applicative `INSERT-only` enforced par un **trigger PostgreSQL**
(`BEFORE UPDATE OR DELETE` → `RAISE EXCEPTION`). Pas de colonne `updated_at`
sur cette table. Index sur `(conseiller_id, occurred_at DESC)` pour la
consultation par identifiant.

Rôle DB applicatif (`app_conformite`) sans privilège `UPDATE` ni `DELETE`
sur cette table — défense en profondeur même si le trigger est contourné.

**Rationale** :
- Implémentation simple, zéro dépendance externe.
- Le trigger garantit l'immutabilité au niveau DB même si un développeur
  oublie un `where` dans Prisma.
- La rétention 7 ans (constitution + spec FR-012) est gérée par partitioning
  par année (`partition_year_2026`, `partition_year_2027`...) — partitions
  anciennes peuvent être archivées chiffrées (post-export) sans déplacer le
  reste.

**Alternatives considérées** :

| Option | Pourquoi rejetée |
|---|---|
| Table normale sans trigger, simple discipline développeur | Trop fragile pour un audit Principe II ; un seul DELETE accidentel = preuve réglementaire perdue. |
| Solution dédiée (AWS QLDB, Hedera, blockchain) | Sur-ingénierie pour un MVP, complexité opérationnelle, coût, et certains ne sont pas en région canadienne. |
| Append-only via event store style (EventStoreDB) | Stack additionnelle, complexifie le déploiement. |

---

## R3 — Stratégie de cache et propagation pour le statut « vérifié »

**Décision** : cache à deux niveaux derrière l'interface
`ConformiteQueryFacade` :

1. **Cache Redis** par conseiller (clé `conformite:status:{conseillerId}`),
   TTL 60 s.
2. **Invalidation explicite par pub/sub** au moment d'un changement de
   statut : publication sur le canal `conformite.status.changed` ; tous les
   consommateurs invalident leur entrée locale.
3. **Lecture DB directe** (bypass cache) pour les transitions négatives
   (`→ revoked`, `→ suspended`) si le consommateur déclare un besoin
   « strict » (header `X-Strict-Verification: true` sur l'appel interne) —
   garantit < 10 s même en pire cas réseau pub/sub.

**Rationale** :
- TTL 60 s respecte FR-022 général (< 60 s) sans surcharger la DB.
- Pub/sub permet en pratique une propagation < 1 s côté nominal.
- Le mode strict offre la garantie SC-010 (< 10 s sur transitions
  négatives) même si Redis HS — au prix d'une latence supérieure (acceptable
  parce que rare et critique).
- Constitution (*Patrons d'exécution > Politique de cache*) interdit le TTL
  seul sur donnée critique → satisfait par la combinaison pub/sub +
  bypass mode strict.

**Alternatives considérées** :

| Option | Pourquoi rejetée |
|---|---|
| TTL seul (5 s) | Constitution l'interdit pour donnée critique. |
| Webhook par consommateur | Couplage fort cross-module, contraire au Principe V. |
| Lecture DB directe systématique | Surcharge DB inutile pour le chemin nominal (lecture fréquente, écriture rare). |
| Event sourcing complet | Sur-ingénierie. |

---

## R4 — Mécanisme inter-module pour notifier le conseiller

**Décision** : le module conformité **publie des événements de domaine**
(`ConformiteStatusChanged`, `PermitRevoked`) via le port
`ConformiteEventPublisher`. Le module `identité` (ou un futur module
`notifications`) souscrit à ces événements via une infrastructure pub/sub
NestJS in-process (`@nestjs/event-emitter` ou BullMQ event-bus selon
volumétrie).

Le module conformité **ne connaît pas** les détails de l'envoi de courriel
ou de la notification in-app. Il déclare un fait du domaine ; le souscripteur
est libre d'en faire ce qu'il veut.

**Rationale** :
- Respect du Principe V : interfaces publiques étroites, pas de couplage
  direct.
- Permet à l'équipe identité de changer de fournisseur courriel sans toucher
  à conformité.
- Testable en isolation : un fake publisher en mémoire valide que les
  événements attendus sont émis.

**Alternatives considérées** :

| Option | Pourquoi rejetée |
|---|---|
| Appel direct au port `NotificationPort` qui appelle `identité` | Couplage temporel synchrone, retries plus complexes, viole Principe V (le module conformité « sait » qu'identité envoie des courriels). |
| File BullMQ partagée gérée par conformité | Conformité ne devrait pas gérer la logique d'envoi ; reste de la responsabilité d'identité. |

**Note** : la latence de notification (FR-005 : < 5 minutes) est confortable
pour un événement asynchrone. Pas de contrainte de propagation < 60 s ici
(la notification au conseiller n'est pas l'invalidation du statut publié).

---

## R5 — Scan antivirus des documents soumis

**Décision** : **différé à un spec ultérieur**. Pour le MVP, les documents
sont stockés sans scan automatique. L'admin est l'unique consommateur des
documents (visualisation manuelle dans la file de revue) ; l'environnement
de visualisation utilise un sandboxing navigateur (Content-Disposition:
attachment forcé, pas de prévisualisation inline pour les PDF, rendu image
via service de conversion serveur si besoin ultérieur).

**Rationale** :
- Volume MVP (≤ 500 dossiers/an) ne justifie pas l'infrastructure d'un scan
  (ClamAV, AWS GuardDuty Malware Protection à 0,75 USD/Go scanné).
- Surface d'attaque limitée : seul un admin authentifié + MFA visualise les
  documents.
- À la première traction commerciale réelle (> 100 soumissions/mois),
  ouvrir un spec dédié `0XX-malware-scan-documents`.

**Alternatives considérées** :

| Option | Pourquoi rejetée maintenant |
|---|---|
| ClamAV self-hosted | Maintenance, mises à jour de signatures, intégration BullMQ post-upload. Pas justifié au volume. |
| AWS GuardDuty Malware Protection for S3 | Coût Go scanné, pas catastrophique mais inutile pour ce volume. |
| API VirusTotal | Données sortent du Canada → violation Principe II. |

**Mitigation immédiate** : interdire la prévisualisation inline des PDF dans
l'UI admin ; rendre les documents via un endpoint qui force
`Content-Disposition: attachment` (téléchargement explicite, pas
d'exécution).

---

## R6 — Gestion des sessions admin et conseiller

**Décision** : ce module **dépend** du module `identité` pour
l'authentification et la session. Le plan suppose qu'identité expose :

- Un `AuthGuard` NestJS qui valide le token et injecte
  `request.user = { id, role, mfaVerified }`.
- Un cas d'usage `RequireMfaPolicy` qui peut être appliqué par décorateur
  sur les endpoints sensibles (admin et conseiller).

Le module conformité **N'IMPLÉMENTE PAS** l'authentification ou la MFA. Si
le module identité n'est pas encore disponible au moment de démarrer
l'implémentation, ouvrir un spec préalable `000-module-identite`.

**Rationale** : respect du Principe V — séparation des responsabilités. Le
MFA conseiller (exigé par Principe IX) est une décision transversale qui
appartient au module identité, pas à chaque consommateur.

---

## R7 — Pattern Outbox pour la fiabilité des événements de domaine

**Décision** : implémenter un pattern **outbox transactionnel**. La transition
de statut (écriture dans `conformite_conseiller_compliances`, `conformite_certificats`,
etc.) **ET** l'écriture d'un enregistrement dans la table `conformite_outbox`
se font dans **la même transaction Prisma**. Un worker BullMQ
`OutboxPublisherWorker` lit en continu les lignes outbox non-publiées, les
publie via `ConformiteEventPublisher`, et marque la ligne `publishedAt` à
succès. Idempotent — un événement dupliqué côté consommateur est détecté par
son `id`.

**Rationale** : sans outbox, la publication via `@nestjs/event-emitter`
in-process est faite après le commit DB. Si le process crashe entre le
commit et la publication, l'événement est **perdu pour toujours**.
Conséquence directe : un conseiller révoqué reste visible dans le matching.
Inacceptable pour Principe I (NON-NÉGOCIABLE).

L'outbox garantit at-least-once : la table outbox est en DB
transactionnelle ; tant qu'elle existe et n'est pas marquée publiée, le
worker la rejoue. Les consommateurs DOIVENT être idempotents (filtre par
`event.id`).

**Alternatives considérées** :

| Option | Pourquoi rejetée |
|---|---|
| Pub/sub direct sans outbox | Pas de garantie de livraison. Bloqueur B1 du review. |
| Outbox via une queue externe (Kafka) | Sur-ingénierie au volume MVP, complexité ops disproportionnée. |
| Event sourcing complet | Refonte majeure de l'architecture, surdimensionnée pour les besoins. |

**Référence** : [Microservices.io — Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html).

---

## R8 — Upload intent record pour les URLs signées

**Décision** : table `conformite_upload_intents` qui persiste chaque URL
signée PUT émise vers S3, avec : propriétaire (`conseillerId`), MIME attendu,
`contentLength` attendu, `objectKey` final, `expiresAt`, `consumedAt`. La
création d'une soumission valide chaque `uploadId` référencé contre cette
table avant d'accepter (existence, propriétaire correct, non-expiré, non
encore consommé). L'upload réel S3 est vérifié post-upload (HEAD S3 +
comparaison `Content-Type` et `Content-Length`).

**Rationale** : sans ce registre (bloqueur B2 du review), un client malveillant
peut soumettre un `uploadId` forgé ou appartenant à un autre conseiller. La
clé S3 seule n'est pas une preuve d'autorisation.

Lifecycle :
- À l'émission : `INSERT` dans la table, durée de validité 5 min.
- Au POST de submission : vérifier `expiresAt > NOW()` et `consumedAt IS
  NULL`, puis marquer `consumedAt = NOW()`.
- Job de cleanup quotidien : supprime les rows expirées non consommées
  (et l'objet S3 associé via lifecycle policy S3 dédiée).

**Alternatives considérées** :

| Option | Pourquoi rejetée |
|---|---|
| Signed claim JWT dans l'uploadId | Plus complexe à révoquer ; pas de visibilité côté admin sur les uploads en cours. |
| Pas de registre, validation au POST submission seulement | B2 du review reste ouvert : uploadId forgeable. |

---

## R9 — Enforcement de la frontière modulaire (Principe V)

**Décision** : règle **`biome.json`** `"correctness/noPrivateImports"` ou
équivalent configurée pour interdire l'import direct de tables Prisma
appartenant à un module autre que le module appelant. Une convention de
nommage stricte associe préfixe de table et module : `conformite_*` =
module conformité, `intake_*` = intake, `matching_*` = matching, etc.

Détail : les imports cross-module **DOIVENT** passer par les façades
`PublicApi` exposées par chaque module (ex. `ConformiteQueryFacade` pour
le statut vérifié). Un test CI dédié grep le code source et **fait échouer
le build** si un fichier sous `apps/api/src/modules/<X>/` importe
directement un type Prisma préfixé `<autre>_`.

**Rationale** : sans enforcement code (bloqueur B4 du review), la frontière
modulaire reste une convention. À 3 développeurs au MVP, c'est tolérable un
temps ; au-delà, la convention dérive systématiquement. La règle automatisée
est un investissement minimal qui se rentabilise immédiatement.

**Alternatives considérées** :

| Option | Pourquoi rejetée |
|---|---|
| Aucun enforcement (juste convention) | Bloqueur B4 reste ouvert. Drift inévitable. |
| Prisma clients séparés par module (rôles DB distincts) | Plus strict mais surcomplique le déploiement, à reconsidérer si l'équipe dépasse 5 développeurs. |
| eslint-plugin-boundaries | A été notre choix initial mais incompatible avec Biome (notre lint, cf. v2.1.0). Si on revient à ESLint un jour, c'est la solution. |

---

## R10 — Règles de pseudonymisation des payloads d'audit (Principe II)

**Décision** : les payloads JSON de la table `conformite_audit_entries` **NE
PEUVENT JAMAIS** contenir d'identifiant direct (email, téléphone, nom
complet, adresse). Ils contiennent uniquement :

- Des **références par ID** (`conseillerComplianceId`, `submissionId`,
  `affiliationId`, `permitRevocationId`, `documentObjectKey`).
- Des **valeurs structurées non-identifiantes** (statut avant / après,
  province, type d'événement, etc.).
- Des **valeurs typées** (dates, montants, durées) sans champ libre
  utilisateur.

Si un événement a besoin d'un contexte humain-lisible (ex. nom de l'agence
qui perd son permis), il **DOIT** être résolu au moment de la consultation
via une jointure — et la jointure peut retourner `<anonymisé>` si le sujet
référencé a été anonymisé entre-temps.

**Schémas Zod par `eventType`** définis dans
`apps/api/src/modules/conformite/application/audit/payload-schemas.ts`. Un
test CI vérifie qu'aucun payload écrit ne contient `email`, `phone`,
`firstName`, `lastName`, `address` comme clé directe.

**Rationale** : bloqueur B5 du review. La rétention 7 ans du journal
d'audit (FR-012) n'a de sens Loi 25 que si les données qu'il contient sont
non-réidentifiantes en soi. Sinon, on stocke du PII 7 ans en violation de
la minimisation.

**Alternatives considérées** :

| Option | Pourquoi rejetée |
|---|---|
| Stocker tout en clair | Violation Principe II. Inacceptable. |
| Chiffrer les payloads avec une clé rotable | Complexifie la consultation et la recherche dans le journal ; risque de perte de clé. À ré-envisager si on doit stocker malgré tout des champs identifiants. |

---

## R11 — Stratégie CSRF pour l'API NestJS

**Décision** : double défense contre CSRF, sans token CSRF explicite :

1. **Cookie de session strict** : `__Host-cv.session.token` avec
   `SameSite=Lax`, `Secure`, `HttpOnly`. Empêche les requêtes cross-site
   simples (formulaires HTML, image tags, etc.) d'envoyer le cookie.
2. **Custom header obligatoire** sur toute mutation : `X-Requested-By: web`.
   Le middleware NestJS rejette toute requête `POST/PUT/DELETE/PATCH`
   sans ce header. Les requêtes cross-site simples ne peuvent pas
   ajouter un custom header sans pré-vol CORS (qui sera refusé par notre
   CORS config restrictive).

**Rationale** : bloqueur B6 du review. Notre auth utilise des cookies
de session (ADR-0004), donc soumise au CSRF. Le pattern double-submit
token est plus complexe à câbler avec Server Actions Next.js qu'un
header check. Le pattern retenu est **recommandé par OWASP** pour les API
JSON-only modernes (CSRF Prevention Cheat Sheet, méthode "Custom Request
Header").

**Alternatives considérées** :

| Option | Pourquoi rejetée |
|---|---|
| Token CSRF explicite (double-submit cookie) | Plus complexe à intégrer avec Server Actions Next.js. Sécurité équivalente au pattern custom header pour des API JSON. |
| Aucune défense (s'appuyer uniquement sur SameSite) | SameSite Lax laisse passer les `<form method=GET>` ; insuffisant. |
| JWT en `Authorization` header | Bascule majeure d'architecture (ADR-0004 à revoir). Pas justifié au MVP. |

**Référence** : [OWASP CSRF Prevention Cheat Sheet — Use of Custom Request Headers](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#use-of-custom-request-headers).

---

## Inconnues restantes

Aucune. Toutes les décisions techniques nécessaires au démarrage de
l'implémentation sont consignées ici ou dans `data-model.md` /
`contracts/`. Les décisions ultérieures (changement de fournisseur,
introduction de l'OCR, scan antivirus) feront l'objet d'ADR séparés au
moment où elles deviendront pertinentes.

**Bloqueurs B1-B6 du review résolus** :

- B1 (Outbox pattern) → R7
- B2 (Upload intent) → R8
- B3 (Topologie Next.js ↔ NestJS) → ADR-0004 (session DB partagée)
- B4 (Module boundary enforcement) → R9
- B5 (Pseudonymisation audit) → R10
- B6 (CSRF NestJS) → R11
