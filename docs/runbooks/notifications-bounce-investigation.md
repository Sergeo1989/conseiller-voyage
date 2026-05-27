# Runbook — Investigation d'un pic de bounces

**Responsable** : équipe on-call  
**Déclenché par** : alerte Grafana `notification-bounce-rate-high` (bounce > 5 % / 1 h)  
**Dashboard** : [`cv-notifications-deliverability`](../dashboards/notifications.json)

---

## Étape 1 — Qualifier le pic

1. Ouvrir le dashboard `cv-notifications-deliverability`.
2. Identifier :
   - **Template(s) concerné(s)** : panel "Bounce Rate par Template".
   - **Type de bounce** : `hard` (permanent — adresse invalide) ou `soft`
     (transient — boîte pleine, serveur temporaire HS).
   - **Fenêtre temporelle** : isoler le début du pic.
3. Hard bounces > 5 % sur un seul template → suspect de liste d'adresses corrompue
   ou de bug de génération d'adresse.
4. Soft bounces en masse → peut être un incident chez le fournisseur de messagerie
   destinataire (Gmail, Outlook, Bell).

---

## Étape 2 — Identifier le template défaillant

```sql
-- Top templates par taux de bounce (24 h)
SELECT
  template_id,
  COUNT(*) FILTER (WHERE status = 'bounced') AS bounces,
  COUNT(*) FILTER (WHERE status = 'sent') AS sent,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'bounced')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE status = 'sent'), 0) * 100, 2
  ) AS bounce_rate_pct
FROM notification_email_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY template_id
ORDER BY bounce_rate_pct DESC
LIMIT 10;
```

---

## Étape 3 — Inspecter les bounces récents

```sql
-- Détail des bounces récents pour un template
SELECT
  id,
  correlation_id,
  template_id,
  recipient_email_hash_hmac,
  bounced_at,
  last_error
FROM notification_email_log
WHERE status = 'bounced'
  AND template_id = '<template_id>'
  AND bounced_at > NOW() - INTERVAL '2 hours'
ORDER BY bounced_at DESC
LIMIT 50;
```

---

## Étape 4 — Retrait manuel de la suppression list (faux positif)

Si une adresse est bloquée par erreur (faux positif confirmé) :

1. Retrouver l'entrée dans la console admin :
   `/admin/notifications/suppression-list`
2. Chercher par hash (les 8 premiers caractères suffisent pour identifier).
3. Cliquer **Retirer** → saisir un motif explicite (≥ 10 chars) :
   `Faux positif confirmé — domaine partenaire whitelisté`
4. L'action appelle `removeFromSuppressionAction` → POST
   `/api/admin/notifications/suppression-list/:id/remove`.
5. Vérifier dans le journal d'audit (`/admin/notifications/audit`) que l'événement
   `notification.suppression.removed_manual` est bien enregistré.

---

## Étape 5 — Suspension préventive d'un template défaillant

Si un template génère systématiquement des hard bounces (> 10 %) :

1. Mettre la queue BullMQ en pause pour ce template (Redis CLI) :
   ```bash
   # Aucun mécanisme de pause par template n'est implémenté J1.
   # Solution de repli : désactiver le code qui émet ce templateId
   # dans le use case source (conformite, identite, etc.).
   ```
2. Ouvrir un incident dans Linear (projet `NOTIF`) avec :
   - Taux de bounce observé
   - TemplateId
   - Fenêtre temporelle
   - Hash des destinataires touchés (pas les emails en clair)
3. Corriger la source du bug (adresse mal formée, encoding charset, DNS expéditeur).
4. Tester via le simulateur SES avant redéploiement.

---

## Étape 6 — Retry de la dead-letter queue

Après correction du bug :

1. Aller dans `/admin/notifications/dead-letter`.
2. Retry individuel : cliquer **Relancer** sur chaque entrée, saisir le motif.
3. Retry en masse (pas d'UI J1) : script console :
   ```bash
   pnpm tsx scripts/dev/saturate-dlq.ts --cleanup
   ```
4. Surveiller le dashboard : les entries relancées doivent passer en `queued`
   puis `sent`/`delivered`.

---

## Post-mortem

Remplir le template post-mortem dans Linear dans les 48 h suivant la résolution :
- Cause racine (root cause)
- Impact (nombre d'emails non livrés, durée)
- Actions correctives court terme + long terme
- Métriques de rétablissement (taux de bounce revenu < 5 %)
