# ADR-0007 — Error tracking Sentry self-hosted sur AWS `ca-central-1`

**Date** : 2026-05-22
**Statut** : accepté
**Décideurs** : porteur produit, équipe technique
**Documents liés** :
- [Constitution v2.1.0, Principe II — Vie privée et Loi 25 (NON-NÉGOCIABLE)](../../.specify/memory/constitution.md)
- [Constitution v2.1.0, Principe X — Fiabilité et résilience](../../.specify/memory/constitution.md)
- [ADR-0003 — Backend d'observabilité Grafana Cloud Canada](./0003-observabilite-grafana-cloud-ca.md)

---

## Contexte

Le tracking d'erreurs applicatives (exceptions JavaScript côté Next.js,
exceptions NestJS, crashes de workers BullMQ) est complémentaire de
l'observabilité OpenTelemetry (ADR-0003) :
- OTel : traces distribuées, métriques, logs structurés.
- Error tracking : regroupement automatique des erreurs identiques, source
  maps déminifiées, contexte utilisateur (PII pseudonymisé), workflow de
  triage / assignation / résolution.

Les payloads d'erreur contiennent fréquemment des données potentiellement
identifiables :
- Stack traces avec valeurs de variables locales (peut contenir des
  emails, IDs internes).
- URL de la requête (peut contenir des IDs de dossier conformité).
- Contexte utilisateur (user.id, et éventuellement role).
- Body de requête échouée (peut contenir le brief partiellement saisi).

→ Donc **Principe II** s'applique : résidence canadienne obligatoire.

---

## Décision

**Self-hoster Sentry sur AWS `ca-central-1`** (compte AWS partagé avec
ECS, S3, SES).

Configuration :
- Déploiement via [Sentry self-hosted Docker](https://develop.sentry.dev/self-hosted/)
  — stack docker-compose officiel adapté en CDK pour ECS Fargate.
- Service ECS dédié `sentry-prod` (séparé du cluster applicatif pour
  isolation), 1 task Fargate (2 CPU / 4 Go), autoscale 1-2.
- Stockage : RDS PostgreSQL dédié (db.t4g.small) + ClickHouse géré ou
  conteneur ClickHouse single-node Fargate (~30 USD/mois).
- Rétention : 90 jours d'erreurs en stockage chaud, 1 an cumul d'agrégats
  (alignement avec rétention logs constitution).
- Authentification : SSO via Auth.js (différé, début avec admin local +
  MFA TOTP).
- Domaine : `sentry.cv.internal.example.ca` accessible uniquement depuis
  le VPC + VPN admin.
- SDK applicatifs : `@sentry/nextjs` côté `apps/web`, `@sentry/nestjs` côté
  `apps/api`, `@sentry/node` côté workers BullMQ.

Pseudonymisation des données envoyées à Sentry :
- `beforeSend` hook configuré dans chaque SDK pour scrubber automatiquement
  les champs PII : `email`, `phone`, `firstName`, `lastName`, `body.brief`,
  `body.preferences`. Liste blanche d'attributs autorisés plutôt que liste
  noire (défense en profondeur).
- L'identifiant utilisateur transmis est uniquement `conseillerComplianceId`
  ou `voyageurSessionId` (UUIDs non identifiants directs).
- Source maps uploadées via `sentry-cli` dans le pipeline CI, **non
  exposées** publiquement.

---

## Conséquences

**Positives** :
- **Souveraineté maximale** : aucune donnée d'erreur ne quitte AWS
  `ca-central-1`. Aucun DPA tiers à négocier.
- **Fonctionnalités complètes** : regroupement, breadcrumbs, source maps,
  release tracking, performance monitoring, replays (désactivés par
  défaut — voir négatif).
- **Cohérence AWS** : même compte, IAM, VPC, observabilité (les métriques
  Sentry exportées vers Grafana Cloud via OTel si besoin).
- **Pas de coûts récurrents** vendeur (Sentry Cloud business plan ~80
  USD/utilisateur/mois pour les fonctionnalités équivalentes).

**Négatives** :
- **Charge ops** : maintenance Sentry (upgrades, ~tous les 3 mois pour
  les patches sécurité), backups DB, monitoring de Sentry lui-même.
  Estimation 2-4 h/mois.
- **Setup initial** : ~1-2 jours pour adapter le docker-compose officiel
  en CDK ECS, configurer DB et ClickHouse, validation end-to-end.
- **Session Replay risque Loi 25** : la fonctionnalité Replay enregistre
  des frames DOM — potentiellement du PII. **DÉSACTIVÉE par défaut** ;
  toute activation future doit faire l'objet d'un ADR séparé avec analyse
  d'impact Loi 25 et configuration de masquage stricte.
- **Pas d'intégration Slack/Discord clé-en-main** comme Sentry Cloud — à
  configurer manuellement (webhooks).

---

## Alternatives considérées

### Sentry Cloud (organisation EU)

- **Avantages** : DX optimal, zéro ops, intégrations clé-en-main.
- **Pourquoi rejetée** : Sentry SaaS organisation EU est dans des centres
  de données européens (Allemagne) — pas canadiens. La résidence Loi 25
  exige données au Canada (ou DPA + clauses contractuelles équivalentes
  RGPD-style). Réouvrir si Sentry lance une région CA.

### Sentry Cloud (organisation US)

- **Pourquoi rejetée** : violation directe Principe II.

### Highlight.io

- **Avantages** : session replay intégré, plus moderne.
- **Pourquoi rejetée** : (1) US-based sans CA region, (2) le session
  replay nécessite une analyse Loi 25 profonde — enregistrer le DOM rendu
  d'un voyageur en train de remplir son brief = PII massif.

### Aucun outil dédié (logs Pino → Grafana Cloud uniquement)

- **Pourquoi rejetée** : les logs Pino ne regroupent pas les erreurs
  identiques, n'ont pas de source maps déminifiées, n'ont pas de breadcrumbs
  cliquables, n'ont pas de release tracking. Débugger un crash en prod sans
  ces outils = beaucoup plus de temps en investigation.

### Bugsnag, Rollbar, Raygun

- Tous US/AU-based sans CA region. Même raison de rejet.

---

## Plan de mise en place

1. **J-7** : déployer Sentry self-hosted dans un environnement staging
   AWS, valider end-to-end depuis Next.js + NestJS + workers.
2. **J-3** : configurer les `beforeSend` hooks PII, tester le scrubbing
   sur un workflow complet (intake → matching → conformité).
3. **J-0** : déployer en prod, validation, monitoring 7 jours.
4. **J+7** : revue : volume d'erreurs, faux positifs, qualité du
   regroupement. Ajustements.

Coût estimé : ~50-80 USD/mois (Fargate + RDS + ClickHouse + ALB).

---

## Plan de migration vers Sentry Cloud (si CA region un jour disponible)

1. Nouvel ADR remplaçant celui-ci.
2. Dual-export pendant 30 jours.
3. Comparaison des deux backends (fidélité, performance, coût).
4. Bascule applicative (DSN).
5. Décommissionner le self-hosted après période de validation.

---

## Références

- [Constitution v2.1.0](../../.specify/memory/constitution.md), Principe II (Loi 25), Principe X (Fiabilité)
- [Sentry self-hosted documentation](https://develop.sentry.dev/self-hosted/)
- [Sentry — Scrubbing sensitive data](https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/)
