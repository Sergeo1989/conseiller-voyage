# ADR-0001 — Stockage objet en région canadienne pour les documents de conformité

**Date** : 2026-05-22
**Statut** : accepté
**Décideurs** : porteur produit, équipe technique
**Spec lié** : [001-conformite-module/spec.md](../../specs/001-conformite-module/spec.md), FR-020
**Plan lié** : [001-conformite-module/plan.md](../../specs/001-conformite-module/plan.md), Phase 0 — R1

---

## Contexte

Le module conformité collecte des documents personnels sensibles (certificats
provinciaux CCV/TICO, preuves d'affiliation, pièces d'identité indirectes
via les informations sur les permis). Ces documents :

- Sont des données personnelles au sens de la **Loi 25 (Québec)** —
  exigence de résidence canadienne (Principe II de la constitution,
  NON-NÉGOCIABLE).
- Ont une rétention de 24 mois après le dernier événement
  (constitution, tableau de rétention), avec anonymisation post-rétention.
- Sont consultés uniquement par le conseiller propriétaire et un admin
  authentifié + MFA.
- Pèsent au maximum 5 MB × 5 fichiers par soumission (spec FR-021).

Le besoin technique : un service de stockage objet S3-compatible, en région
canadienne, intégré au monorepo TypeScript / NestJS, avec URLs signées,
chiffrement au repos, et observabilité.

---

## Décision

**Adopter AWS S3 dans la région `ca-central-1` (Montréal)** comme stockage
objet principal pour tous les documents du module conformité.

Configuration :
- Bucket : `cv-conformite-prod` (un bucket par environnement : `dev`,
  `staging`, `prod`).
- Chiffrement au repos : **SSE-KMS** avec clé gérée dans AWS KMS
  `ca-central-1`, rotation annuelle automatique.
- Versioning activé.
- MFA Delete activé sur le bucket prod.
- Politique d'accès : aucun accès public ; lecture/écriture uniquement via
  URLs signées V4 de durée 5 minutes émises par le backend NestJS.
- Politique de cycle de vie : transition automatique vers Glacier Deep
  Archive après 24 mois sans accès (rétention conformité), suppression
  effective à la demande Loi 25 ou après la fin de la rétention 7 ans pour
  les pièces d'audit liées.
- Logs d'accès S3 (S3 Server Access Logging) activés et envoyés vers un
  bucket `cv-audit-logs` dédié.
- Lifecycle policy "abort-incomplete-multipart-upload" après 1 jour pour
  éviter les coûts résiduels.

---

## Conséquences

**Positives** :
- Conformité Loi 25 immédiate (AWS publie ses engagements de résidence
  contractuels en `ca-central-1`).
- SDK Node mature (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`)
  avec typings TypeScript et intégration directe avec OpenTelemetry.
- Coût négligeable au volume cible année 1 (~25 GB cumulés, < 10 USD/mois
  toutes opérations incluses).
- Open path vers AWS Bedrock `ca-central-1` si Claude / Anthropic est retenu
  comme fournisseur LLM par un ADR ultérieur (Principe V).
- Versioning + MFA Delete renforcent la conservation et empêchent une
  suppression accidentelle ou malveillante.

**Négatives** :
- Lock-in modéré sur AWS SDK. Mitigation : abstraction via le port
  `DocumentStoragePort` (Principe VIII) — toute migration future serait
  localisée à `infrastructure/s3-document-storage.ts`.
- Coût d'egress non nul si la donnée est consommée par un service hors AWS.
  Mitigation : la consultation des documents reste rare (admin uniquement)
  et passe par URLs signées directes (pas de proxy backend).
- Risque géopolitique théorique (CLOUD Act US) : la donnée est en région
  canadienne mais AWS reste une entreprise américaine. Mitigation acceptée
  pour le MVP ; ré-évaluation possible si une exigence souveraineté renforcée
  émerge (option de repli vers **OVH Object Storage Beauharnois** documentée).

---

## Alternatives considérées

### Cloudflare R2

- Avantages : API S3-compatible, pas d'egress, prix attractif.
- Pourquoi rejetée : R2 ne garantit pas la résidence régionale au niveau
  objet (politique de réplication globale possible). Non-conforme Principe II
  sans surcoût d'audit contractuel. Ré-évaluation possible si Cloudflare
  ajoute une garantie de résidence régionale stricte.

### Azure Blob Storage Canada Central

- Avantages : équivalent fonctionnel d'AWS, résidence canadienne garantie,
  intégration Azure si bascule globale vers Azure.
- Pourquoi rejetée : introduit Azure dans une stack majoritairement
  AWS-compatible, complexifie l'opérationnel sans bénéfice immédiat. Option
  valable si l'hébergement principal bascule vers Azure (réouvrir un ADR).

### OVH Object Storage Beauharnois (Québec)

- Avantages : centre de données au Québec, souveraineté plus forte (juridiction française pour OVH, données physiquement au Québec).
- Pourquoi rejetée pour le MVP : écosystème SDK Node moins mature, moins
  d'options d'intégration BullMQ / monitoring / KMS. **À retenir comme option
  de repli** si une exigence souveraineté renforcée émerge.

### Self-hosted MinIO sur VPS canadien

- Avantages : contrôle total, coût opérationnel marginal.
- Pourquoi rejetée : charge opérationnelle disproportionnée (mises à jour
  sécurité, backups, monitoring), pas d'expertise interne disponible. À
  réenvisager seulement si le coût AWS devient critique (> 10× le seuil
  actuel).

---

## Plan de migration

Pas de migration nécessaire — première implémentation. Si un changement de
fournisseur est décidé ultérieurement :

1. Créer un nouvel ADR remplaçant celui-ci.
2. Implémenter un second adaptateur `infrastructure/<new-provider>-document-storage.ts` qui implémente le même `DocumentStoragePort`.
3. Mode dual-write transitoire le temps de migrer les objets existants.
4. Bascule de configuration via variable d'environnement.
5. Décommissionner l'ancien adaptateur après vérification.

---

## Références

- [Constitution v2.0.0, Principe II — Vie privée et Loi 25](../../.specify/memory/constitution.md)
- [AWS — Régions canadiennes](https://aws.amazon.com/about-aws/global-infrastructure/regions_az/)
- Loi modernisant des dispositions législatives en matière de protection des renseignements personnels (« Loi 25 »), Québec
- [Office de la protection du consommateur — agents de voyages](https://www.opc.gouv.qc.ca/)
