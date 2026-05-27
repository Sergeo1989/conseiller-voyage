# Runbook — Modération profil conseiller (admin)

**Feature** : 007 (US6 — FR-023, FR-024)
**Audience** : administrateurs Conseiller Voyage avec rôle `admin`.

## Quand intervenir

- Photo offensante, non conforme, ou propos inappropriés signalés.
- Conseiller dont la conformité a été révoquée (cascade depuis le
  module 001).
- Demande interne (légal, conformité) de masquer temporairement un
  profil.

## Actions disponibles

### 1. Retirer la photo

**Effet** : la photo S3 courante + historique FIFO sont supprimés
irréversiblement. Le profil bascule en statut `incomplet` (la photo est
un champ obligatoire). Page publique → 404 ≤ 10 s.

**Procédure** :

1. Console admin → onglet « Profils ».
2. Ouvrir le détail du profil litigieux.
3. Cliquer « Retirer la photo ».
4. Saisir la raison (obligatoire, min 10 caractères) — sera journalisée
   dans `profile_moderation_audits` et incluse dans le courriel envoyé
   au conseiller.
5. Re-vérification MFA fraîche (StepUpGuard — < 30 min).
6. Confirmer.

**Courriel envoyé** : le conseiller reçoit `emails.profil.masqueAdmin`
avec la raison.

### 2. Masquer le profil temporairement

**Effet** : statut profil → `masque_admin`, raison persistée dans
`raisonMasquageAdmin`. Page publique → 404. Exclu du matching. Le
conseiller conserve l'accès à son dashboard.

**Procédure** : identique au retrait photo, action « Masquer
temporairement ».

### 3. Rétablir un profil masqué

**Effet** : statut recalculé (`incomplet` ou `pret` selon complétude +
conformité). Pas de courriel automatique (le conseiller voit le
changement dans son dashboard).

**Pas de StepUpGuard** : action constructive, autorisée sans
re-vérification MFA.

## Garde-fous techniques

- **Audit immutable** : chaque action est INSÉRÉE dans
  `profile_moderation_audits` (append-only via trigger Postgres). Aucun
  UPDATE ou DELETE possible — pour audit Loi 25 / OPC 7 ans.
- **Hash admin** : l'email de l'admin est stocké SHA-256 (pas en clair)
  — résout la contradiction Principe IX × Loi 25 (cf. ADR-0012).
- **StepUpGuard** sur les actions destructrices (retirer photo, masquer)
  — re-vérification MFA fraîche < 30 min.

## Escalation

- **Modération massive** (> 5 profils/jour) : déclencher l'évaluation
  d'un outil dédié (feature 020 ou 025 — non MVP).
- **Profil anonymisé Loi 25** : ne tentez pas de modérer manuellement.
  L'effacement est terminal. Le slug est réservé à vie (cf. ADR-0015).
- **Conseiller qui conteste la décision** : la raison fournie dans
  l'audit + courriel doit suffire à expliquer la mesure. En cas de
  recours, exporter l'historique via la console admin.

## Limites connues

- **Pas de modération en masse** (1 action = 1 profil au MVP).
- **Pas de workflow d'approbation à plusieurs admins** (1 admin =
  1 action immédiate, audit a posteriori).
- Le rétablissement automatique post-masquage temporaire n'est PAS
  programmé — il faut l'action manuelle d'un admin.
