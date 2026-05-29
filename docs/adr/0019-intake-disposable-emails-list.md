# ADR-0019 — Liste publique GitHub pour les emails jetables (3-tier fallback)

**Date** : 2026-05-29
**Statut** : accepté
**Décideurs** : équipe technique
**Spec lié** : [002-voyageur-intake/spec.md](../../specs/002-voyageur-intake/spec.md), FR-021
**Plan lié** : [002-voyageur-intake/plan.md](../../specs/002-voyageur-intake/plan.md), Phase 0 — R3

---

## Contexte

Le module intake doit bloquer les emails jetables (mailinator,
10minutemail, temp-mail, etc.) pour limiter le bruit anti-spam et
garantir la qualité des leads (Principe III). Trois sources de blocklist
ont été considérées :

| Source | Maintenance | Couverture | Risque résidence Loi 25 |
|---|---|---|---|
| `disposable-email-domains` NPM | Stale (last update 2023) | ~80% | ✅ local, pas de transfert |
| `disposable-email-domains/disposable-email-domains` GitHub | Updated weekly | ~95% | ✅ fetch raw — pas de PII transmise |
| Service tiers (Kickbox, Verifalia) | Externe payant | ~99% | ❌ Hors résidence canadienne |

Le service externe est **rejeté** : transfert d'emails voyageurs (PII) hors
Canada — violation Principe II / ADR-0001.

## Décision

Mettre en place une **chaîne de fallback 3-tier** :

1. **Tier 1 — Redis SET `intake:disposable-emails`** (source de vérité
   chaude). Rafraîchi par cron BullMQ `IntakeDisposableEmailsRefreshJob`
   (T098) toutes les 7 jours depuis la liste GitHub raw publique.
2. **Tier 2 — Package npm `disposable-email-domains`** (T004 — ~3 500
   domaines, snapshot semi-récent maintenu par la communauté).
3. **Tier 3 — Snapshot statique embedded**
   `packages/shared/src/intake/disposable-emails-snapshot.json` (T099 —
   148 domaines majeurs, dernier recours offline).

L'adapter `DisposableEmailCheckerImpl` (T052) interroge Tier 1 d'abord,
fallback Tier 2 (déjà chargé en mémoire au boot), fallback Tier 3.
Suffix match parent supporté (ex: `foo.mailinator.com` →
`mailinator.com`).

## Conséquences

### Positives

1. **Conformité Loi 25** : aucune PII voyageur ne quitte le Canada — la
   blocklist est du contenu public, le fetch est anonyme.
2. **Robustesse** : si GitHub est down, le fallback npm prend le relais.
   Si npm rate-limit, le snapshot embedded couvre toujours les 148
   domaines les plus courants.
3. **Updates régulières** : cron 7 jours capture les nouveaux domaines
   jetables émergents sans intervention manuelle.
4. **Coût zéro** : pas d'API tierce, pas de quota.

### Négatives

1. **Faux négatifs résiduels** : un email jetable très récent peut
   passer entre 2 refresh hebdomadaires. Atténuation : le rate-limit
   IP + email (FR-019/020) bloque les abus volumiques.
2. **Cron à monitorer** : si le job échoue silencieusement pendant
   plusieurs semaines, la liste devient stale. Atténuation : runbook
   `intake-disposable-emails-monitoring.md` (T140) avec alerte.

---

## Captcha en option (T R4 — non retenu en J1)

Une variante envisagée était d'ajouter un **captcha** (hCaptcha,
Cloudflare Turnstile) en complément. **Rejetée en J1** parce que :

- Friction UX significative (5-15% chute conversion selon Nielsen Norman).
- Les 3 défenses en place (rate-limit, disposable, signal manuel hebdo)
  devraient couvrir le bot trivial.
- Cloudflare Turnstile : résidence USA, transfert PII — incompatible
  Loi 25.
- hCaptcha : éligible (résidence Europe), en standby.
- **Trigger** : si `intake_brief_abuse_blocked_total > 50/jour` pendant
  7 jours consécutifs → activer hCaptcha. Décision documentée dans ce
  ADR pour traçabilité.

## Références

- ADR-0001 — Stockage objet canadien (résidence Loi 25)
- specs/002-voyageur-intake/research.md R3, R4
- specs/002-voyageur-intake/data-model.md
- `apps/api/src/modules/intake/infrastructure/disposable-email-checker.ts`
- `apps/api/src/modules/intake/infrastructure/jobs/intake-disposable-emails-refresh.job.ts`
- `docs/runbooks/intake-disposable-emails-monitoring.md`
