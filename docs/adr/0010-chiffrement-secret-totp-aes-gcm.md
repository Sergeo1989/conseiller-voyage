# ADR-0010 — Chiffrement du secret TOTP au repos : AES-256-GCM via `node:crypto`

**Date** : 2026-05-25
**Statut** : accepté
**Décideurs** : porteur produit, équipe technique
**Documents liés** :
- [Constitution v2.2.0, Principe IX — Sécurité applicative (NON-NÉGOCIABLE)](../../.specify/memory/constitution.md)
- [Constitution v2.2.0, Principe II — Vie privée et Loi 25 (NON-NÉGOCIABLE)](../../.specify/memory/constitution.md)
- [Spec 005 — MFA conseiller](../../specs/005-mfa-conseiller/spec.md)
- [Plan 005 § Sécurité — Aucun secret en clair](../../specs/005-mfa-conseiller/plan.md)
- [Research 005 R2](../../specs/005-mfa-conseiller/research.md)

---

## Contexte

La feature 005 (MFA conseiller) doit persister un secret TOTP de 160 bits
par utilisateur enrôlé (`mfa_secrets.encryptedSecret`). Ce secret est
**hautement sensible** :
- C'est lui qui génère les codes à 6 chiffres validés au login.
- Sa fuite permet à un attaquant de générer indéfiniment des codes
  valides → contournement complet du second facteur.
- Il doit transiter entre la BD et la mémoire process à chaque
  vérification TOTP (validation au login, step-up sur action sensible).

Le secret ne peut donc PAS être stocké en clair en BD. Il doit être
**chiffré au repos** avec une clé (KEK) qui ne vit jamais elle-même en
BD.

Trois options ont été évaluées :

1. **AES-256-GCM via `node:crypto` natif** + KEK en AWS Secrets Manager
2. **`libsodium-wrappers` (XChaCha20-Poly1305)** + KEK en Secrets Manager
3. **AWS KMS** — chiffrement/déchiffrement délégué au service KMS à chaque opération

---

## Décision

**Adopter AES-256-GCM via le module natif `node:crypto`, avec KEK
résolue au démarrage du process depuis AWS Secrets Manager
(ca-central-1) en production et variable d'environnement
`MFA_KEK_BASE64` (chargée via 1Password CLI) en dev.**

### Format sérialisé

```text
┌───────────┬────────────────┬─────────────────────────┬──────────────────┐
│ version   │ iv (12 bytes)  │ ciphertext (variable)   │ auth tag (16 B)  │
│ 1 byte    │ random nonce   │ AES-256-GCM             │ GMAC             │
└───────────┴────────────────┴─────────────────────────┴──────────────────┘
            │                                                              │
            └── tout encodé en Base64 standard (sans saut de ligne) ──────┘
```

- `version = 0x01` pour le format initial. Permet la rotation de KEK
  futures avec versionning explicite (cf. *Conséquences* ci-dessous).
- IV (nonce) généré aléatoirement par `crypto.randomBytes(12)` à chaque
  chiffrement. Jamais réutilisé pour la même KEK — exigence formelle de
  GCM.
- Auth tag GMAC 128 bits intégré — toute altération du ciphertext est
  détectée au déchiffrement, throw `TotpSecretIntegrityError`.

### Configuration KEK

- **Production** : ARN
  `arn:aws:secretsmanager:ca-central-1:<account>:secret:cv-mfa-kek`.
  Lecture au démarrage du process apps/api via
  `@aws-sdk/client-secrets-manager` (déjà installé pour 001). Cache mémoire,
  jamais loggue.
- **Dev local** : variable d'environnement `MFA_KEK_BASE64` chargée
  depuis `apps/api/.env` (gitignoré) via dotenv. Doc d'utilisation et
  refus en `NODE_ENV=production` documentés dans `apps/api/.env.example`.
- **CI/test** : valeur déterministe de 32 octets de zéro
  (`AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`) pour reproductibilité
  des vecteurs de test. Refusée par `apps/api/src/env.ts` si
  `NODE_ENV=production`.

### Validation au démarrage

`apps/api/src/env.ts` (T006 de 005) refuse au boot :
- KEK absente
- KEK ne décodant pas exactement 32 octets en base64
- KEK = 32 octets de zéro **si** `NODE_ENV=production`

Le process exit(1) avec un message lisible dans ces cas.

---

## Conséquences

### Positives

- **Standard NIST éprouvé** : AES-256-GCM est l'algorithme AEAD de
  référence depuis 2007. Implémentation native, auditée.
- **Auth tag intégré** : toute altération du ciphertext est détectée
  → défense en profondeur contre une corruption ou une modification BD
  malveillante.
- **Zéro dépendance native externe** : `node:crypto` est dans la
  bibliothèque standard, audité par le Node core team. Pas de
  `node-gyp`, pas de souci de cross-compilation Docker Fargate.
- **Latence négligeable** : chiffrement et déchiffrement < 10 ms p95
  sur ECS Fargate. Compatible SLO Principe X (p95 < 800 ms global).
- **Version byte** : prépare la rotation future sans casser le format.

### Négatives

- **KEK résidente en mémoire process** : la clé décodée vit dans le tas
  du process apps/api pendant toute la durée de vie. Un attaquant qui
  obtient un heap dump (vuln théorique) accède à la KEK et peut donc
  déchiffrer tous les secrets TOTP. Mitigation : durcissement infra
  (ECS task isolée, pas d'accès SSH au container en prod), audit
  réguliers, rotation périodique manuelle (cf. plan ci-dessous).
- **Secret TOTP en mémoire après déchiffrement** : Node.js ne permet
  pas de zero-out une string immuable. Le secret traîne en RAM jusqu'au
  GC. Limitation acceptée (P1-5 du review du plan 005). Mitigation :
  scope étroit (déchiffrement uniquement dans le scope d'un use case),
  pas de log du secret.
- **Pas de rotation automatique** : la KEK ne tourne pas
  automatiquement au MVP. Rotation manuelle via Secrets Manager si
  compromission suspectée.

### Plan de rotation de KEK (hors-scope MVP, documenté pour traçabilité)

1. Ajouter une version `0x02` au format sérialisé.
2. Job de migration qui lit chaque ligne `mfa_secrets`, déchiffre avec
   ancienne KEK (version 0x01), rechiffre avec nouvelle KEK (version
   0x02), met à jour la ligne.
3. Ancienne KEK conservée temporairement dans Secrets Manager
   (`cv-mfa-kek-v1`) jusqu'à confirmation que toutes les lignes sont
   migrées.
4. Aucune interruption de service nécessaire — les lectures gèrent les
   deux versions en parallèle pendant la transition.

---

## Alternatives rejetées

### Alternative 1 : `libsodium-wrappers` (XChaCha20-Poly1305)

Algorithme aussi sûr qu'AES-GCM, avec un nonce de 192 bits qui élimine
le risque d'épuisement (vs 96 bits pour GCM, théoriquement risqué après
2^32 chiffrements avec la même clé).

**Rejeté car** :
- Ajoute une dépendance native non triviale (`sodium-native` ou WASM).
- Surface d'attaque supplémentaire.
- Le risque d'épuisement GCM est non pertinent à notre échelle :
  500 conseillers × 1 enrôlement initial + 1 reset/an = ~1000
  chiffrements/an. On atteindra 2^32 dans ~4 millions d'années.

### Alternative 2 : AWS KMS

Délègue le chiffrement/déchiffrement au service KMS d'AWS. La clé ne
vit jamais en mémoire process — KMS retourne uniquement le ciphertext.

**Rejeté car** :
- Latence +30 à +50 ms par déchiffrement (appel API KMS). Inacceptable
  pour le SLO p95 < 800 ms cumulé avec Prisma + middleware + validation
  TOTP otplib.
- Coût par opération facturé. À ~5 000 logins/jour, surcoût KMS
  significatif sans gain de sécurité matériel (la KEK Secrets Manager
  est déjà chiffrée au repos par AWS KMS sous le capot).
- Reportable à une feature future si on industrialise une rotation
  d'enveloppe stricte. Le format `version` byte le permet sans
  rétrocompatibilité cassée.

### Alternative 3 : `pgcrypto` Postgres

Chiffrement délégué à la BD via les fonctions `pgp_sym_encrypt` /
`pgp_sym_decrypt` de l'extension pgcrypto.

**Rejeté car** :
- Le secret traverse la frontière app↔DB en clair dans les requêtes
  paramétrées (bind values non chiffrés). Mauvaise défense en profondeur.
- Les logs Postgres en mode verbose pourraient capturer le secret en
  clair.
- Couplage fort avec Postgres — empêche le test unitaire de la logique
  de chiffrement sans BD réelle.
