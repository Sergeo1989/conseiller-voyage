# Runbook — Bump d'une version de document légal

**Source** : feature 004 T101 + ADR-0008.
**Public** : développeur + juriste.

---

## Vue d'ensemble

Le bump d'une version (CGU B2B, CGU B2C, confidentialité, etc.) est un
événement éditorial qui :

1. Crée une nouvelle row dans `auth_legal_documents` au prochain
   déploiement (idempotent via `seed-legal-documents.ts`).
2. Force les utilisateurs à ré-accepter au prochain accès aux pages
   `/(conseiller)/**` (cgu_b2b) ou au prochain submit de brief
   (cgu_b2c / confidentialite).
3. Préserve l'historique des acceptances précédentes (rows immutables).

---

## Décision préalable : bump nécessaire ou non ?

Le juriste relit la modification du MDX et tag explicitement :

- **`[BUMP]`** — changement substantiel des obligations / droits.
  Requiert nouvelle acceptation utilisateur.
- **`[NO-BUMP]`** — correction orthographique, lien web déplacé, etc.
  Pas de nouvelle acceptation requise.

Sans tag explicite, le PR est **rejeté à la revue**.

---

## Procédure

### 1. Éditer le MDX

```bash
# Exemple pour cgu_b2b version 1 → 2
vi packages/legal-content/fr-CA/cgu-conseiller.mdx
```

Dans le frontmatter, bumper `version: 1` → `version: 2` et ajouter une
section `changelog:` qui sera affichée sur la page de ré-acceptation :

```yaml
---
type: cgu_b2b
version: 2
slug: cgu-conseiller
title: Conditions générales d'utilisation — conseiller
publishedAt: 2026-08-01T00:00:00Z
effectiveAt: 2026-08-15T00:00:00Z  # ≥ publishedAt
locale: fr-CA
changelog: |
  - Ajout d'une obligation de divulgation des sources de commission.
  - Précision sur le mode de résiliation de l'abonnement.
---
```

### 2. Vérifier le MDX

```bash
pnpm legal:verify
```

Cette commande :
- valide la syntaxe MDX
- calcule le checksum SHA-256 du contenu rendu (hors frontmatter)
- vérifie que `effectiveAt >= publishedAt`
- échoue si le frontmatter ne correspond pas au schéma Zod

### 3. PR avec review juriste

- PR title : `feat(legal): bump cgu_b2b v1 → v2 — [BUMP] divulgation commissions`
- Reviewer obligatoire : juriste (ou signoff explicite du porteur projet
  si modèle adapté).
- CI vérifie automatiquement `pnpm legal:verify` + lint biome.

### 4. Merge sur `main`

Le déploiement post-merge déclenche `tools/seed-legal-documents.ts`
qui :

- INSERT idempotent (no-op si la row existe déjà avec checksum identique).
- ÉCHEC si une row existe avec **checksum différent** pour le même
  `(type, version)` — c'est un cas anormal qui signale une dérive
  entre le repo et la DB.

### 5. Effets en production

- Au prochain accès `/(conseiller)/**`, le middleware
  (`apps/web/src/middleware.ts`) détecte que la version courante est 2
  mais que l'utilisateur a accepté 1 → redirect vers
  `/cgu-conseiller/re-accepter`.
- L'utilisateur lit le changelog + accepte la nouvelle version.
- Une nouvelle row `LegalAcceptance(version=2)` est créée. L'ancienne
  (version=1) reste intacte (audit légal).

---

## Workflow rapide (commande unique)

```bash
# 1. Édite le MDX et commit
git checkout -b feat/legal-bump-cgu-b2b-v2
vi packages/legal-content/fr-CA/cgu-conseiller.mdx
pnpm legal:verify
git add packages/legal-content/fr-CA/cgu-conseiller.mdx
git commit -m "feat(legal): bump cgu_b2b v1 → v2 — [BUMP] divulgation commissions"

# 2. PR avec template
gh pr create --title "feat(legal): bump cgu_b2b v1 → v2 [BUMP]" --body-file <(cat <<'EOF'
## Tag de bump
[BUMP] — changement substantiel requérant ré-acceptation.

## Changelog
- Ajout obligation divulgation des sources de commission.
- Précision sur le mode de résiliation.

## Test plan
- [ ] `pnpm legal:verify` vert
- [ ] Review juriste signée
- [ ] Staging : seed déployé + ré-acceptation testée
EOF
)
```

---

## Cas spéciaux

### Bump avec date d'effet future

Si `effectiveAt > publishedAt` (ex. annoncer un changement 30 jours à
l'avance) :

- La row est créée en BD dès le déploiement.
- Le middleware ne déclenche **pas** de re-acceptation tant que
  `now() < effectiveAt`.
- À partir de `effectiveAt`, le middleware traite la version comme
  courante et redirige les utilisateurs non à jour.

### Rollback

Une version publiée ne peut pas être supprimée (trigger DB). Pour
défaire :

- **Si pas encore effective** : pousser une nouvelle row avec
  `effectiveAt` repoussé à très loin (équivaut à désactiver). Documenter
  dans un incident.
- **Si déjà effective** : impossible techniquement. Bumper en v3 avec
  contenu identique à v1 + annotation `changelog: "Annulation du bump v2"`.
