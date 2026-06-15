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

## Statut de validation (T020) — 2026-06-08

Couche de présentation au-dessus des ports/endpoints 012/013 (aucune logique métier nouvelle).

| SC | Critère | Couverture |
|---|---|---|
| SC-001 | Cloisonnement (mes leads/fils uniquement) | garanti par les ports 012/013 (filtre `conseillerId` résolu serveur) ; endpoints sous `RoleGuard('conseiller')` |
| SC-002 | 0 PII contact + 0 champ transactionnel | **invariant T018** (types de vue) + résumé non nominatif (012) + invariant T038 (013) |
| SC-003 | Accepter + ouvrir la conversation en < 3 actions | détail lead → Accepter → lien « Ouvrir la conversation » |
| SC-004 | Conflit/idempotence sur transition | Idempotency-Key auto + mapping `409/422` → message + `router.refresh()` (logique dans 012) |
| SC-005 | a11y WCAG 2.1 AA, clavier | markup sémantique (`ul/ol`, `time`, `role=alert/note`, labels) + `dashboard.spec.ts` (axe, skip-guardé) |
| SC-006 | Lecture seule si lead terminal-négatif | `writable` dérivé (port 013) → composeur masqué |
| SC-007 | Mention de neutralité permanente | `AntiTransactionNotice` (013) dans chaque fil |
| SC-008 | Rendu utile < 2 s | RSC (lecture serveur, HTML initial) ; pas de JS superflu |

**Portes vertes** : `tsc` @cv/api + @cv/web · Biome · feature-boundaries 0 violation · invariant
dashboard 2/2.

**Différé au staging** (convention 011/012, infra réelle) : exécution des stubs d'intégration
(endpoint liste fils), tests a11y axe sur dev server avec session, test de charge SLO p95, et
le **widget d'upload/téléchargement de pièce jointe** dans le fil (endpoints + Server Actions
prêts ; pièces jointes actuellement affichées par nom + disponibilité).

**DoD** : tsc + lint + boundaries ✅ · invariant anti-transaction/anti-PII ✅ · cloisonnement
(ports) ✅ · neutralité ✅ · i18n FR-CA/EN ✅ · pages `noindex` (layout) ✅ · a11y markup ✅
(axe automatisé activable avec session) ⏳ · charge SLO **staging** ⏳.
