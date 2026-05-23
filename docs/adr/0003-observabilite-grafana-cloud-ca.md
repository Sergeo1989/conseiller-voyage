# ADR-0003 — Backend d'observabilité Grafana Cloud, région Canada

**Date** : 2026-05-22
**Statut** : accepté
**Décideurs** : porteur produit, équipe technique
**Documents liés** :
- [Constitution v2.1.0, Principe VII — Observabilité](../../.specify/memory/constitution.md)
- [Principe II — Vie privée et Loi 25 (NON-NÉGOCIABLE)](../../.specify/memory/constitution.md)
- [Roadmap, feature 021 — Observabilité centrale](../roadmap.md)

---

## Contexte

La constitution (Principe VII) exige que les quatre métriques de premier
ordre soient instrumentées dès la première mise en production : taux de
complétion intake, % leads acceptés, conversion lead → devis → réservation,
churn conseiller. Plus les métriques d'opération (latence, erreurs,
saturation, débit) par module.

Le SDK utilisé est OpenTelemetry (verrouillé constitution). Reste à choisir
le **backend** qui ingère les traces, métriques et logs.

Contrainte Principe II : résidence canadienne pour toute donnée personnelle
ou pseudonymisée pouvant être ré-identifiée.

---

## Décision

**Adopter Grafana Cloud avec la région Canada activée** comme backend
d'observabilité (traces Tempo, logs Loki, métriques Mimir/Prometheus, UI
Grafana, alerting Grafana OnCall).

Configuration :
- Région cloud : Canada (data plane à Toronto via partenaire AWS
  `ca-central-1`).
- Plan : Free Tier au démarrage (50 GB logs, 10K metric series, 50 GB
  traces, 3 utilisateurs), upgrade Pro au besoin (~50 USD/mois).
- Identités : SSO via Auth.js plus tard ; comptes admin avec MFA en
  attendant.
- Ingestion : OTLP gRPC depuis les apps Next.js + NestJS + workers BullMQ.
- Rétention : 30 jours par défaut (suffisant Principe VII, le journal
  d'audit conformité reste en Postgres pour 7 ans).
- DPA Loi 25 : Grafana Labs offre un Data Processing Addendum
  standardisé ; à signer avant la mise en production.

---

## Conséquences

**Positives** :
- OpenTelemetry natif, pas de transformation propriétaire.
- UI Grafana mature, dashboards versionnables en JSON (commit dans
  `docs/dashboards/`).
- Alerting unifié (Grafana Alertmanager) avec routes Slack/Discord/courriel.
- Tableau de bord Principe VII rapidement opérationnel (4 métriques de la
  boucle économique + SLO par module).
- Coût minimal au démarrage (Free Tier suffit pour le MVP).

**Négatives** :
- Grafana Labs est une société américaine. Bien que la région Canada
  garantisse que les données « at-rest » et « in-transit » restent au
  Canada, le contrôle d'accès opérationnel implique des employés
  potentiellement non canadiens (administrateurs Grafana avec accès en
  lecture aux clusters). Mitigation : DPA Loi 25 + chiffrement bout-en-bout
  des champs sensibles (mais les métadonnées de trace restent en clair).
- Verrou logiciel modéré (Grafana Cloud spécificités). Mitigation :
  OpenTelemetry standardisé permet de basculer vers self-hosted ou un autre
  fournisseur OTel-compatible.
- Free Tier limité — à surveiller dès qu'on dépasse 50 GB logs/mois.

---

## Alternatives considérées

### Self-hosted Grafana + Tempo + Loki + Mimir sur AWS ca-central-1

- **Avantages** : souveraineté maximale, aucun tiers, alignement parfait
  Principe II.
- **Pourquoi rejetée pour le MVP** : charge ops disproportionnée (4
  services à opérer, mise à jour, scaling, backups, HA). Réservée pour une
  ré-évaluation si Grafana Cloud devient coûteux ou si une exigence de
  souveraineté plus stricte émerge.

### AWS CloudWatch + X-Ray

- **Avantages** : zéro fournisseur externe, même IAM que ECS/S3/SES.
- **Pourquoi rejetée** : UI inférieure, alerting moins flexible,
  exploration des traces moins agréable, coûts qui grimpent vite sur les
  traces volumineuses.

### Datadog (région Montréal disponible)

- **Avantages** : meilleure DX et fonctionnalités de l'industrie, région
  Montréal récemment ajoutée.
- **Pourquoi rejetée** : coût (~30 USD/host + add-ons APM, logs, RUM…) — au
  moins 5-10× plus cher que Grafana Cloud Free pour notre MVP.

### Honeycomb

- **Avantages** : excellent pour les traces distribuées.
- **Pourquoi rejetée** : pas de région canadienne au moment de la rédaction
  (à re-vérifier en 2026 H2). Bloque sur Principe II.

---

## Plan de migration

S'il faut un jour basculer vers un autre backend OTel-compatible :

1. Créer un nouvel ADR remplaçant celui-ci.
2. Configurer un second exporter OTLP en parallèle (le SDK OTel le supporte
   nativement via composite exporters).
3. Mode dual-export transitoire, comparer la fidélité.
4. Bascule du primaire dans la configuration applicative.
5. Décommissionner Grafana Cloud après période d'observation.

Aucune modification de code applicatif n'est nécessaire — c'est l'avantage
d'OTel comme abstraction.

---

## Références

- [Constitution v2.1.0](../../.specify/memory/constitution.md), Principe VII (Observabilité), Principe II (Loi 25)
- [Grafana Cloud — Region availability](https://grafana.com/docs/grafana-cloud/account-management/regions/)
- [OpenTelemetry — Composite exporters](https://opentelemetry.io/docs/specs/otel/configuration/)
