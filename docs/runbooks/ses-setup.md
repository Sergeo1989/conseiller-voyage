# Runbook — Setup AWS SES pour `cv-mail.example.ca`

**Tâche** : T030b
**Date cible** : à exécuter au moins 14 jours avant la première mise en production publique
**Préalable** : domaine `cv-mail.example.ca` (ou équivalent) acheté et le registrar DNS accessible
**Cf.** [ADR-0006](../adr/0006-pivot-resend-vers-aws-ses.md) — pivot Resend → AWS SES

---

## Calendrier

| Jour | Action | Validation |
|---|---|---|
| **J-14** | Créer le domaine SES en `ca-central-1` + générer les enregistrements DKIM (3 CNAME) et SPF (1 TXT) | `aws sesv2 get-email-identity --email-identity cv-mail.example.ca --region ca-central-1` retourne `VerifiedForSendingStatus: true` |
| **J-7** | Configurer DMARC en mode `p=quarantine` avec rapports vers `dmarc@cv-mail.example.ca` | Vérifier propagation DNS : `dig TXT _dmarc.cv-mail.example.ca` |
| **J-7** | Envoyer un premier email de test interne vers Gmail / Outlook / Yahoo / Apple Mail. Vérifier en-têtes : DKIM=PASS, SPF=PASS, DMARC=PASS | Aucun email en spam, en-têtes corrects |
| **J-3** | Demander la sortie du sandbox SES auprès AWS Support (cas d'usage : courriels transactionnels conseillers + voyageurs) | Réponse AWS sous 24h |
| **J-0** | Bascule DMARC en `p=reject` après confirmation de la stabilité auprès des principaux fournisseurs courriel | Aucun bounce inattendu, taux de plainte < 0,1 % |

---

## Étapes détaillées

### J-14 : création de l'identité SES + DKIM/SPF

```bash
# 1. Créer l'identité de domaine
aws sesv2 create-email-identity \
  --email-identity cv-mail.example.ca \
  --dkim-signing-attributes NextSigningKeyLength=RSA_2048_BIT \
  --region ca-central-1

# 2. Récupérer les enregistrements DNS à publier
aws sesv2 get-email-identity \
  --email-identity cv-mail.example.ca \
  --region ca-central-1
```

Publier dans le registrar DNS :

| Type | Nom | Valeur |
|---|---|---|
| CNAME | `<token1>._domainkey.cv-mail.example.ca` | `<token1>.dkim.amazonses.com` |
| CNAME | `<token2>._domainkey.cv-mail.example.ca` | `<token2>.dkim.amazonses.com` |
| CNAME | `<token3>._domainkey.cv-mail.example.ca` | `<token3>.dkim.amazonses.com` |
| TXT | `cv-mail.example.ca` | `"v=spf1 include:amazonses.com -all"` |

Attendre la propagation DNS (TTL 300, généralement < 1h).

### J-7 : DMARC mode quarantine

```dns
TXT _dmarc.cv-mail.example.ca
"v=DMARC1; p=quarantine; rua=mailto:dmarc@cv-mail.example.ca; ruf=mailto:dmarc@cv-mail.example.ca; pct=100; sp=quarantine; aspf=s; adkim=s"
```

### J-3 : sortie sandbox

```bash
aws sesv2 put-account-sending-attributes \
  --production-access-enabled \
  --region ca-central-1
```

Ou via la console : SES → Account dashboard → Request production access.

Justification du cas d'usage :
- Volume estimé : 5 000 emails/mois année 1 (~150/jour)
- Types d'emails : transactionnels uniquement (résultat de revue conformité, rappels d'expiration, notifications de matching, magic-links voyageurs)
- Liste d'opt-out : intégrée dans chaque template react-email (Loi 25 — droit de retrait pour les marketing optionnels)

### J-0 : DMARC mode reject

Après 7 jours d'envois sans bounce inattendu ni plainte :

```dns
TXT _dmarc.cv-mail.example.ca
"v=DMARC1; p=reject; rua=mailto:dmarc@cv-mail.example.ca; pct=100; sp=reject; aspf=s; adkim=s"
```

---

## Vérifications post-production

- [ ] Taux de bounce < 5 % sur 7 jours glissants
- [ ] Taux de plainte < 0,1 % sur 7 jours glissants
- [ ] Domaine non-listé dans Spamhaus, Spamcop, Barracuda
- [ ] CloudWatch alarms configurées sur Bounce rate et Complaint rate
- [ ] Suppression list SES synchronisée avec la table `notification_deliveries` (T012 schema futur)

---

## Rollback

Si la délivrabilité se dégrade :
1. Bascule DMARC en `p=none` (pas de rejet, juste monitoring)
2. Investigation cause (changement template ? IP partagée ?)
3. Si nécessaire : demander une dédiée IP via AWS Support (~25 USD/mois)

---

## Références

- [AWS SES — Setting up email authentication](https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication.html)
- [Sender Best Practices Working Group — DMARC overview](https://dmarc.org)
- ADR-0006 (justification du pivot Resend → SES)
