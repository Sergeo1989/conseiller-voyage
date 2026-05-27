# Identité de l'éditeur — feature 004 T088

**Statut** : `Placeholder — à compléter par le porteur du projet avant déploiement public.`

Ce document collecte les valeurs exactes à intégrer dans
`packages/legal-content/fr-CA/mentions-legales.mdx` (US5 T089) lors d'un bump
de version. **Le placeholder en T088 ne bloque pas le merge** — il bloque
uniquement la mise en ligne publique de la page mentions légales.

---

## Valeurs à fournir

| Champ | Source autorisée | Format | Valeur |
|---|---|---|---|
| Raison sociale | Registraire des entreprises du Québec (REQ) | Personne morale enregistrée | *[à compléter]* |
| NEQ | REQ | 10 chiffres | *[à compléter]* |
| Adresse du siège social | REQ | Adresse postale Québec complète | *[à compléter]* |
| Courriel du responsable de la protection des renseignements personnels | Choix interne | `protection-rp@<domain>.ca` | *[à compléter]* |
| Hébergeur | Contrat AWS | AWS Canada (Central) — ca-central-1 | AWS Inc. |
| Juridiction applicable | Choix éditorial | District judiciaire de Montréal, Québec, Canada | confirmé |

---

## Procédure de mise à jour (workflow T101)

1. Le porteur remplit ce document avec les valeurs exactes (commit privé
   ou PR avec review juriste, selon politique de l'organisation).
2. Un développeur réplique les valeurs dans
   `packages/legal-content/fr-CA/mentions-legales.mdx` en bumpant le
   frontmatter `version` (1 → 2).
3. `pnpm legal:verify` valide le MDX et calcule le checksum.
4. PR review par un juriste (ou signoff explicite du porteur si template
   adapté de mentions standard).
5. Au merge sur `main`, le script `seed-legal-documents.ts` insère la
   nouvelle version dans `auth_legal_documents` au prochain déploiement.

---

## Pourquoi ce fichier existe

- La feature 004 livre la **plomberie** (schéma DB, triggers immutables,
  use cases, controllers, page de ré-acceptation) **avant** de fournir
  les valeurs juridiques exactes.
- L'écart entre les deux est documenté ici plutôt que dans le code, pour
  préserver l'indépendance entre le travail de développement et la
  collecte d'information juridique.
- Une fois ce fichier rempli, l'étape de bump est purement éditoriale
  (T089) — aucun changement de code.

---

## Références

- [Spec 004](../../specs/004-mentions-legales/spec.md) — US5
- [`mentions-legales.mdx`](../../packages/legal-content/fr-CA/mentions-legales.mdx)
- [Runbook bump de version](../runbooks/legal-version-bump.md) — *(à venir T101)*
