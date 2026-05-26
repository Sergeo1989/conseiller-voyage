# Contrat : `BackupCodeHasherPort`

**Module** : `apps/api/src/modules/identite/application/ports/backup-code-hasher.port.ts`
**Implémentation** : `BcryptBackupCodeHasher` (R5)
**Consommateurs** : `EnrollTotpUseCase`, `RegenerateBackupCodesUseCase`,
`VerifyBackupCodeUseCase`, `ChangeDeviceUseCase`

---

## Signature

```typescript
import type { Brand } from '@cv/shared';

/** Hash bcrypt sérialisé (60 caractères). */
export type BackupCodeHash = Brand<string, 'BackupCodeHash'>;

export interface BackupCodeHasherPort {
  /**
   * Hash bcrypt cost = 12 d'un code de récupération normalisé
   * (majuscules, tirets inclus). Le clair n'est jamais persisté ni
   * loggue.
   *
   * @param plaintextCode Code clair au format XXXX-XXXX-XX
   *                      (12 caractères avec tirets).
   */
  hash(plaintextCode: string): Promise<BackupCodeHash>;

  /**
   * Comparaison constant-time entre un code clair saisi par
   * l'utilisateur et un hash bcrypt stocké.
   *
   * @returns true si match, false sinon.
   */
  verify(plaintextCode: string, hash: BackupCodeHash): Promise<boolean>;
}

export const BACKUP_CODE_HASHER = Symbol.for('BackupCodeHasher');
```

---

## Format des codes clairs

- **Alphabet** : `A-Z` sans `O`, `I`, `L` + `2-9` (sans `0`, `1`) →
  32 symboles, exclut les confusions visuelles 0/O, 1/I/L.
- **Format** : `XXXX-XXXX-XX` (10 caractères significatifs, 12 avec
  tirets).
- **Entropie** : log2(32^10) ≈ 50 bits — suffisant pour résister à un
  brute force ciblé sachant que :
  - les 10 codes par user sont uniques
  - bcrypt cost 12 = ~250 ms par tentative
  - rate limit applicatif limite à 5 tentatives / 5 min (FR-013)
- Casse forcée en MAJUSCULES côté client ET côté serveur avant
  hashing/comparaison. Les tirets sont **préservés** pour le hashing
  (cohérence d'affichage).

---

## Tests TDD (Principe VI)

Tests dans `packages/mfa/src/__tests__/backup-codes.test.ts` :

1. **Round-trip** : `verify(code, hash(code))` === `true`.
2. **Code différent** : `verify(otherCode, hash(code))` === `false`.
3. **Casse** : `verify('abcd-efgh-ij', hash('ABCD-EFGH-IJ'))` === `true`
   (normalisation idempotente).
4. **Tirets** : `verify('ABCDEFGHIJ', hash('ABCD-EFGH-IJ'))` === `false`
   (les tirets sont significatifs dans le hash — empêche la confusion
   avec un format différent).
5. **Cost factor** : un hash produit par `hash()` a un préfixe
   `$2[ay]$12$...` (bcrypt cost ≥ 12).
6. **Longueur** : un hash a exactement 60 caractères.
7. **Génération** : 10 codes générés en lot sont tous distincts (test
   sur N=1000 lots, aucune collision attendue).
8. **Alphabet** : tout code généré respecte le regex
   `^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{2}$`.
