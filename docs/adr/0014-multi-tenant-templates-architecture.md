# ADR-0014 — Architecture multi-module des gabarits courriel (`packages/email-templates/`)

**Statut** : Accepté
**Date** : 2026-05-27
**Feature concernée** : 003 (`specs/003-notifications-transactionnelles/`)

## Contexte

Avant la feature 003, les gabarits courriel étaient dispatchés dans les modules
sources (`packages/shared/src/email/templates/conformite/`,
`apps/api/src/modules/identite/...`). Ce dispersement causait :

- Duplication du wrapper HTML (en-tête CASL, adresse postale, lien désinscription).
- Impossibilité de faire tourner `react-email preview` sur l'ensemble du catalogue.
- Risque de divergence de marque entre modules.

La feature 003 introduit un moteur centralisé `NotificationDispatchWorker` qui
doit rendre N gabarits provenant de M modules sources.

## Décision

Consolidation de **tous** les gabarits transactionnels dans
`packages/email-templates/src/<module>/` :

```
packages/email-templates/
  src/
    conformite/          # dossier_soumis, approbation, refus, rappel_expiration, …
    identite/            # invitation_admin, reinitialisation_mdp, …
    notifications/       # (futurs gabarits transversaux)
  index.ts               # catalogue exporté { templateId → ReactEmailComponent }
```

**Règles** :
1. Chaque gabarit est un composant React pur (`react-email`), sans logique métier.
2. Le `templateId` est une chaîne snake_case préfixée par le module :
   `conformite.dossier_soumis`, `identite.invitation_admin`, etc.
3. Le catalogue `index.ts` exporte un `Map<string, ReactEmailComponent>` consommé
   uniquement par `ReactEmailRenderer` dans `apps/api`.
4. Aucun import direct depuis `apps/api/src/modules/**` vers `packages/email-templates`
   — la liaison se fait exclusivement via `buildEmailTemplateCatalogue()` dans
   l'infrastructure notifications.
5. Les modules sources (`conformite`, `identite`) ne gardent plus de gabarits locaux
   (migration T069 déjà effectuée pour `conformite`).

**Namespace** : le préfixe module évite les collisions et rend les métriques OTel
(`template_id` label) lisibles.

## Conséquences

**Positives** :
- Preview `react-email` unifié : `pnpm --filter @cv/email-templates dev`.
- Un seul wrapper CASL (brand info centralisée dans `packages/shared/src/brand/`).
- Catalogue exhaustif interrogeable par les tests d'intégration.
- Ajout d'un nouveau gabarit = PR dans `packages/email-templates` uniquement.

**Négatives** :
- Les modules sources perdent la co-localisation gabarit ↔ use case.
  Atténuation : le `templateId` dans le `NotificationEnvelope` reste le lien sémantique.
- Le package doit être reconstruit (Turborepo) avant `apps/api`. Atténuation :
  Turborepo cache les builds, coût marginal.

**Politique d'évolution** :
- Nouveaux gabarits : créer `packages/email-templates/src/<module>/<nom>.tsx` +
  enregistrer l'ID dans `index.ts`. Pas de PR dans `apps/api`.
- Deprecation d'un gabarit : marquer `@deprecated` dans le composant,
  retirer après confirmation que le `templateId` n'est plus envoyé en production
  (vérifier métriques OTel `notification_email_sent_total{template_id=...}`).
