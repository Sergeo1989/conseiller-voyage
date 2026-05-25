# Data Model — Mentions légales, CGU, politique de confidentialité

**Date** : 2026-05-25 (révisé post-review)

Modèle de données pour la traçabilité des acceptations légales horodatées
Loi 25. Extension du schéma du module `identité` existant — pas de nouveau
module.

**Révision post-review** : suppression de `supersededById` (chain inutile,
calculable depuis `max(version) WHERE effectiveAt <= now()`) ; suppression
de `mdxPath` (dérivable de convention) ; ajout de `contentSnapshot`
(archive éternelle pour défense légale) ; séparation de `LegalAcceptance`
en deux tables (acceptation pure immutable + anonymisation différée).

---

## Entités du domaine

### `LegalDocument`

Document légal versionné. Une row par couple `(type, version)`.
**Immutable post-insertion** — aucune modification après seed.

| Champ | Type | Contraintes |
|---|---|---|
| `id` | `LegalDocumentId` (UUID v4) | Unique |
| `type` | `LegalDocumentType` (enum) | `mentions_legales` / `cgu_b2c` / `cgu_b2b` / `confidentialite` / `comment_ca_marche` |
| `version` | `int` | Monotone par `type`. Commence à 1. |
| `checksum` | `string` (64 chars hex) | SHA-256 du corps MDX rendu (hors frontmatter), pour détection de drift au build |
| `contentSnapshot` | `string` (Text) | Snapshot complet du contenu rendu à publication, pour archive ad vitam (réaffichage d'une version acceptée historiquement, indépendamment de l'état actuel du repo Git) |
| `publishedAt` | `Date` | Date de publication (insert en BD) |
| `effectiveAt` | `Date` | Date de prise d'effet (≥ `publishedAt`) ; permet d'annoncer une nouvelle version avant qu'elle ne devienne obligatoire |

**Invariants** :

- Un seul `(type, version)` par row (clé unique composite).
- `version` strictement croissant pour un `type` donné.
- `effectiveAt ≥ publishedAt`.
- Row strictement immutable après insertion (trigger PostgreSQL bloque
  `UPDATE` et `DELETE`).
- `contentSnapshot` calculé au moment du seed (post-déploiement) et figé.

**Requête « version active » d'un type** :

```sql
-- Version active = la plus récente dont l'effectiveAt est passé
SELECT * FROM auth_legal_documents
WHERE type = 'cgu_b2b' AND effective_at <= NOW()
ORDER BY version DESC
LIMIT 1;
```

Côté Prisma :

```typescript
const active = await prisma.legalDocument.findFirst({
  where: { type: 'cgu_b2b', effectiveAt: { lte: new Date() } },
  orderBy: { version: 'desc' },
});
```

Index dédié `(type, version DESC)` rend la requête O(log n).

### `LegalAcceptance`

Acceptation horodatée par un sujet (conseiller, admin, ou brief voyageur
anonyme). **Strictement immutable** — aucune mutation possible après
insertion (trigger PostgreSQL bloque UPDATE et DELETE).

| Champ | Type | Contraintes |
|---|---|---|
| `id` | `LegalAcceptanceId` (UUID v4) | Unique |
| `subjectType` | `enum 'user' \| 'brief'` | `user` = conseiller/admin ; `brief` = voyageur anonyme |
| `subjectId` | `string` (UUID) | `auth_users.id` ou `briefs.id` |
| `documentType` | `LegalDocumentType` (enum) | `cgu_b2c`, `cgu_b2b`, `confidentialite` (les autres types n'ont pas d'acceptation) |
| `documentVersion` | `int` | Version acceptée — clé étrangère logique vers `LegalDocument(type, version)` |
| `acceptedAt` | `Date` | Horodatage UTC, immutable |
| `ipAddress` | `string` | IPv4 ou IPv6, Loi 25 art. 8 |
| `userAgent` | `string` | User-Agent HTTP, Loi 25 art. 8 |

**Invariants** :

- Clé unique composite : `(subjectId, documentType, documentVersion)` —
  idempotence Loi 25.
- **Immutable absolue** : trigger PostgreSQL refuse tous UPDATE et DELETE.
- Pas de champ d'anonymisation ici — les valeurs PII sont effacées via
  `LegalAcceptanceAnonymization` (table séparée, cf. ci-dessous).

### `LegalAcceptanceAnonymization`

Table séparée append-only qui matérialise l'anonymisation Loi 25 d'une
acceptation. Une row par acceptation effacée. Permet de garder
`LegalAcceptance` strictement immutable tout en respectant le droit à
l'effacement.

| Champ | Type | Contraintes |
|---|---|---|
| `id` | UUID v4 | Unique |
| `acceptanceId` | `LegalAcceptanceId` | FK → `LegalAcceptance.id`, unique (une seule anonymisation par acceptation) |
| `subjectIdHash` | `string` (64 chars hex) | SHA-256 (`subjectId` || project_salt) |
| `ipAddressMasked` | `string` | IPv4 : premier octet conservé (`a.0.0.0/24`) ; IPv6 : famille conservée |
| `userAgentFamily` | `string` | Famille de navigateur uniquement (`'Firefox'`, `'Chrome'`, `'unknown'`, ...) |
| `anonymizedAt` | `Date` | Horodatage UTC |
| `anonymizationSaltVersion` | `int` | Version du salt utilisée (cf. R9 plan de rotation) ; défaut 1 |

**Sémantique de lecture** :

```sql
-- Acceptation avec anonymisation appliquée (post-Loi 25)
SELECT
  la.id, la.documentType, la.documentVersion, la.acceptedAt,
  COALESCE(lan.subjectIdHash, la.subjectId::text) AS effective_subject,
  COALESCE(lan.ipAddressMasked, la.ipAddress) AS effective_ip,
  COALESCE(lan.userAgentFamily, la.userAgent) AS effective_ua,
  lan.anonymizedAt IS NOT NULL AS is_anonymized
FROM auth_legal_acceptances la
LEFT JOIN auth_legal_acceptance_anonymizations lan
  ON lan.acceptance_id = la.id;
```

Côté application, on encapsule ce LEFT JOIN dans
`PrismaLegalAcceptanceRepository.findWithAnonymization()`. Aucun
appelant n'accède au `subjectId` brut sans passer par cette méthode.

---

## Schéma Prisma proposé

Fichier cible : `apps/api/prisma/schema.prisma` (extension du schéma
existant, pas nouveau fichier).

```prisma
// ============================================================
// Mentions légales — extension du module identité (spec 004)
// Révision post-review : suppression supersededById + mdxPath,
// ajout contentSnapshot, séparation acceptation/anonymisation.
// ============================================================

enum LegalDocumentType {
  mentions_legales
  cgu_b2c
  cgu_b2b
  confidentialite
  comment_ca_marche
}

enum LegalAcceptanceSubjectType {
  user
  brief
}

model LegalDocument {
  id              String            @id @default(uuid()) @db.Uuid
  type            LegalDocumentType
  version         Int
  checksum        String            @db.Char(64)
  contentSnapshot String            @db.Text
  publishedAt     DateTime          @default(now())
  effectiveAt     DateTime

  acceptances     LegalAcceptance[]

  @@unique([type, version], map: "auth_legal_documents_type_version_key")
  @@index([type, version(sort: Desc)], map: "auth_legal_documents_type_version_desc_idx")
  @@map("auth_legal_documents")
}

model LegalAcceptance {
  id              String                       @id @default(uuid()) @db.Uuid
  subjectType     LegalAcceptanceSubjectType
  subjectId       String                       @db.Uuid
  documentType    LegalDocumentType
  documentVersion Int
  acceptedAt      DateTime                     @default(now())
  ipAddress       String                       @db.VarChar(45)
  userAgent       String                       @db.VarChar(512)

  // Relation logique vers LegalDocument
  document        LegalDocument?               @relation(fields: [documentType, documentVersion], references: [type, version])
  anonymization   LegalAcceptanceAnonymization?

  @@unique([subjectId, documentType, documentVersion], map: "auth_legal_acceptances_idempotency_key")
  @@index([subjectId, documentType, acceptedAt(sort: Desc)], map: "auth_legal_acceptances_subject_history_idx")
  @@index([documentType, documentVersion], map: "auth_legal_acceptances_by_document_idx")
  @@map("auth_legal_acceptances")
}

model LegalAcceptanceAnonymization {
  id                       String           @id @default(uuid()) @db.Uuid
  acceptanceId             String           @unique @db.Uuid
  acceptance               LegalAcceptance  @relation(fields: [acceptanceId], references: [id], onDelete: Restrict)
  subjectIdHash            String           @db.Char(64)
  ipAddressMasked          String           @db.VarChar(45)
  userAgentFamily          String           @db.VarChar(64)
  anonymizedAt             DateTime         @default(now())
  anonymizationSaltVersion Int              @default(1)

  @@index([anonymizedAt], map: "auth_legal_acceptance_anonymizations_anonymized_at_idx")
  @@map("auth_legal_acceptance_anonymizations")
}
```

### Migration SQL complémentaire — triggers append-only stricts

Trois triggers, alignés sur le pattern établi en 001 pour
`conformite_audit_entries` mais plus simples (aucun UPDATE permis sur
les tables d'acceptation et de documents) :

```sql
-- 00NN_init_legal_immutability.sql

CREATE OR REPLACE FUNCTION auth_legal_documents_block_modifications()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'auth_legal_documents is immutable; TG_OP=% rejected', TG_OP;
END;
$$;

CREATE TRIGGER trg_auth_legal_documents_immutable
  BEFORE UPDATE OR DELETE ON auth_legal_documents
  FOR EACH ROW EXECUTE FUNCTION auth_legal_documents_block_modifications();

CREATE OR REPLACE FUNCTION auth_legal_acceptances_block_modifications()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'auth_legal_acceptances is append-only; TG_OP=% rejected. For anonymization, insert into auth_legal_acceptance_anonymizations instead.', TG_OP;
END;
$$;

CREATE TRIGGER trg_auth_legal_acceptances_immutable
  BEFORE UPDATE OR DELETE ON auth_legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION auth_legal_acceptances_block_modifications();

CREATE OR REPLACE FUNCTION auth_legal_acceptance_anonymizations_block_modifications()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'auth_legal_acceptance_anonymizations is append-only; TG_OP=% rejected', TG_OP;
END;
$$;

CREATE TRIGGER trg_auth_legal_acceptance_anonymizations_immutable
  BEFORE UPDATE OR DELETE ON auth_legal_acceptance_anonymizations
  FOR EACH ROW EXECUTE FUNCTION auth_legal_acceptance_anonymizations_block_modifications();

-- Restriction de privilèges côté rôle applicatif (défense en profondeur)
REVOKE UPDATE, DELETE ON auth_legal_documents FROM app_identite;
REVOKE UPDATE, DELETE ON auth_legal_acceptances FROM app_identite;
REVOKE UPDATE, DELETE ON auth_legal_acceptance_anonymizations FROM app_identite;
```

Les triggers sont strictement bloquants — aucune logique conditionnelle
qui pourrait dériver (contrairement à la version pré-review qui
autorisait les UPDATE sur des champs spécifiques).

---

## Privilèges DB par rôle

Cohérent avec le pattern établi en 001 (rôles applicatifs séparés par
module) :

| Rôle | `auth_legal_documents` | `auth_legal_acceptances` | `auth_legal_acceptance_anonymizations` |
|---|---|---|---|
| `app_identite` | SELECT, INSERT | SELECT, INSERT | SELECT, INSERT |
| `app_conformite` | SELECT | SELECT | SELECT |
| `app_intake` (à créer pour module 002) | SELECT | SELECT (lecture pour audit) | — (aucun accès) |
| `app_matching` (futur) | — | — | — |
| Tous autres | — | — | — |

- `app_identite` est le seul writer (cohérent avec la propriété modulaire).
- `app_conformite` lit (utile pour rapports OPC / audit Loi 25).
- `app_intake` lit ses propres acceptations brief pour cohérence interne ;
  pas d'accès aux acceptations user (séparation B2B/B2C respectée).
- Aucun autre rôle n'a d'accès direct — passage obligatoire par la façade
  `LegalAcceptanceFacade`.

Test CI `tools/check-module-boundaries.ts` (livré en 001) étendu pour
vérifier que les imports Prisma cross-module respectent ces grants.

---

## Index et performance

Indices critiques :

- `auth_legal_documents(type, version DESC)` — lookup version active.
- `auth_legal_documents(type, version)` UNIQUE — contrainte + lookup
  exact.
- `auth_legal_acceptances(subjectId, documentType, documentVersion)` UNIQUE
  — idempotence sur acceptation rejouée.
- `auth_legal_acceptances(subjectId, documentType, acceptedAt DESC)` —
  récupération de la dernière acceptation pour un sujet et un type
  (vérification version obsolète au middleware).
- `auth_legal_acceptances(documentType, documentVersion)` — métriques
  agrégées par version.
- `auth_legal_acceptance_anonymizations(acceptanceId)` UNIQUE — JOIN
  rapide depuis `LegalAcceptance` vers son anonymisation.

---

## Volumétrie estimée année 1

| Table | Lignes anticipées |
|---|---|
| `auth_legal_documents` | < 20 (5 types × ~2-4 versions max sur l'année) |
| `auth_legal_acceptances` | ~1 300 (500 conseillers × 1 acceptation CGU + ~400 briefs × 2 acceptations) |
| `auth_legal_acceptance_anonymizations` | < 50 année 1 (estimation effacements Loi 25 demandés) |

Total < 500 KB de données structurées + ~50 KB par version de document
pour `contentSnapshot` × ~20 versions = ~1-2 MB total. Aucun enjeu de
partitioning au MVP. À reconsidérer en année 3.

---

## Règles d'anonymisation Loi 25 (extension de FR-019 de la spec 001)

Lorsque `EraseConseillerDataUseCase` (livré en 001) traite un conseiller,
il **DOIT** appeler un nouveau use case `AnonymizeLegalAcceptancesUseCase`
(livré dans cette feature) qui :

1. Liste toutes les `LegalAcceptance` où `subjectType='user' AND subjectId={userId}`.
2. Pour chacune, **INSERT** une row dans `auth_legal_acceptance_anonymizations` :
   - `acceptanceId = legalAcceptance.id`
   - `subjectIdHash = SHA-256(legalAcceptance.subjectId || project_salt_v1)`
   - `ipAddressMasked = maskIp(legalAcceptance.ipAddress)`
   - `userAgentFamily = extractBrowserFamily(legalAcceptance.userAgent)` (cf. R6 `ua-parser-js`)
   - `anonymizedAt = NOW()`
   - `anonymizationSaltVersion = 1` (cf. R9)
3. La row `LegalAcceptance` originale **n'est PAS modifiée** (trigger
   bloque). Les consommateurs en lecture utilisent toujours
   `findWithAnonymization()` qui fait le LEFT JOIN et retourne les
   valeurs anonymisées si présentes.

Pour les `LegalAcceptance` de type `brief` (voyageur anonyme), même
règle appliquée lors de l'effacement Loi 25 cross-module du brief
(orchestré par feature 023 du roadmap, à venir).

Tests d'invariant Vitest :

1. Un script tente un `UPDATE` sur `subjectId` d'une acceptance et
   vérifie qu'il échoue avec l'exception PostgreSQL.
2. Un script tente un `DELETE` sur une acceptance et vérifie qu'il
   échoue.
3. Un script tente un `INSERT` doublon dans `LegalAcceptanceAnonymization`
   pour la même `acceptanceId` et vérifie qu'il échoue (contrainte
   unique).
4. Un script vérifie que `findWithAnonymization()` retourne `subjectIdHash`
   et `ipAddressMasked` pour une acceptance anonymisée, et les valeurs
   originales sinon.

---

## Diagramme des flux (révisé post-review)

```text
SIGNUP CONSEILLER
==================
[UI Next.js] Formulaire signup avec checkbox "J'accepte les CGU conseiller v3"
       │
       ▼
[Server Action] POST /api/me/legal/accept { documentType: 'cgu_b2b', documentVersion: 3 }
       │
       │ AuthGuard vérifie session, RBAC role=conseiller
       ▼
[AcceptCguB2bUseCase]
       │ Vérifie LegalDocument(type=cgu_b2b, version=3) existe et effectiveAt <= now()
       │ Vérifie pas de LegalAcceptance existante pour (userId, cgu_b2b, 3) → sinon retourne idempotent OK
       ▼
[LegalAcceptanceWriter] INSERT auth_legal_acceptances
       │ Trigger refuse mutations futures
       │ Set-Cookie __Host-cv.legal-version signé HMAC
       ▼
[Réponse 201] { acceptanceId, acceptedAt }


BRIEF INTAKE VOYAGEUR — DOUBLE CONSENTEMENT (alt 2 de R7)
==========================================================
[UI Next.js intake] 2 checkboxes : confidentialité v2 + CGU voyageur v1
       │
       ▼
[002 SubmitBriefUseCase] state machine : consent_pending → consent_ok → submitted
       │ 1. Crée Brief en consent_pending (transaction 002 propre)
       ▼
[LegalAcceptanceFacade.acceptForBrief × 2] (port public de 004, identité owns the transaction)
       │ Insert × 2 acceptances dans une transaction Prisma côté identité
       │ Si succès → retourne OK
       │ Si échec → rollback transaction interne, exception remontée à 002
       ▼
[002 SubmitBriefUseCase] (suite)
       │ 2. Met Brief à consent_ok (transaction séparée)
       │ 3. Met Brief à submitted (workflow normal)
       ▼
[Réponse 201] { briefId, legalAcceptanceIds: [...] }

ORPHAN CLEANUP (job BullMQ quotidien côté 002)
       │ Détecte Brief en consent_pending > 1 heure
       │ Marque consent_failed (invisible matching)


CHECK DE VERSION CGU CONSEILLER (middleware Next.js, R4 + R8)
================================================================
[Requête vers /[locale]/(conseiller)/*]
       │
       ▼
[middleware.ts]
       │ Lit cookie __Host-cv.legal-version (HMAC signé)
       │ Si présent et HMAC valide et non expiré : décode { userId, cguB2bVersion, exp }
       │   - cguB2bVersion === current → next()
       │   - cguB2bVersion < current → redirect /cgu-conseiller/re-accepter
       │ Si absent / signature invalide / expiré :
       │   GET /api/me/legal/version-status → set Cookie, applique logique
       ▼
       compareLegalVersion(courante, dernière_acceptée) =
         'up_to_date' → next()
         'outdated' → redirect('/[locale]/cgu-conseiller/re-accepter')
         'never_accepted' → redirect('/[locale]/cgu-conseiller/re-accepter')


EFFACEMENT LOI 25 (orchestré par EraseConseillerDataUseCase de 001)
=====================================================================
[EraseConseillerDataUseCase] (étendu en 004)
       │ Anonymisation conformite_*, S3 documents (déjà livré en 001)
       ▼
[AnonymizeLegalAcceptancesUseCase] (nouveau, ce plan)
       │ Pour chaque LegalAcceptance(subjectId=userId) :
       │   INSERT LegalAcceptanceAnonymization {
       │     subjectIdHash = sha256(subjectId || salt_v1),
       │     ipAddressMasked = maskIp(ipAddress),
       │     userAgentFamily = extractBrowserFamily(userAgent),
       │     anonymizationSaltVersion = 1
       │   }
       │   LegalAcceptance originale reste intacte (trigger bloque mutations)
       ▼
[AuditLogWriter] entry 'erasure.completed' déjà géré en 001
```
