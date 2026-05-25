# ADR-0006 — Pivot Resend → AWS SES pour la conformité Loi 25

**Date** : 2026-05-22
**Statut** : accepté
**Décideurs** : porteur produit, équipe technique
**Documents liés** :
- [Constitution v2.1.0, Principe II — Vie privée et Loi 25 (NON-NÉGOCIABLE)](../../.specify/memory/constitution.md)
- [ADR-0001 — Stockage objet AWS S3 ca-central-1](./0001-stockage-objet-canadien.md)
- [ADR-0005 — Déploiement AWS ECS Fargate ca-central-1](./0005-deploiement-aws-ecs-fargate.md)
- [Roadmap, feature 003 — Identité notifications + courriel transactionnel](../roadmap.md)

---

## Contexte

Lors de la session de décision des outils (2026-05-22), un premier choix
préféré sur la DX a retenu **Resend** comme fournisseur de courriel
transactionnel. Resend offre une DX excellente : templates React Email
natifs, API moderne, dashboards conviviaux.

**Conflit immédiat avec le Principe II de la constitution** (NON-NÉGOCIABLE) :

> Tout sous-traitant (hébergeur, fournisseur LLM, outil d'analyse,
> **service de courriel transactionnel**) **DOIT** offrir une résidence
> canadienne contractuelle ; à défaut, il **NE PEUT PAS** recevoir de
> données personnelles identifiables.

L'infrastructure principale de Resend est sur AWS US-East. Aucune région
canadienne dédiée au moment de la rédaction. Un courriel transactionnel
contient au minimum l'adresse courriel du destinataire (PII) et
typiquement son prénom + contexte du dossier — donc transite par des
serveurs US. **Incompatible** avec Loi 25 sans DPA négocié spécifiquement.

Cet ADR documente le pivot pour qu'un futur PR ne ré-introduise pas Resend
par DX sans repasser par la même analyse.

---

## Décision

**Pivot vers AWS SES dans la région `ca-central-1`.**

Configuration :
- Service : AWS Simple Email Service (SES) v2, région `ca-central-1`.
- Identité d'envoi : domaine `cv-mail.example.ca` vérifié via DKIM, SPF,
  DMARC `p=quarantine` initial puis `p=reject` après stabilisation.
- SDK : `@aws-sdk/client-sesv2` (avec credentials IAM via ECS task role).
- Templates : **react-email** rendus en HTML statique à l'envoi, stockés
  dans `packages/shared/email/templates/`. Plain-text auto-généré par
  react-email pour les clients sans HTML.
- Suivi : événements SES (Delivery, Bounce, Complaint) routés vers SNS
  puis ingérés par un worker BullMQ qui met à jour la table
  `notification_deliveries` (statut, timestamps).
- Réputation IP : SES Sandbox initial (200 emails/jour, destinataires
  vérifiés seulement) → demande de sortie de sandbox une fois DKIM/SPF
  validés et les premiers volumes accumulés (suppression list configurée).

---

## Conséquences

**Positives** :
- **Résidence canadienne par construction**. Aucun DPA additionnel à
  négocier — AWS publie ses engagements de résidence pour `ca-central-1`.
- **Cohérence AWS** : même compte, même IAM, même VPC que S3 et ECS.
- **Coût négligeable** : ~0,10 USD / 1000 emails (le MVP enverra
  largement < 100 000 emails/an).
- **Réputation contrôlable** : IP dédiée disponible (~25 USD/mois) si
  délivrabilité critique.
- **react-email** reste utilisable — c'est une lib de templates indépendante
  du fournisseur d'envoi.

**Négatives** :
- **DX inférieure à Resend** : pas de dashboard d'envoi natif intégré,
  événements bounce/complaint à câbler manuellement via SNS, pas de preview
  d'envoi web. À compenser par un mini-dashboard Grafana lisant la table
  `notification_deliveries`.
- **Configuration DKIM/SPF/DMARC manuelle** : ~1-2 jours initial pour
  configurer DNS, vérifier propagation, valider chez les principaux
  fournisseurs (Gmail, Outlook, Yahoo, Apple Mail).
- **Sortie de sandbox SES** : ~24-48 h d'attente après demande, avec
  justification du cas d'usage.

---

## Alternatives considérées (et rejetées définitivement)

### Resend (le choix initial)

- **Avantages** : DX top de l'industrie, templates React Email intégrés,
  dashboard d'envoi excellent.
- **Pourquoi définitivement rejetée** : infrastructure US-East, pas de
  région CA, pas de DPA Loi 25 standard contractuel au moment de la
  rédaction. Risque de sanction OPC. Réouvrir l'option **uniquement** si
  Resend lance une région canadienne avec DPA explicite — nouveau ADR
  remplaçant celui-ci.

### Postmark, SendGrid, Mailgun

- Toutes US-based sans région CA. Mêmes raisons de rejet que Resend.

### Self-hosted Postal ou Maddy sur AWS ca-central-1

- **Avantages** : souveraineté maximale, coût marginal.
- **Pourquoi rejetée** : charge ops disproportionnée (chauffage IP,
  listes anti-spam, monitoring délivrabilité, gestion bounces). Sur-
  ingénierie pour le volume MVP.

---

## Plan d'envoi initial (pour la mise en production)

1. **J-14** : créer domaine d'envoi, configurer DNS, DKIM, SPF.
2. **J-7** : passer DMARC en `p=quarantine` ; envoyer aux comptes test
   internes.
3. **J-3** : demander sortie sandbox SES auprès AWS.
4. **J-0** : passer DMARC en `p=reject` après confirmation de la
   délivrabilité chez les 5 principaux fournisseurs.

---

## Lessons learned

Cet ADR documente une **erreur de processus** : Resend a été choisi en
batch 3A sans vérifier la conformité Loi 25 d'emblée. La vérification est
intervenue en revue post-batch, ce qui a forcé un pivot immédiat.

**Règle introduite** : toute proposition de fournisseur SaaS lors d'une
décision tooling **DOIT** être vérifiée contre Principe II (résidence
canadienne) **avant** d'apparaître comme option recommandée. À encoder dans
le processus de revue tools.

---

## Références

- [Constitution v2.1.0](../../.specify/memory/constitution.md), Principe II (Loi 25)
- [Loi modernisant des dispositions législatives en matière de protection des renseignements personnels (« Loi 25 ») — Québec](https://www.cai.gouv.qc.ca/)
- [AWS SES — Régions](https://docs.aws.amazon.com/general/latest/gr/ses.html)
- [react-email documentation](https://react.email/)
