# Runbook — Anonymisation Loi 25 voyageur

**Feature** : 002-voyageur-intake (intake / préqualification voyageur)
**Cf.** [ADR-0008](../adr/0008-anonymisation-loi25-hash-sale-immutable.md), [FR-022 + FR-022a](../../specs/002-voyageur-intake/spec.md), [SC-008](../../specs/002-voyageur-intake/spec.md)
**Tâche** : T139

## Pourquoi

Conformément à la **Loi 25 (Québec)**, un voyageur peut à tout moment
demander l'effacement de ses données personnelles. Le système doit
traiter la demande en moins de 60 secondes confirmation→nullification
(invariant SC-008) et conserver une trace anonymisée pour audit
réglementaire (rétention 7 ans).

Ce runbook documente les **3 chemins d'effacement** et la procédure de
réponse aux demandes hors-bande (courriel, courrier, support).

## Les 3 chemins d'effacement

### 1. Self-service brief seul (FR-022)

**Flux** :
1. Voyageur visite `/voyage/[briefId]` (session cookie active).
2. Clique « Supprimer mes données » → `/voyage/[briefId]/effacement`.
3. Tape la phrase exacte
   `JE_CONFIRME_LA_SUPPRESSION_IRREVERSIBLE`.
4. POST `/api/intake/briefs/:briefId/erasure-request` →
   `RequestBriefErasureUseCase` (synchrone) :
   - `brief.status = 'anonymized'` + `anonymizedAt = now`
   - Audit `intake.brief.erasure_requested`
   - Outbox `voyageur.brief.deleted` (consommé par feature matching 011
     + SEO 016 + Sentry monitoring)
5. Voyageur redirigé vers `/voyage/supprime` (page neutre, **sans PII**).

**Latence** : ~milliseconds (use case synchrone, pas de BullMQ pour ce
chemin MVP). SC-008 < 60s garanti par construction.

**Effet sur le contact** : **aucun**. Le contact et les autres briefs
persistent. Le voyageur peut continuer à soumettre d'autres briefs
avec le même email.

### 2. Self-service global FR-022a (effacer-tout)

**Flux** :
1. Voyageur visite `/voyage/mes-briefs` puis `/voyage/mes-donnees/effacer-tout`.
2. La page Server Component fetch `GET /api/intake/briefs/by-email` pour
   afficher le **nombre de briefs actifs** à supprimer.
3. Tape la phrase distincte
   `JE_CONFIRME_LA_SUPPRESSION_DE_TOUTES_MES_DONNEES`.
4. POST `/api/intake/voyageur/erase-all-data` (avec
   `acknowledgedBriefCount` pour anti-stale) → `EraseAllVoyageurDataUseCase` :
   - Cascade : tous briefs `→ anonymized` + outbox `voyageur.brief.deleted` × N
   - `applyAnonymisation` sur contact : email/firstName/lastName/phone/postalCode
     → NULL, `emailHashAfterErasure = SHA-256(email.lowercase())`
   - Audit `intake.contact.erase_all_requested`
   - `clearCookie` immédiat (révocation session voyageur)
5. Voyageur redirigé vers `/voyage/mes-donnees/effacee`.

**Effet** : contact + tous briefs anonymisés. Le voyageur peut
re-soumettre avec le même email (un nouveau contact sera créé), mais
l'historique reste anonymisé.

### 3. Demande hors-bande (courriel, courrier)

**Flux** :
1. Réception via support@conseiller-voyage.ca (ou équivalent).
2. **Vérification d'identité** : demander preuve raisonnable (réponse
   depuis l'adresse email enregistrée, ou copie ID si écart de canal).
3. Opérateur authentifié exécute le CLI dédié :
   ```bash
   pnpm --filter @cv/api exec tsx src/cli/intake-manual-erasure.ts \
     --email=<email_voyageur> \
     --reason="Demande Loi 25 ticket #12345"
   ```
   Note : ce CLI **n'existe pas encore** (Phase 8 backlog) — pour
   l'instant, opérer manuellement via Adminer + audit log entry SQL.
4. Confirmer au voyageur par courriel sous 30 jours (Loi 25 exige
   réponse documentée).

## Trigger SQL T015 — défense en profondeur

Le trigger `intake_voyageur_contact_anonymisation_idempotent` (migration
`20260528170003_intake_anonymisation_trigger`) garantit l'**irréversibilité**
côté DB :

- Une fois `anonymizedAt IS NOT NULL`, **toute** tentative de mettre
  `email/firstName/lastName/phone/postalCode` à une valeur non-NULL
  est rejetée avec exception `intake_voyageur_contact_anonymisation_idempotent`.
- Le même trigger sur `intake_voyageur_briefs` rejette les transitions
  hors de `anonymized` (statut terminal).

**Conséquence opérationnelle** : un bug applicatif qui tenterait de
restaurer des PII serait bloqué par la DB. Si une telle exception
remonte en production → incident sécurité, investiguer immédiatement.

## SLO / KPIs à surveiller

| Métrique | Cible | Source |
|---|---|---|
| Latence p99 demande→anonymisation | < 60s (SC-008) | OpenTelemetry `intake_brief_erasure_completed_seconds` |
| Taux de succès demandes hors-bande | 100% sous 30 jours | Ticket tracker support |
| Trigger exceptions / mois | 0 | Sentry alerts `intake_voyageur_contact_anonymisation_idempotent` |
| Audit `intake.brief.erasure_requested` créés vs effacements complétés | 1:1 | SQL count |

## Réponse à un incident

Si un voyageur signale que ses données n'ont **PAS** été effacées :

1. Vérifier l'audit : `SELECT * FROM intake_audit_entries WHERE
   eventType = 'intake.brief.erasure_requested' AND voyageurContactId
   = '<id>'`.
2. Vérifier l'état brief : `SELECT status, anonymizedAt FROM
   intake_voyageur_briefs WHERE voyageurContactId = '<id>'`.
3. Si `status != 'anonymized'` ou `anonymizedAt IS NULL` → exécuter
   manuellement le use case via CLI (cf. flux 3) + audit + outbox +
   réponse voyageur sous 24h max.

## Références

- ADR-0008 — Hash salé immutable
- ADR-0017 — `intake_audit_entries` séparée
- spec.md FR-022, FR-022a, FR-023, SC-008
- data-model.md `VoyageurContact.applyAnonymisation`
- migration `20260528170003_intake_anonymisation_trigger`
