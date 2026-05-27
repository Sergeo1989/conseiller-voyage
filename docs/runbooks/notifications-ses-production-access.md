# Runbook — Sortie du sandbox AWS SES (production)

**Responsable** : équipe opérations  
**Applicable à** : `apps/api` + infrastructure CDK `infra/lib/notifications-stack.ts`  
**Région** : `ca-central-1` (ADR-0001)

---

## 1. Contexte

Par défaut, AWS SES en région `ca-central-1` démarre en mode **sandbox** :
seules les adresses vérifiées peuvent recevoir des courriels. La sortie du
sandbox requiert un ticket AWS Support justifiant l'usage légitime et
démontrant la gestion des bounces/plaintes.

---

## 2. Checklist pré-demande

Effectuer ces vérifications **avant** d'ouvrir le ticket AWS Support :

### 2.1 SPF
- [ ] Enregistrement TXT `v=spf1 include:amazonses.com ~all` présent dans la zone DNS.
- [ ] Validation : `dig TXT <domain> | grep spf`

### 2.2 DKIM
- [ ] Les 3 enregistrements CNAME DKIM fournis par SES sont créés dans la zone DNS.
- [ ] Vérification dans la console SES : statut "Verified" sur l'identité de domaine.
- [ ] Validation : `dig CNAME <token>._domainkey.<domain>`

### 2.3 DMARC
- [ ] Enregistrement TXT `_dmarc.<domain>` avec `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@<domain>`.
- [ ] Politique DMARC ≥ `quarantine` requise par AWS pour la sortie sandbox.

### 2.4 Configuration Set SES
- [ ] ConfigurationSet `cv-notifications` créé (CDK).
- [ ] SNS topic bounces/complaints/delivery configuré et Lambda subscrite.
- [ ] Test d'envoi vers le simulateur SES (`bounce@simulator.amazonses.com`) :
  - Bounce permanent → entrée dans `notification_suppression_list`.
  - Complaint → entrée dans `notification_suppression_list`.
  - Delivery → `status = delivered` dans `notification_email_log`.

### 2.5 Email Identity vs Domain Identity
- [ ] Utiliser **Domain Identity** (pas Email Identity) en production.
  Domain Identity couvre toutes les adresses du domaine ; Email Identity est
  limitée à une seule adresse (à éviter en prod).
- [ ] Identity `ca-central-1` (pas `us-east-1`).

---

## 3. Ouverture du ticket AWS Support

1. Console AWS → **Support Center** → **Create Case** → **Account and billing**.
2. Choisir : **Service : SES** → **Request type : Production Access**.
3. Remplir :
   - **Website URL** : `https://conseiller-voyage.ca`
   - **Type of emails** : Transactional (notifications compte, conformité, MFA)
   - **Expected send volume** : < 50 000/mois à J1, montée en charge linéaire
   - **Bounce handling** : SNS → Lambda → suppression list automatique
   - **Complaint handling** : SNS → Lambda → suppression list permanente
   - **Unsubscribe link** : présent dans chaque courriel (lien CASL)
   - **Sample email** : joindre un exemple HTML de `identite.invitation_admin`
4. Délai moyen : 1-3 jours ouvrables.

---

## 4. Post-approbation

- [ ] Mettre à jour le quota d'envoi dans la configuration CDK si nécessaire.
- [ ] Surveiller les métriques OTel dans le dashboard
  [`cv-notifications-deliverability`](../dashboards/notifications.json)
  pendant les 48 h suivant l'activation.
- [ ] Activer les alertes Grafana (`docs/dashboards/notifications-alerts.yaml`).
- [ ] Confirmer le SLO : taux de livraison > 98 % sur les 24 h initiales.

---

## 5. Limites de quota initiales (après sortie sandbox)

| Métrique | Limite initiale | Action si atteinte |
|---|---|---|
| Envois / 24 h | 50 000 | Ticket Support "increase" |
| Envois / seconde | 14 | Throttle BullMQ `concurrency` |
| Taux de bounce max | 5 % | Alerte Grafana `notification-bounce-rate-high` |
| Taux de plainte max | 0,1 % | Alerte Grafana `notification-complaint-rate-high` |
