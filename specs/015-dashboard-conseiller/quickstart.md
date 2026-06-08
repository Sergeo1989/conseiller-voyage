# Quickstart — Tableau de bord conseiller (014)

## Prérequis
- Stack dev : `docker compose -f docker-compose.dev.yml up -d` (Postgres + Redis + LocalStack).
- API : `pnpm --filter @cv/api start:dev` · Front : `pnpm --filter @cv/web dev` (Turbopack).
- Un conseiller **vérifié** connecté avec au moins 1 lead (matching 011/012) ; pour US3, un
  lead **accepté** (fil ouvert via 013).

## Parcours

### US1 — Mes leads
1. Aller sur `/(conseiller)/leads` → la liste affiche **mes** leads (statut + résumé non
   nominatif : destinations / période / type). Aucune coordonnée de contact, aucun montant.
2. Ouvrir un lead → détail + **historique horodaté** des transitions.
3. Vérifier le cloisonnement : l'URL d'un lead d'un autre conseiller → refus.

### US2 — Piloter un lead
4. Sur un lead `vu`, **Accepter** → statut `accepté`, historique mis à jour, conversation
   disponible. Seules les actions valides du nouvel état restent proposées.
5. Re-soumettre la même action (double-clic) → **aucun double effet** (idempotence).
6. Agir sur un lead dont l'état a changé entre-temps → **conflit** signalé, invitation à
   rafraîchir, aucun effet partiel.

### US3 — Mes conversations
7. `/(conseiller)/conversations` → liste de mes fils (dernier message, actif / lecture seule).
8. Ouvrir un fil → messages ordonnés + **mention de neutralité** permanente ; envoyer un
   message ; joindre puis télécharger un fichier via lien à durée limitée. **Aucun montant.**
9. Fil d'un lead `refusé`/`perdu` → **lecture seule** (envoi désactivé, consultation OK).

## Tests
```bash
# Server Actions / mapping de vues (MSW) + invariant anti-transaction
pnpm --filter @cv/web test -- dashboard
pnpm --filter @cv/api test -- conversation   # endpoint liste (stub intégration)

# a11y axe-core (route conversation montée → conversation.spec.ts activé)
pnpm --filter @cv/web test:a11y -- --grep @a11y
```

## DoD avant PR
- Vitest (actions/mapping) + Playwright axe-core verts ; lint Biome ; tsc (api + web).
- **0 PII de contact** + **0 champ transactionnel** dans les écrans (invariant + revue).
- Cloisonnement vérifié (SC-001) ; conflit/idempotence (SC-004) ; lecture seule (SC-006).
- Mention de neutralité présente (SC-007) ; i18n FR-CA + EN ; pages `noindex`.
- Budgets CWV respectés (rendu utile < 2 s, SC-008).

## Statut de validation
Mappé après implémentation (SC-001→SC-008 → tests). Exécution réelle des stubs d'intégration
+ charge différée au **staging** (convention 011/012).
