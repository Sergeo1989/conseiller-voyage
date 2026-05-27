# Runbook — Incident response feature 004 (legal)

**Source** : ADR-0008 (anonymisation Loi 25) + ADR-0009 (cookie HMAC).
**Public** : SecOps / on-call.

---

## Scénario 1 — Alerte `LegalCookieForgeDetected` (critique)

**Symptôme** : > 5 cookies `__Host-cv.legal-version` avec signature HMAC
invalide en 1 heure.

### Étapes

1. **Vérifier la légitimité** : un déploiement récent qui a rotaté
   `LEGAL_COOKIE_HMAC_SECRET` peut générer des invalides légitimes
   pendant la fenêtre de transition. Si rotation < 1h → fausse alerte,
   acquitter et surveiller.
2. **Si pas de rotation récente** : identifier la source via les logs
   Sentry de `apps/web/src/middleware.ts` (filtrer sur `legal_cookie_forge`).
   - Une seule IP / range → blocage WAF temporaire.
   - Distribution → escalade SecOps + CTO immédiate.
3. **Rotation d'urgence du HMAC secret** (cf. runbook
   `legal-secrets-setup.md` section 3.3). Effet : invalide tous les
   cookies existants, force ré-émission au prochain GET version-status.
4. **Audit CloudTrail** : confirmer qu'aucun accès non autorisé au secret
   `cv/legal/cookie-hmac-secret` n'est survenu (cf. T099).
5. **Incident post-mortem** : ouvrir doc dans `docs/incidents/YYYY-MM-DD-legal-cookie-forge.md`.

---

## Scénario 2 — Fuite suspectée du salt d'anonymisation

**Symptôme** : accès suspect au secret AWS `cv/legal/subject-anonymization-salt`
(CloudTrail), ou suspicion plus large de fuite côté infrastructure.

### Étapes

1. **Confirmer la fuite** :
   - CloudTrail `GetSecretValue` depuis un rôle inattendu.
   - Audit `aws_iam_user_use_history` cross-référencé.
2. **Notification** :
   - CAI (Commission d'accès à l'information du Québec) — délai légal
     Loi 25 : *aussitôt que possible*.
   - Utilisateurs concernés : si la fuite permet d'inverser des hashes
     d'identité d'utilisateurs supprimés, c'est un *incident grave de
     confidentialité*.
3. **Rotation du salt** (ADR-0008 plan de rotation versionnée) :
   - Génère un nouveau salt via `openssl rand -hex 32`.
   - Bump `LegalAcceptanceAnonymization.anonymizationSaltVersion` en BD
     (insert manuel d'un compteur dans une table `legal_anonymization_salt_metadata`).
   - **L'historique anonymisé reste valide** avec l'ancien salt — c'est
     pourquoi on stocke la version. Les nouvelles anonymisations
     utiliseront la nouvelle version.
4. **Re-anonymiser les rows** : exécuter le job de re-anonymisation pour
   les acceptances dont `anonymizationSaltVersion = ancienne_version`
   (job manuel one-shot, pas automatisé).
5. **Post-mortem documenté + diff avec ADR-0008**.

---

## Scénario 3 — Forte hausse `legal_reacceptance_required_total`

**Symptôme** : alerte `LegalReacceptanceChurnHigh` warning > 7 jours.

### Étapes

1. **Vérifier un bump récent** d'une version cgu_b2b : si oui, c'est
   attendu et l'alerte rentre dans l'ordre en quelques jours.
2. **Si pas de bump** : possible bug
   - Cookie HMAC qui n'est pas posé par les controllers (re-test API).
   - Middleware appelle l'API avec un IP/host incorrect.
3. **Mettre en pause l'alerte** si bump prévu, ou ouvrir un ticket
   d'investigation produit (UX/copy de la page de ré-acceptation).
