# Data Model — Mentions légales, CGU, politique de confidentialité

**Date** : 2026-05-25

Modèle de données pour la traçabilité des acceptations légales horodatées
Loi 25. Extension du schéma du module `identité` existant — pas de nouveau
module.

---

## Entités du domaine

### `LegalDocument`

Document légal versionné. Une row par couple `(type, version)`.

| Champ | Type | Contraintes |
|---|---|---|
| `id` | `LegalDocumentId` (UUID v4) | Unique |
| `type` | `LegalDocumentType` (enum) | `mentions_legales` / `cgu_b2c` / `cgu_b2b` / `confidentialite` / `comment_ca_marche` |
| `version` | `int` | Monotone par `type`. Pas de version 0 ; commence à 1. |
| `checksum` | `string` (64 chars hex) | SHA-256 du corps MDX rendu (hors frontmatter), pour détection de drift |
| `mdxPath` | `string` | Chemin relatif source MDX, ex. `fr-CA/cgu-conseiller.mdx` ; utile pour audit, pas pour rendu |
| `publishedAt` | `Date` | Date de publication (insert en BD) |
| `effectiveAt` | `Date` | Date de prise d'effet (≥ `publishedAt`) ; permet d'annoncer une nouvelle version avant qu'elle ne devienne obligatoire |
| `supersededBy` | `LegalDocumentId \| null` | Version qui remplace celle-ci ; null si la plus récente |

**Invariants** :

- Un seul `(type, version)` par row (clé unique composite).
- `version` est strictement croissant pour un `type` donné.
- `effectiveAt ≥ publishedAt` (si égal, la nouvelle version est obligatoire immédiatement).
- Une fois `supersededBy` set, la row devient « historique » — aucune
  modification ultérieure du champ permise (immutable post-supersession).

### `LegalAcceptance`

Acceptation horodatée par un sujet (conseiller, admin, ou brief voyageur
anonyme). Append-only.

| Champ | Type | Contraintes |
|---|---|---|
| `id` | `LegalAcceptanceId` (UUID v4) | Unique |
| `subjectType` | `enum 'user' \| 'brief'` | `user` = conseiller/admin authentifié ; `brief` = voyageur anonyme |
| `subjectId` | `string` | UUID `auth_users.id` si `subjectType='user'`, sinon UUID du brief intake |
| `subjectIdHash` | `string \| null` | SHA-256 du `subjectId` post-effacement Loi 25 ; null tant que non anonymisé |
| `documentType` | `LegalDocumentType` (enum) | Seuls les types collectant un consentement : `cgu_b2c`, `cgu_b2b`, `confidentialite` (les autres pour audit éditorial, pas matérialisés en `LegalAcceptance`) |
| `documentVersion` | `int` | Version acceptée — clé étrangère logique vers `LegalDocument(type, version)` |
| `acceptedAt` | `Date` | Horodatage UTC, immutable |
| `ipAddress` | `string` | IPv4 ou IPv6, Loi 25 art. 8 traçabilité technique. Anonymisable post-effacement (premier octet conservé, le reste haché). |
| `userAgent` | `string` | User-Agent HTTP, Loi 25 art. 8. Anonymisable post-effacement (famille seulement). |

**Invariants** :

- Clé unique composite : `(subjectId, documentType, documentVersion)` —
  idempotence Loi 25 (un même sujet ne peut accepter la même version d'un
  document qu'une fois).
- `subjectIdHash` est null à la création ; set uniquement lors d'un
  effacement Loi 25 cross-module.
- Une fois créée, jamais modifiée sauf les champs d'anonymisation
  (`subjectIdHash`, version masquée de `ipAddress` et `userAgent`).
- Pas de delete possible (append-only) — trigger PostgreSQL bloque
  `UPDATE` sur les champs non-anonymisation et bloque `DELETE`
  intégralement.

---

## Schéma Prisma proposé

Fichier cible : `apps/api/prisma/schema.prisma` (extension, pas nouveau
fichier).

```prisma
// ============================================================
// Mentions légales — extension du module identité (spec 004)
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
  id            String            @id @default(uuid()) @db.Uuid
  type          LegalDocumentType
  version       Int
  checksum      String            @db.Char(64)
  mdxPath       String            @db.VarChar(255)
  publishedAt   DateTime          @default(now())
  effectiveAt   DateTime
  supersededById String?          @db.Uuid
  supersededBy  LegalDocument?    @relation("Supersession", fields: [supersededById], references: [id])
  superseding   LegalDocument[]   @relation("Supersession")

  acceptances   LegalAcceptance[]

  @@unique([type, version], map: "auth_legal_documents_type_version_key")
  @@index([type, supersededById], map: "auth_legal_documents_type_active_idx")
  @@map("auth_legal_documents")
}

model LegalAcceptance {
  id              String                       @id @default(uuid()) @db.Uuid
  subjectType     LegalAcceptanceSubjectType
  subjectId       String                       @db.Uuid
  subjectIdHash   String?                      @db.Char(64)
  documentType    LegalDocumentType
  documentVersion Int
  acceptedAt      DateTime                     @default(now())
  ipAddress       String                       @db.VarChar(45)
  userAgent       String                       @db.VarChar(512)

  // Relation logique (pas FK stricte — version peut être supersédée)
  document        LegalDocument?               @relation(fields: [documentType, documentVersion], references: [type, version])

  @@unique([subjectId, documentType, documentVersion], map: "auth_legal_acceptances_idempotency_key")
  @@index([subjectId, documentType, acceptedAt(sort: Desc)], map: "auth_legal_acceptances_subject_history_idx")
  @@index([documentType, documentVersion], map: "auth_legal_acceptances_by_document_idx")
  @@map("auth_legal_acceptances")
}
```

### Migration SQL complémentaire — append-only trigger

Cohérent avec le pattern établi en 001 sur `conformite_audit_entries` :

```sql
-- 00NN_init_legal_append_only.sql

CREATE OR REPLACE FUNCTION auth_legal_acceptances_block_modifications()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Autorise UPDATE uniquement sur les champs d'anonymisation
  IF TG_OP = 'UPDATE' THEN
    IF NEW.subject_id <> OLD.subject_id
       OR NEW.subject_type <> OLD.subject_type
       OR NEW.document_type <> OLD.document_type
       OR NEW.document_version <> OLD.document_version
       OR NEW.accepted_at <> OLD.accepted_at THEN
      RAISE EXCEPTION 'auth_legal_acceptances is append-only; only anonymization fields (subject_id_hash, ip_address, user_agent) may be updated';
    END IF;
    RETURN NEW;
  END IF;

  -- Bloque DELETE intégralement
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'auth_legal_acceptances is append-only; DELETE is not permitted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auth_legal_acceptances_append_only
  BEFORE UPDATE OR DELETE ON auth_legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION auth_legal_acceptances_block_modifications();

-- Restriction de privilège côté rôle applicatif (défense en profondeur)
REVOKE DELETE ON auth_legal_acceptances FROM app_identite;
-- UPDATE reste autorisé pour permettre l'anonymisation contrôlée par l'app
```

Note : la fonction autorise un `UPDATE` qui ne touche que les champs
d'anonymisation. L'app doit s'assurer de ne mettre à jour QUE ces champs
lors d'un effacement Loi 25 (test d'intégration dédié).

---

## Index et performance

Indices critiques :

- `auth_legal_documents(type, version)` UNIQUE — lookup principal au boot
  app pour seed et au check de version courante.
- `auth_legal_documents(type, supersededById)` — récupération de la
  version active d'un type (`WHERE type='cgu_b2b' AND supersededById IS NULL`).
- `auth_legal_acceptances(subjectId, documentType, documentVersion)` UNIQUE —
  idempotence sur acceptation rejouée.
- `auth_legal_acceptances(subjectId, documentType, acceptedAt DESC)` —
  récupération de la dernière acceptation pour un sujet et un type
  (vérification version obsolète au middleware).
- `auth_legal_acceptances(documentType, documentVersion)` — métriques
  agrégées par version (« combien d'utilisateurs ont accepté la version
  X de la confidentialité ? »).

---

## Volumétrie estimée année 1

| Table | Lignes anticipées |
|---|---|
| `auth_legal_documents` | < 20 (5 types × ~2-4 versions max sur l'année) |
| `auth_legal_acceptances` | ~1 300 (500 conseillers × 1 acceptation CGU + ~400 briefs × 2 acceptations) |

Total < 200 KB de données structurées. Aucun enjeu de partitioning au
MVP. À reconsidérer en année 3 si > 100 000 acceptations cumulées.

---

## Règles d'anonymisation Loi 25 (extension de FR-019 de la spec 001)

Lorsque `EraseConseillerDataUseCase` (livré en 001) traite un conseiller,
il **DOIT** également :

1. Pour chaque `LegalAcceptance` où `subjectType='user' AND subjectId={userId}` :
   - `subjectIdHash = SHA-256(subjectId || project_salt)` (cf. R3)
   - `subjectId = NULL` (effacement effectif)
   - `ipAddress = first_octet(ipAddress) || '.0.0.0/24'` (ou IPv6
     équivalent — garde la famille géographique, perd l'identifiant)
   - `userAgent = browser_family(userAgent)` (« Firefox », « Chrome »,
     etc., perd la version et l'OS exact)
2. La row n'est **jamais** supprimée — elle reste comme preuve historique
   de l'engagement contractuel.

Pour les `LegalAcceptance` de type `brief` (voyageur anonyme), la même
règle s'applique lors de l'effacement Loi 25 cross-module du brief
intake (orchestré par 023 du roadmap, à venir).

Test d'invariant Vitest : un script tente un `UPDATE` sur `subjectId`
d'une acceptance et vérifie qu'il échoue avec l'exception PostgreSQL ;
un autre tente un `DELETE` et vérifie qu'il échoue. Mêmes patterns que
les tests de trigger livrés en 001.

---

## Diagramme des flux

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
       │ Vérifie document.version === 3 et document.supersededBy === null
       │ Vérifie pas de LegalAcceptance existante pour (userId, cgu_b2c, 3) → sinon retourne idempotent OK
       ▼
[LegalAcceptanceWriter] INSERT auth_legal_acceptances
       │ Trigger append-only bloque toute mutation future
       ▼
[Réponse 201] { acceptanceId, acceptedAt }


BRIEF INTAKE VOYAGEUR (intégration depuis 002)
================================================
[UI Next.js intake] 2 checkboxes : confidentialité v2 + CGU voyageur v1
       │
       ▼
[Server Action submit-brief]
       │ Validation Zod + création du brief
       ▼
[LegalAcceptanceFacade.acceptIntakeConsent] (port public)
       │ Insère 2 LegalAcceptance avec subjectType='brief', subjectId={briefId}
       │ Dans la MÊME transaction Prisma que la création du brief
       ▼
[Réponse 201] { briefId, legalAcceptanceIds: [...] }


CHECK DE VERSION CGU CONSEILLER (middleware Next.js)
======================================================
[Requête vers /[locale]/(conseiller)/*]
       │
       ▼
[middleware.ts]
       │ Lit cookie de session Auth.js
       │ Lit cookie 'legal-cgu-b2b-version' (TTL 5 min) si présent
       ▼
       │ Cookie présent : compare version vs courante (lue depuis env ou cache)
       │ Cookie absent : appelle CheckCguUpToDateUseCase via API interne
       ▼
       compareLegalVersion(courante, dernière_acceptée) =
         'up_to_date' → next()
         'outdated' → redirect('/[locale]/cgu-conseiller/re-accepter')
         'never_accepted' → redirect('/[locale]/cgu-conseiller/re-accepter')


EFFACEMENT LOI 25 (orchestré par EraseConseillerDataUseCase de 001)
=====================================================================
[EraseConseillerDataUseCase] (étendu)
       │ Anonymisation conformite_*, S3 documents (déjà livré en 001)
       ▼
[Étape supplémentaire] Pour chaque auth_legal_acceptances WHERE subjectId = userId :
       UPDATE
         SET subjectIdHash = sha256(subjectId || salt),
             subjectId = NULL,
             ipAddress = anonymized_ip(ipAddress),
             userAgent = browser_family_only(userAgent)
       ▼
[AuditLogWriter] entry 'erasure.completed' déjà géré en 001
```
