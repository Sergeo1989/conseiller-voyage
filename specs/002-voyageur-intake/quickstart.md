# Quickstart : Module Intake / Préqualification voyageur

**Branch**: `002-voyageur-intake` | **Date**: 2026-05-25 | **Plan**: [plan.md](./plan.md)

Tester le module intake en local après implémentation.

## Pré-requis

- Feature 001 mergée vers `main` ✅ (PR #1, 2026-05-25)
- Stack dev local démarrée : `pnpm docker:up && pnpm dev`
- DB migrée : `pnpm --filter @cv/db migrate` après ajout des migrations intake
- Seed dev exécuté : `pnpm db:seed:dev` (crée admin@test.cv pour la file admin)

## Scénarios end-to-end

### Scénario 1 — Voyageur soumet un brief (golden path US1)

```bash
# Browser : http://localhost:3000/fr/voyage/nouveau
# Remplir les 5 étapes du formulaire en < 7 minutes
# Étape 1 : Destination = Italie, multi-stop possible
# Étape 2 : Dates : 2027-03-15 → 2027-03-30, flexible ±5 jours
# Étape 3 : Groupe : 2 adultes, 0 enfant
# Étape 4 : Budget 5-10k$, Langue conseiller : FR, Spécialité : Lune de miel, Familiarité : Expérimenté
# Étape 5 : Coordonnées + Consentement Loi 25 (case cochée)
# Submit → page « Vérifie ton courriel »

# Inspecter le magic link envoyé via LocalStack SES
docker exec cv-localstack-dev awslocal sesv2 get-message --message-id <id>

# Ou directement dans le mailcatcher console LocalStack :
# http://localhost:4566/_aws/ses/messages
```

Validation attendue :
- Brief créé en DB avec `status = pending_verification`
- VoyageurContact créé avec PII
- MagicLinkToken créé avec `purpose = verify_email`, expires J+7
- IntakeAuditEntry `intake.brief.submitted` créée
- Aucune entrée outbox encore (pas activée)

### Scénario 2 — Voyageur clique le magic link (US1 verification)

```bash
# Copier l'URL du magic link depuis l'email
# Coller dans le navigateur : http://localhost:3000/fr/voyage/<token>

# Le serveur valide le token, active le brief, set le cookie session
# voyageur, et redirige vers la page récap.
```

Validation attendue :
- Brief passe `pending_verification → active`
- MagicLinkToken marqué `consumedAt = now()`
- Outbox entry `voyageur.brief.activated` créée
- Cookie `__Host-cv.intake.token` posé (ou `cv.intake.session` en dev HTTP)
- IntakeAuditEntry `intake.brief.verified` créée

### Scénario 3 — Voyageur consulte sa page récap (US2)

```bash
# Toujours dans le même navigateur (cookie posé), naviguer vers
# http://localhost:3000/fr/voyage/<token>
```

Validation attendue :
- Page récap affiche les 9 dimensions du brief en lecture seule
- Statut = "Actif"
- Date d'expiration affichée (= submittedAt + 90 jours)
- Lien « Voir mes autres briefs » présent
- Bouton « Supprimer mes données » présent

### Scénario 4 — Soumettre un 2e brief avec le même email (US3)

```bash
# Nouvel onglet, http://localhost:3000/fr/voyage/nouveau
# Remplir un brief différent avec le MÊME email
```

Validation attendue :
- 2e brief créé indépendamment (nouveau briefId, nouveau magic link)
- VoyageurContact réutilisé (même email = même contact)
- Compteur `briefsCount24h` incrémenté à 2

### Scénario 5 — Rate-limit déclenché (FR-019)

```bash
# Soumettre un 4e brief avec le même email dans la fenêtre 24h
```

Validation attendue :
- Réponse HTTP 429
- Message FR-CA : « Vous avez déjà soumis 3 briefs aujourd'hui. Veuillez réessayer demain ou utiliser une autre adresse courriel. »
- Aucun brief créé en DB

### Scénario 6 — Voyageur demande l'effacement (US4 Loi 25)

```bash
# Sur la page récap, cliquer « Supprimer mes données »
# Modal : taper JE_CONFIRME_LA_SUPPRESSION_IRREVERSIBLE
# Confirmer
```

Validation attendue :
- Brief `erasureRequestedAt` set
- IntakeAuditEntry `intake.brief.erasure_requested` créée
- DataRetentionSweepJob (extension du 001) traite < 60 s :
  - VoyageurContact.firstName/lastName/phone/postalCode → NULL
  - VoyageurContact.email → emailHashAfterErasure (SHA-256)
  - VoyageurBrief.status → anonymized
  - MagicLinkToken supprimés
  - Outbox entry `voyageur.brief.deleted` publiée
- Visiter le magic link plus tard : page « Brief supprimé » (sans PII)

### Scénario 7 — Admin pousse un brief non-matché manuellement (US5)

```bash
# Logger en admin : http://localhost:3000/fr/login → Admin
# Naviguer : http://localhost:3000/fr/admin/intake/non-matche
# Voir la file des briefs > 4h sans match
# Cliquer un brief → page détail
# Choisir un conseiller vérifié (lookup ConformiteQueryFacade)
# Saisir motif (20-500 chars) → Push
```

Validation attendue :
- IntakeAuditEntry `intake.admin.pushed_manual` avec actorRole=admin + correlationId
- Outbox entry `voyageur.brief.pushed_manual`
- Le brief reste en statut `active`, mais avec `matchedConseillersCount = 1` (incrémenté)

## Vérifications DB

```sql
-- Inspecter les briefs créés
SELECT id, status, "submittedAt", "verifiedAt", "expiresAt", speciality, "conseillerLanguage"
FROM intake_voyageur_briefs
ORDER BY "submittedAt" DESC LIMIT 10;

-- Vérifier que les PII sont bien nullifiées après effacement
SELECT email, "firstName", "lastName", "emailHashAfterErasure"
FROM intake_voyageur_contacts
WHERE id = '<contactId>';
-- email doit être NULL si effacé, emailHashAfterErasure rempli

-- Vérifier l'audit log append-only
INSERT INTO intake_audit_entries (...) VALUES (...);  -- doit passer
UPDATE intake_audit_entries SET "eventType" = 'tampered' WHERE id = '...';  -- doit rejeter
DELETE FROM intake_audit_entries WHERE id = '...';  -- doit rejeter
TRUNCATE intake_audit_entries;  -- doit rejeter (trigger STATEMENT-level, leçon 001)
```

## Vérifications Outbox

```sql
SELECT "eventType", "payload"->>'briefId', "publishedAt"
FROM intake_outbox
ORDER BY "createdAt" DESC LIMIT 20;
```

Tous les events doivent avoir `publishedAt` non-null après 10s (le job
drain tourne toutes les 5s).

## Tests automatiques

```bash
# Unit tests (Vitest)
pnpm --filter @cv/api test:unit -- --grep intake

# Integration tests (Vitest + Postgres réel)
pnpm --filter @cv/api test:integration -- --grep intake

# E2e Playwright (besoin dev tournant)
pnpm --filter @cv/api test:e2e -- intake

# A11y (Playwright + axe-core)
pnpm --filter @cv/web test:a11y -- intake
```

## Métriques OTel à observer

Dashboard Grafana `intake.json` (à provisionner via CDK) :
- Taux de complétion formulaire (calibre SC-001 ≥ 65%)
- Temps médian complétion (calibre SC-002 ≤ 6 min)
- Taux de vérification magic link (calibre SC-006 ≥ 70%)
- Taux d'abus bloqués (calibre SC-007 ≤ 3%)

## Troubleshooting

| Symptôme | Cause probable | Solution |
|---|---|---|
| Magic link 401 « expiré » | TTL J+7 dépassé | Cliquer « Renvoyer un nouveau lien » |
| Brief reste en `pending_verification` | SES en panne ou bounce email | Inspecter LocalStack SES inbox + Job retry |
| HTTP 429 sur soumission | Rate-limit IP ou email | Attendre 24h ou changer adresse |
| Formulaire perdu après crash navigateur | localStorage TTL 24h dépassé ou auto-clear post-submit | Reprendre depuis étape 1 (cf. R5 : pas de cache serveur tant que consent Loi 25 pas accordé étape 5) |
| Audit log ne s'écrit pas | Trigger SQL bloque (manqué d'INSERT GRANT) | Vérifier `GRANT INSERT ON intake_audit_entries TO app_intake` |
