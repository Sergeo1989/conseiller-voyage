# Contrat : `TotpSecretEncrypterPort`

**Module** : `apps/api/src/modules/identite/application/ports/totp-secret-encrypter.port.ts`
**Implémentation** : `NodeCryptoTotpSecretEncrypter` (R2)
**Consommateurs** : `EnrollTotpUseCase`, `VerifyTotpUseCase`,
`StepUpUseCase`, `ChangeDeviceUseCase`

---

## Signature

```typescript
import type { Brand } from '@cv/shared';

/** Texte chiffré sérialisé : version || iv || ciphertext || tag, Base64. */
export type EncryptedTotpSecret = Brand<string, 'EncryptedTotpSecret'>;

export interface TotpSecretEncrypterPort {
  /**
   * Chiffre un secret TOTP Base32 clair en AES-256-GCM avec la KEK
   * applicative. Génère un IV aléatoire à chaque appel — JAMAIS
   * réutilisé.
   *
   * @param plaintextSecret Secret TOTP Base32 en clair.
   * @returns Représentation sérialisée prête pour BD (Base64).
   */
  encrypt(plaintextSecret: string): EncryptedTotpSecret;

  /**
   * Déchiffre une chaîne précédemment produite par `encrypt`. Vérifie
   * l'auth tag GCM ; si altération détectée → throw
   * `TotpSecretIntegrityError`.
   *
   * @throws TotpSecretIntegrityError si auth tag invalide.
   * @throws TotpSecretFormatError si format sérialisé invalide.
   */
  decrypt(encrypted: EncryptedTotpSecret): string;
}

export const TOTP_SECRET_ENCRYPTER = Symbol.for('TotpSecretEncrypter');
```

---

## Format sérialisé

```text
┌───────────┬────────────────┬─────────────────────────┬──────────────────┐
│ version   │ iv (12 bytes)  │ ciphertext (variable)   │ auth tag (16 B)  │
│ 1 byte    │                │                          │                  │
└───────────┴────────────────┴─────────────────────────┴──────────────────┘
            │                                                              │
            └── tout encodé en Base64 standard (sans saut de ligne) ──────┘
```

- `version` : `0x01` pour le format initial. Permet la rotation de KEK
  futures avec versionning explicite.
- `iv` : `crypto.randomBytes(12)`, nonce 96 bits recommandé pour GCM.
- `ciphertext` : secret Base32 (32 caractères = 32 octets ASCII) chiffré.
- `auth tag` : GMAC 128 bits.

Taille typique sérialisée : ~96 octets en Base64.

---

## Sécurité

- **KEK (Key Encryption Key)** : 32 octets (256 bits) résolue au
  démarrage du process :
  - prod : `AWS Secrets Manager` ARN `arn:aws:secretsmanager:ca-central-1:<account>:secret:cv-mfa-kek`
  - dev : variable d'environnement `MFA_KEK_BASE64` chargée depuis
    `.env.development` via 1Password CLI
- La KEK n'est **jamais** loggue. Le port refuse de démarrer si la
  variable est manquante ou ne fait pas 32 octets.
- En cas d'auth tag invalide (corruption, altération malveillante), le
  port throw immédiatement — le use case doit traduire en
  `UnauthorizedException` côté contrôleur **sans révéler la cause** à
  l'utilisateur (juste « Authentification MFA indisponible, contactez le
  support »).

---

## Rotation de KEK

Hors-scope MVP. Documenté dans ADR-0010 comme amélioration future :
- Ajouter une version `0x02` au format.
- Job de migration qui lit chaque ligne, déchiffre avec ancienne KEK,
  rechiffre avec nouvelle KEK, met à jour la ligne.
- Pas d'interruption de service nécessaire.

---

## Tests TDD (Principe VI)

Tests dans `packages/mfa/src/__tests__/encryption.test.ts` (logique pure
côté package, NodeCryptoTotpSecretEncrypter ne fait qu'instancier la KEK
en NestJS) :

1. **Round-trip simple** : `decrypt(encrypt(x))` === `x` pour x de
   longueurs variées (16, 32, 64 chars).
2. **IV unique** : deux appels successifs à `encrypt(même x)` produisent
   deux ciphertexts différents.
3. **Auth tag obligatoire** : modifier 1 byte du ciphertext sérialisé
   → `decrypt` throw `TotpSecretIntegrityError`.
4. **Version byte** : un blob avec `version = 0x99` (non supporté) →
   `decrypt` throw `TotpSecretFormatError`.
5. **Format invalide** : Base64 mal formé → throw `TotpSecretFormatError`.
6. **Vecteur de test connu** : avec KEK fixe et IV fixe (mode test),
   `encrypt("JBSWY3DPEHPK3PXP")` doit produire un blob byte-stable
   reproductible.
7. **KEK manquante** : instancier le port sans `MFA_KEK_BASE64` →
   `throw KekNotConfiguredError`.
8. **KEK de mauvaise taille** : KEK de 16 octets au lieu de 32 → throw
   `KekInvalidSizeError`.
