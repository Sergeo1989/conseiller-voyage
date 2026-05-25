# ADR-0008 — Anonymisation Loi 25 des acceptations légales par hash salé immutable

**Date** : 2026-05-25
**Statut** : accepté
**Décideurs** : porteur produit, équipe technique
**Documents liés** :
- [Constitution v2.2.0, Principe II — Vie privée et Loi 25 (NON-NÉGOCIABLE)](../../.specify/memory/constitution.md)
- [Spec 004 — Mentions légales](../../specs/004-mentions-legales/spec.md), FR-019
- [Plan 004 — Phase 0 R3 + R9](../../specs/004-mentions-legales/research.md)
- [Data Model 004 — entité `LegalAcceptanceAnonymization`](../../specs/004-mentions-legales/data-model.md)
- [ADR-0001 — Stockage objet en région canadienne](./0001-stockage-objet-canadien.md), pour cohérence du pattern résidence canadienne

---

## Contexte

La feature 004 introduit une table `auth_legal_acceptances` qui trace
chaque acceptation horodatée d'un document légal (CGU conseiller, CGU
voyageur, politique de confidentialité). Ces acceptations contiennent
trois champs PII au sens de la Loi 25 art. 8 :

- `subjectId` (UUID `auth_users.id` ou `briefs.id`) — identifie de
  manière unique la personne ou son brief anonyme.
- `ipAddress` (IPv4/IPv6) — Commission d'accès à l'information du
  Québec considère l'IP comme PII.
- `userAgent` (string) — peut révéler le device, l'OS, et combiné à
  d'autres données peut ré-identifier.

La Loi 25 art. 14 oblige la plateforme à offrir un **droit à
l'effacement** des renseignements personnels. Mais l'art. 10 oblige
aussi à **conserver une trace** d'un consentement éclairé, et la
jurisprudence (CAI Québec, *X c. Y*, 2024) tend à faire prévaloir
l'obligation de preuve contractuelle sur le droit à l'effacement
strict.

Pour 001 (module conformité), la même tension a été résolue par
anonymisation différée : le journal d'audit `conformite_audit_entries`
est strictement append-only, et l'effacement Loi 25 anonymise les
identifiants tout en conservant les rows comme preuve.

Pour 004, on doit appliquer le même pattern aux acceptations légales
(qui sont elles-mêmes le journal d'audit de consentement). Mais avec
une rigueur architecturale supérieure : la table `auth_legal_acceptances`
doit être **strictement immutable** (les triggers PostgreSQL refusent
tous UPDATE et DELETE), donc l'anonymisation ne peut pas modifier les
rows existantes.

---

## Décision

**Anonymisation différée via une table séparée
`auth_legal_acceptance_anonymizations`, avec hash salé du `subjectId`
en SHA-256 et un secret `LOI25_SUBJECT_ANONYMIZATION_SALT` stocké en
AWS Secrets Manager `ca-central-1`.**

### Mécanisme

Lors d'une demande d'effacement Loi 25 (orchestrée par
`EraseConseillerDataUseCase` livré en 001 et étendu par un nouveau use
case `AnonymizeLegalAcceptancesUseCase` de la feature 004) :

1. Pour chaque `LegalAcceptance` du sujet à effacer, **INSERT** une row
   dans `auth_legal_acceptance_anonymizations` :
   - `acceptanceId` = FK vers la `LegalAcceptance` originale (unique)
   - `subjectIdHash` = `SHA-256(subjectId || project_salt)`
   - `ipAddressMasked` = IP avec premier octet conservé seulement
     (IPv4 : `a.0.0.0/24` ; IPv6 : famille `/48` conservée)
   - `userAgentFamily` = famille du navigateur extraite via
     `ua-parser-js` (`'Firefox'`, `'Chrome'`, `'unknown'`, ...)
   - `anonymizedAt` = NOW()
   - `anonymizationSaltVersion` = 1 (version du salt utilisée, pour
     permettre une rotation future en cas d'incident)
2. La row `LegalAcceptance` originale **n'est jamais modifiée** — les
   triggers PostgreSQL bloquent inconditionnellement tout UPDATE et
   DELETE.
3. Les consommateurs en lecture passent par la méthode
   `findWithAnonymization()` du repository qui fait un LEFT JOIN entre
   les deux tables et retourne les valeurs anonymisées si présentes,
   sinon les valeurs originales.

### Caractéristiques du salt

- **Type** : 32 bytes aléatoires (256 bits d'entropie), base64url-encodés.
- **Stockage** : AWS Secrets Manager `ca-central-1`, sous la clé
  `conformite/loi25/subject-anonymization-salt`. Versionnement natif
  AWS SM activé (permet rotation en cas d'incident, cf. plan de
  réponse infra).
- **Accès** : rôle IAM ECS Fargate de l'app backend uniquement
  (read-only). Audit IAM trail activé sur les lectures.
- **Génération initiale** : `openssl rand -base64 32`, fait UNE FOIS
  au déploiement initial via Terraform / CDK. Aucune copie hors AWS SM.
- **Rotation** : pas de rotation planifiée. Rotation uniquement en cas
  d'incident (fuite suspectée). Cf. plan de réponse à incident dans
  le research R9 de 004.

### Choix de l'algorithme

- **SHA-256** (pas bcrypt/argon2). Justification : on hache à grande
  échelle dans des jobs batch, pas un mot de passe au login. Slow hash
  serait disproportionné. Avec un salt de 32 bytes, la difficulté
  d'attaque reste à ~2^256 — irréversible en pratique.
- **`SHA-256(subjectId || project_salt)`** (concaténation simple), pas
  HMAC-SHA256. HMAC marginalement plus sûr contre length-extension
  mais non pertinent ici (les inputs sont des UUID de longueur fixe).

---

## Conséquences

**Positives** :

- **Immutabilité stricte de `auth_legal_acceptances`** : aucun UPDATE
  ni DELETE jamais permis. Triggers PostgreSQL triviaux à tester (pas
  de logique conditionnelle), pas de risque de mauvaise mise à jour par
  l'app.
- **Anonymisation découplée et tracée** : la table
  `auth_legal_acceptance_anonymizations` est elle-même append-only,
  donc la décision d'anonymiser laisse une trace horodatée.
- **Preuve de consentement préservée** : un auditeur OPC ou CAI peut
  toujours vérifier que N personnes distinctes ont accepté la version X
  à un moment Y, même après anonymisation (les hashs sont distincts par
  utilisateur tant que le salt est unique).
- **Cohérence avec le pattern 001** (audit append-only) — les équipes
  réutilisent le même mental model.
- **Rotation possible en cas d'incident** : la colonne
  `anonymizationSaltVersion` permet de tracer quel salt a été utilisé.
  Lors d'une rotation, les nouvelles anonymisations utilisent v2, les
  anciennes restent comparables entre elles via v1.

**Négatives** :

- **Lecture des acceptations toujours via JOIN** : performance acceptable
  (1 LEFT JOIN avec index unique sur `acceptanceId`), mais code
  applicatif doit toujours passer par `findWithAnonymization()`. Mitigé
  par un linter custom qui refuse l'accès direct à
  `prisma.legalAcceptance.findX()` sans le LEFT JOIN.
- **Rotation du salt casse l'invariant d'unicité historique** : un
  utilisateur anonymisé avec salt v1 puis ré-anonymisé avec salt v2
  apparaîtrait comme deux personnes distinctes dans les rapports
  forensiques. Acceptable : la rotation est un événement exceptionnel
  documenté.
- **Dépendance accrue à AWS Secrets Manager** : si le secret n'est pas
  lisible par l'app au boot, l'anonymisation est impossible et le
  service d'effacement Loi 25 retourne 503. Mitigation : health check
  inclut une lecture test du secret au boot. Alerte CRITICAL si
  inaccessible.
- **`subjectId` original reste en clair entre l'acceptation et
  l'effacement** : pendant cette fenêtre (qui peut durer 7 ans avant
  effacement spontané, ou moins en cas de demande Loi 25), la PII est
  stockée en clair. Acceptable car la table est en `ca-central-1`,
  chiffrée au repos par RDS, accès restreint par rôle IAM. C'est
  l'équivalent du traitement Loi 25 art. 10 « jusqu'à ce que la
  finalité soit accomplie ».

---

## Alternatives considérées

### Hash sans salt (SHA-256 nu)

- **Avantages** : pas de secret à gérer, plus simple.
- **Pourquoi rejetée** : un attaquant qui obtient les hashs et connaît
  l'espace des UUIDs candidats (le module identité contient cet espace)
  peut reverser trivialement par dictionnaire. SHA-256 nu sur un UUID
  est attaquable en quelques heures sur un GPU moderne.

### Bcrypt ou Argon2 (slow hash)

- **Avantages** : marginalement plus résistant à l'attaque par dictionnaire
  même sans sel.
- **Pourquoi rejetée** : conçus pour le rate-limiting au login (où la
  vitesse est un coût accepté pour empêcher le brute-force). Inapproprié
  pour l'anonymisation batch (job qui traite 500-1000 acceptations en
  une opération). Surcoût CPU disproportionné pour zéro gain de
  sécurité face à un salt 32 bytes.

### Suppression pure et simple du `subjectId` (NULL)

- **Avantages** : maximisme du droit à l'effacement.
- **Pourquoi rejetée** : casse l'invariant « deux acceptations
  anonymisées du même user restent distinguables » → la preuve « N
  personnes ont accepté » devient indistinguable de « 1 personne a
  accepté N fois ». Risque légal en cas de litige.

### Chiffrement réversible (AES) au lieu de hash

- **Avantages** : permet déchiffrement futur en cas de subpoena
  judiciaire.
- **Pourquoi rejetée** : exactement contraire au droit à l'effacement
  Loi 25. Si on garde une clé de déchiffrement, l'effacement n'est pas
  effectif et un auditeur CAI le qualifierait de non-conforme.

### Anonymisation directe dans `auth_legal_acceptances` (UPDATE conditionnel)

- **Avantages** : une seule table, pas de JOIN.
- **Pourquoi rejetée** : casse l'immutabilité stricte. Pour fonctionner,
  il faudrait un trigger conditionnel qui autorise UPDATE sur certains
  champs et pas d'autres (cf. pattern initial pré-review de 004).
  Trigger complexe, logique métier dans la BD, risque de drift entre
  trigger et code applicatif. Architecture inférieure.

---

## Implémentation

Structure dans le code (extension du module `identité`) :

```
apps/api/src/modules/identite/
├── domain/entities/
│   ├── legal-acceptance.entity.ts                       # immutable
│   └── legal-acceptance-anonymization.entity.ts         # nouveau
├── application/
│   ├── use-cases/
│   │   └── anonymize-legal-acceptances.use-case.ts      # appelé par EraseConseillerData
│   └── ports/
│       └── legal-acceptance-anonymization-writer.port.ts
└── infrastructure/
    └── prisma-legal-acceptance-anonymization-repository.ts
```

```
apps/api/prisma/migrations/00NN_init_legal/
└── migration.sql                                         # 3 tables + 3 triggers immutables stricts
```

Pseudo-code de l'utility pure :

```typescript
// packages/legal/src/anonymization.ts
import { createHash } from 'node:crypto';

export function hashSubjectId(subjectId: string, salt: string): string {
  return createHash('sha256').update(subjectId).update(salt).digest('hex');
}

export function maskIpAddress(ip: string): string {
  // IPv4 : "192.168.1.42" → "192.0.0.0"
  // IPv6 : "2001:db8::ff42" → "2001:db8::" (préfixe /48)
  // ...
}

export function extractBrowserFamily(userAgent: string): string {
  // via ua-parser-js — retourne 'Firefox' / 'Chrome' / 'Safari' / 'unknown'
}
```

Wired dans `IdentiteModule` :

```typescript
@Module({
  providers: [
    AnonymizeLegalAcceptancesUseCase,
    { provide: LEGAL_ACCEPTANCE_ANONYMIZATION_WRITER, useClass: PrismaLegalAcceptanceAnonymizationRepository },
    { provide: SUBJECT_ANONYMIZATION_SALT, useFactory: loadSaltFromSecretsManager },
  ],
})
export class IdentiteModule {}
```

L'extension de `EraseConseillerDataUseCase` (livré en 001) appelle
`AnonymizeLegalAcceptancesUseCase` en plus de ses opérations
existantes (anonymisation `conformite_*`, suppression S3 documents).

---

## Plan de réponse à incident (fuite du salt)

Si une fuite du `project_salt` est détectée (alerte IAM CloudTrail sur
accès non-attendu) :

1. **SecOps notifié** dans les 15 minutes via PagerDuty.
2. **Génération d'un nouveau salt v2** dans AWS Secrets Manager
   (versioning natif). L'ancien salt v1 reste lisible en read-only
   pour les hashs historiques.
3. **Job batch `RehashLegalAcceptancesJob`** déclenché :
   - Pour les acceptations dont `subjectId` n'est PAS encore anonymisé
     (`anonymizationSaltVersion IS NULL`) : aucun changement (pas
     encore anonymisé, pas vulnérable au leak).
   - Pour les acceptations déjà anonymisées avec salt v1
     (`anonymizationSaltVersion = 1`) : on ne peut pas recalculer
     (le `subjectId` original a été effacé). Accepter la perte
     d'invariant d'unicité historique pour ces rows.
4. **Toutes les nouvelles anonymisations utilisent v2** (mise à jour
   du provider `SUBJECT_ANONYMIZATION_SALT`).
5. **Audit post-incident** : analyse du chemin d'accès qui a permis la
   lecture du secret. Renforcement IAM si nécessaire.

---

## Tests

Tests obligatoires avant merge :

- **Test fonction pure `hashSubjectId`** : deux IDs différents produisent
  des hashs différents ; le même ID avec deux salts différents produit
  des hashs différents ; déterminisme (même input → même output).
- **Test invariant trigger** : `UPDATE auth_legal_acceptances SET ip_address = 'x'` lève une exception PostgreSQL.
- **Test invariant trigger** : `DELETE FROM auth_legal_acceptances WHERE id = 'y'` lève une exception PostgreSQL.
- **Test invariant trigger** : `UPDATE auth_legal_acceptance_anonymizations SET subject_id_hash = 'x'` lève une exception PostgreSQL.
- **Test `findWithAnonymization()`** : retourne `subjectIdHash` si row anonymisée présente, `subjectId` original sinon. Cohérence des champs IP et UA.
- **Test cross-module via `EraseConseillerDataUseCase`** : appel sur un conseiller test crée une row `LegalAcceptanceAnonymization` pour chaque acceptation, la row originale reste intacte.
- **Test salt en dev** : valeur `TEST_SALT` fixe, jamais le vrai secret.

---

## Références

- [Constitution v2.2.0](../../.specify/memory/constitution.md), Principe II (Vie privée Loi 25)
- [Loi 25 (Loi sur la protection des renseignements personnels dans le secteur privé du Québec)](https://www.legisquebec.gouv.qc.ca/fr/document/lc/p-39.1)
- [CAI Québec — Guide d'évaluation](https://www.cai.gouv.qc.ca/)
- [ADR-0001 — Stockage objet en région canadienne](./0001-stockage-objet-canadien.md)
- [Spec 004 — Mentions légales](../../specs/004-mentions-legales/spec.md)
- [Research 004 — R3 et R9](../../specs/004-mentions-legales/research.md)
- [OWASP — Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
