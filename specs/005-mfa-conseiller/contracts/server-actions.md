# Contrat : Server Actions Next.js (`apps/web`)

Toutes les actions Next.js App Router exposées au client sont définies
ici. Toutes valident leurs entrées par Zod (`packages/mfa/src/schemas.ts`),
appellent l'API NestJS via `fetch` interne, et propagent la session via
cookie automatique.

Fichier : `apps/web/src/lib/mfa/server-actions.ts`.

---

## `startEnrollmentAction()`

Server Action appelée par le Server Component `/mfa/enroll` au mount.
Pré-génère un `enrollmentRequestId` côté serveur (UUID v4) pour
idempotence et retourne le QR + secret + backup codes pour rendu.

```typescript
'use server';

export async function startEnrollmentAction(): Promise<
  | { kind: 'ok'; qrCodeSvg: string; secretBase32: string; backupCodes: string[]; enrollmentRequestId: string }
  | { kind: 'already_enrolled' }
  | { kind: 'error'; message: string }
>;
```

- **Garde** : `AuthGuard` (Server Component lit la session via Auth.js
  `auth()`)
- Appelle `POST /api/mfa/enroll/start` avec un `enrollmentRequestId` UUID.
- `already_enrolled` → redirect côté caller vers `/parametres/mfa`.

---

## `confirmEnrollmentAction(formData)`

Soumise par le formulaire de confirmation TOTP (champ 6 chiffres +
checkbox FR-006).

```typescript
'use server';

const ConfirmInput = z.object({
  enrollmentRequestId: UuidV4Schema,
  totpCode: TotpCodeSchema,
  backupCodesAcknowledged: z.literal(true),
});

export async function confirmEnrollmentAction(formData: FormData): Promise<
  | { kind: 'ok' }
  | { kind: 'invalid_totp' }
  | { kind: 'error'; message: string }
>;
```

- **Côté succès** : `redirect('/')` (tableau de bord conseiller).
- **Côté échec** : retourne `kind: 'invalid_totp'`, le client réaffiche
  le formulaire avec un message d'erreur localisé FR-CA.

---

## `verifyTotpAction(formData)`

Server Action soumise par `/mfa/verify` (post-login).

```typescript
'use server';

const VerifyInput = z.object({ totpCode: TotpCodeSchema });

export async function verifyTotpAction(formData: FormData): Promise<
  | { kind: 'ok' }
  | { kind: 'invalid' }
  | { kind: 'locked'; unlockAt: string }
>;
```

- **Côté succès** : `redirect(searchParams.get('return') ?? '/')`.
- **Côté locked** : rendre un message « Votre compte est temporairement
  verrouillé jusqu'à <heure> » avec heure formatée `date-fns` `fr-CA`.

---

## `verifyBackupCodeAction(formData)`

Server Action soumise par `/mfa/recovery`.

```typescript
'use server';

const RecoveryInput = z.object({ backupCode: BackupCodeSchema });

export async function verifyBackupCodeAction(formData: FormData): Promise<
  | { kind: 'ok'; remainingCount: number; warnLowCodes: boolean }
  | { kind: 'invalid' }
  | { kind: 'locked'; unlockAt: string }
>;
```

- **Côté succès** : si `warnLowCodes`, afficher un toast persistant
  « Il vous reste {n} codes, pensez à régénérer ».

---

## `stepUpAction(formData)`

Server Action appelée par le `<StepUpModal>` côté Client (intercepte
clic sur action sensible).

```typescript
'use server';

const StepUpInput = z.object({
  totpCode: TotpCodeSchema,
  intendedAction: IntendedActionSchema,
});

export async function stepUpAction(formData: FormData): Promise<
  | { kind: 'ok' }
  | { kind: 'invalid'; attemptsRemaining: number }
  | { kind: 'session_killed' }
>;
```

- **Côté succès** : le caller (Client Component qui a ouvert le modal)
  continue l'action originelle.
- **Côté `session_killed`** : `redirect('/login?reason=stepup_failed')`
  côté caller.

---

## `getMfaSummaryAction()` et `getMfaDetailsAction()`

Le Server Component `/parametres/mfa/page.tsx` appelle d'abord
`getMfaSummaryAction()` (pas de step-up requis) pour décider si on
montre l'invite « Confirmer votre identité pour gérer votre MFA ».
Après step-up réussi, il appelle `getMfaDetailsAction()` pour les
infos sensibles.

```typescript
'use server';

export async function getMfaSummaryAction(): Promise<{
  enabled: boolean;
  enrolledAt: string | null;
}>;

export async function getMfaDetailsAction(): Promise<
  | { kind: 'ok'; details: {
      enabled: boolean;
      enrolledAt: string | null;
      lastUsedAt: string | null;
      backupCodesRemaining: number;
      warnLowCodes: boolean;
      batchId: string | null;
    } }
  | { kind: 'stepup_required' }
>;
```

Aligné avec le split P1-4 dans `http-endpoints.md`.

---

## `regenerateBackupCodesAction()`

Server Action protégée par step-up préalable (FR-017). Appelée depuis
`/parametres/mfa/regenerate-codes` après que l'utilisateur ait été
re-authentifié par le modal step-up.

```typescript
'use server';

export async function regenerateBackupCodesAction(): Promise<
  | { kind: 'ok'; backupCodes: string[] }
  | { kind: 'stepup_required' }
  | { kind: 'error'; message: string }
>;
```

---

## `startDeviceChangeAction(formData)`

US6 — démarre un changement de device.

```typescript
'use server';

const DeviceChangeInput = z.object({
  password: z.string().min(8),
  secondFactor: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('totp'), code: TotpCodeSchema }),
    z.object({ kind: z.literal('backup_code'), code: BackupCodeSchema }),
  ]),
});

export async function startDeviceChangeAction(formData: FormData): Promise<
  | { kind: 'ok'; qrCodeSvg: string; secretBase32: string; backupCodes: string[]; enrollmentRequestId: string }
  | { kind: 'invalid_credentials' }
  | { kind: 'invalid_second_factor' }
>;
```

Le flow d'activation utilise ensuite `confirmEnrollmentAction()` —
même contrôle qualité que l'enrôlement initial.

---

## `resetUserMfaAdminAction(formData)`

US4 — action admin. Protégée par `RoleGuard('admin')` + `StepUpGuard`
côté API.

```typescript
'use server';

const ResetInput = z.object({
  targetUserId: UuidV4Schema,
  justification: JustificationSchema,
});

export async function resetUserMfaAdminAction(formData: FormData): Promise<
  | { kind: 'ok' }
  | { kind: 'self_reset_forbidden' }
  | { kind: 'target_not_found' }
  | { kind: 'target_not_enrolled' }
  | { kind: 'stepup_required' }
>;
```

- Génère un `Idempotency-Key` UUID v4 côté serveur Action et le passe
  à l'API.
- Côté succès : `revalidatePath(\`/admin/users/${targetUserId}\`)` pour
  rafraîchir la fiche.

---

## Garanties de sécurité côté Server Actions

- Toutes les actions exigent une session valide (vérifiée via
  `auth()` au démarrage, sinon `redirect('/login')`).
- Toutes les entrées passent par un schéma Zod **avant** tout fetch
  réseau.
- Aucune action ne renvoie de payload sensible dans son `Promise`
  publique sans l'avoir d'abord récupéré côté API protégée — la Server
  Action est une mince façade.
- Les secrets TOTP ne traversent jamais les Server Actions — seules les
  réponses utilisateur (QR rendu, codes de récupération en clair pour
  affichage one-shot, codes saisis utilisateur) transitent.
- Toutes les Server Actions sont marquées `'use server'` en haut de
  fichier.
