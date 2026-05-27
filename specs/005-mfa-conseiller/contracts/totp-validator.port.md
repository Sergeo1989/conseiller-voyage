# Contrat : `TotpValidatorPort`

**Module** : `apps/api/src/modules/identite/application/ports/totp-validator.port.ts`
**Implémentation** : `OtplibTotpValidator` (R1)
**Consommateurs** : `VerifyTotpUseCase`, `StepUpUseCase`,
`ChangeDeviceUseCase`, `EnrollTotpUseCase` (vérif du premier code)

---

## Signature

```typescript
export interface TotpValidatorPort {
  /**
   * Vérifie qu'un code TOTP à 6 chiffres correspond au secret donné,
   * dans la fenêtre de tolérance ±1 pas (±30 secondes) — FR-009.
   *
   * @param secret Secret Base32 en clair (déjà déchiffré par le caller).
   * @param code Code à 6 chiffres saisi par l'utilisateur.
   * @returns true si valide, false sinon. Aucun throw — l'invalidité est
   *          un cas normal du flow, pas une exception.
   */
  verify(secret: string, code: string): boolean;

  /**
   * Génère un nouveau secret TOTP de 160 bits, encodé Base32 standard
   * (alphabet RFC 4648 sans padding).
   */
  generateSecret(): string;

  /**
   * Construit l'URL `otpauth://totp/...` standard pour l'enrôlement
   * dans une app TOTP. Utilisée par l'écran d'enrôlement pour générer
   * le QR code (R4).
   *
   * @param accountLabel Étiquette affichée dans l'app TOTP, p. ex.
   *                     "Conseiller Voyage (mon-courriel@exemple.ca)".
   * @param secret Secret Base32 en clair.
   */
  buildKeyUri(accountLabel: string, secret: string): string;
}

export const TOTP_VALIDATOR = Symbol.for('TotpValidator');
```

---

## Garanties

- `verify` est **pur** : pas d'I/O, pas d'effet de bord. Idempotent.
- `verify` est **constant-time** vis-à-vis du code (otplib utilise
  `crypto.timingSafeEqual` en interne) — pas de side-channel timing.
- `generateSecret` utilise une source d'entropie cryptographique
  (`crypto.randomBytes`). Jamais `Math.random`.
- `buildKeyUri` n'inclut JAMAIS le secret en clair en log applicatif —
  l'URL est retournée et passée directement au générateur de QR.

---

## Validation Zod (côté contrôleur)

Avant tout appel à `verify` :

```typescript
const TotpCodeSchema = z.string().regex(/^[0-9]{6}$/, 'Code TOTP invalide');
```

Le code passé au port est donc garanti à 6 chiffres décimaux. Le port
n'a pas à re-valider le format.

---

## Tests TDD (Principe VI)

Tests dans `packages/mfa/src/__tests__/totp.test.ts` (utilitaires purs,
le port NestJS ne fait qu'une fine couche d'injection) :

1. Vérification d'un code généré à `T0` valide à `T0`.
2. Vérification d'un code généré à `T0` valide à `T0 + 30s` (tolérance
   +1 pas).
3. Vérification d'un code généré à `T0` valide à `T0 - 30s` (tolérance
   -1 pas).
4. Vérification d'un code généré à `T0` INVALIDE à `T0 + 90s` (hors
   fenêtre).
5. Vérification d'un code 6 chiffres aléatoire INVALIDE (~99.99 % du
   temps).
6. `generateSecret()` retourne 32 caractères Base32 valides.
7. `generateSecret()` produit des secrets différents à chaque appel
   (test d'entropie minimum sur N=1000).
8. `buildKeyUri()` produit `otpauth://totp/<issuer>:<label>?secret=...&issuer=...&algorithm=SHA1&digits=6&period=30`.
9. Vecteurs RFC 6238 (table de référence avec secret connu et timestamps
   précis).
