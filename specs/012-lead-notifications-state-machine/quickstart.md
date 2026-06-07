# Quickstart — 012 notifications conseillers + machine d'état de lead

Scénarios de validation end-to-end (Testcontainers Postgres + Redis). Chaque scénario est rejouable et sert de base aux tests d'intégration.

## Pré-requis

- Stack locale : `pnpm docker:up` (Postgres + Redis), migrations appliquées.
- Un brief voyageur `active` + 3 conseillers `verified` seedés.
- 011 publie sur `matching.events` (ou publication simulée d'un message sur le canal).

## Scénario 1 — Golden path : matching → 3 leads + 3 notifications (US1)

1. Publier `voyageur.brief.matched` (3 entries, conseillers vérifiés).
2. **Attendu** : 3 `leads` créés (`envoye`), UNIQUE (conseiller × matchingResult) respecté ; 3 entrées `lead_notification_outbox` (`pending` → `sent`) ; 3 jobs BullMQ **distincts** (un par conseiller) ; aucun courriel ne contient de PII de contact voyageur.
3. Replay du même événement → **aucun** lead ni courriel supplémentaire (idempotence, SC-001).

## Scénario 2 — Partial / unmatched (US1)

- `partially_matched` (2 entries) → 2 leads + 2 notifications.
- `unmatched` → 0 lead, 0 notification, trace présente.

## Scénario 3 — Conseiller non vérifié au moment de la notification (US1/US3)

1. Un des 3 conseillers devient non vérifié avant consommation.
2. **Attendu** : ce conseiller n'est pas notifié (`skipped_unverified`), exclusion tracée ; les 2 autres sont notifiés.

## Scénario 4 — Cycle de vie nominal du lead (US2)

1. `GET /leads/:id` → état passe `envoye → vu` (auto, FR-019) ; un 2e GET ne crée pas de transition (idempotent).
2. `POST /accept` → `accepte` ; `POST /quote-sent` → `devis_envoye` ; `POST /booking-confirmed` → `reservation_confirmee` (terminal).
3. **Attendu** : `lead_transitions` contient l'historique horodaté append-only ; `leads.current_state` cohérent.

## Scénario 5 — Transition invalide rejetée (US2, SC-003)

1. Lead à `envoye`. `POST /booking-confirmed`.
2. **Attendu** : `422 INVALID_TRANSITION` ; état et historique inchangés.

## Scénario 6 — Concurrence optimiste (US2, FR-020)

1. Lead à `vu`. Deux `POST /accept` quasi simultanés.
2. **Attendu** : un seul réussit (`accepte`), l'autre reçoit `409 LEAD_STATE_CONFLICT` ; une seule transition enregistrée.

## Scénario 7 — Re-matching : supersession (FR-018, SC-008)

1. Lead actif sur MR#1. Admin déclenche un re-matching (011) → MR#2 supersède MR#1, publication d'un nouvel événement `matched`.
2. **Attendu** : les leads non terminaux de MR#1 passent à `perdu` (motif `re-matched`, transition `clore_systeme`) ; nouveaux leads créés pour MR#2 ; un conseiller commun obtient un nouveau lead + une nouvelle notification ; **au plus un lead actif** par (conseiller × brief).

## Scénario 8 — Anonymisation Loi 25 (US3, R6)

1. Leads existants sur un brief. Le voyageur exerce l'effacement → `intake_voyageur_briefs.status = anonymized`.
2. **Attendu** : `leads.brief_id = NULL` (cascade trigger) ; `lead_transitions` **intacte** (audit préservé) ; les vues (`LeadView.brief`) retournent `null`.

## Scénario 9 — Append-only (US3)

1. Tenter `UPDATE`/`DELETE` sur `lead_transitions`.
2. **Attendu** : rejet par le trigger Postgres (`append-only`).

## Scénario 10 — Conseiller révoqué tente une action (US3, FR-008)

1. Conseiller possédant un lead `vu` devient non vérifié. `POST /accept`.
2. **Attendu** : `403 CONSEILLER_NOT_VERIFIED` ; aucune transition.

## Scénario 11 — `all_matches_revoked` (R10)

1. Publier `voyageur.brief.all_matches_revoked` pour un MR.
2. **Attendu** : aucun conseiller notifié ; leads concernés clôturés `perdu` ; pas de nouveau canal d'alerte admin créé par 012.

## Scénario 12 — SES indisponible (mode dégradé, FR-011)

1. SES en échec. Consommer `matched`.
2. **Attendu** : leads créés ; notifications `failed` retentées (backoff) → `sent` au rétablissement ; aucun doublon perçu.

## Scénario 13 — Indépendance des leads frères (US2, FR-016)

1. Un brief avec 3 leads. Le lead du conseiller A est mené jusqu'à `reservation_confirmee`.
2. **Attendu** : les leads des conseillers B et C restent **inchangés** (aucune clôture automatique en `perdu`) ; leur état et leur historique ne sont pas modifiés par l'action de A.

## Performance — Test de charge léger (SC-005 / Principe X)

1. Simuler ~N événements `matched`/min + une série de transitions conseiller.
2. **Attendu** : p95 réception événement → mise en file notification **< 5 s** ; p95 transition synchrone **< 800 ms**.
