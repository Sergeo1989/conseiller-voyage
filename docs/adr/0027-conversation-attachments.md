# ADR-0027 — Pièces jointes de conversation : stockage anti-transaction, URL signées, effacement Loi 25

**Date** : 2026-06-08
**Statut** : accepté (implémenté feature 013, 2026-06-08)
**Décideurs** : équipe technique
**Spec lié** : [014-conversation-conseiller-voyageur/spec.md](../../specs/014-conversation-conseiller-voyageur/spec.md), FR-008 + FR-011
**Plan lié** : [014-conversation-conseiller-voyageur/plan.md](../../specs/014-conversation-conseiller-voyageur/plan.md), Constitution Check Principes I + II + IX
**Contrat lié** : [014-conversation-conseiller-voyageur/contracts/notifications-and-storage.md](../../specs/014-conversation-conseiller-voyageur/contracts/notifications-and-storage.md)

---

## Contexte

La conversation conseiller ↔ voyageur (013) permet l'échange de fichiers — au
premier chef le **devis** que le conseiller transmet. Contraintes croisées :

- **Principe I / ADR-0002 (anti-marketplace)** : la plateforme ne participe
  jamais à la transaction. Le devis ne doit donc porter **aucun montant
  structuré**, aucun champ de prix/paiement/réservation. C'est un fichier
  opaque transmis tel quel ; le règlement se fait hors plateforme.
- **Principe II / Loi 25** : les fichiers contiennent de la PII (nom du
  voyageur, itinéraire, parfois coordonnées). Données en **région canadienne**,
  effacement propagé, **piste d'audit préservée**.
- **Principe IX (sécurité)** : pas d'accès public aux objets ; le binaire ne
  doit pas transiter par l'API (coût, surface d'attaque, mémoire).

## Décision

### 1. Stockage objet S3 ca-central-1, métadonnées seules en DB

Les binaires vivent sur **AWS S3 ca-central-1** (bucket
`AWS_S3_BUCKET_CONVERSATIONS`, ADR-0001). La table `ConversationAttachment` ne
stocke que des **métadonnées** : `fileName`, `mimeType`, `sizeBytes`, `s3Key`,
`status`, `createdAt`, `deletedAt`. **Aucun champ monétaire** — vérifié par un
test d'invariant automatisé (T038, rejet automatique à la revue si violé).

### 2. Le binaire ne transite jamais par l'API — flux pré-signé en 3 temps

1. `POST …/attachments` : le serveur **valide** `mimeType`/`sizeBytes`
   (`validateAttachment`, domaine pur), crée la pièce en `pending_upload` et
   renvoie une **URL PUT pré-signée** (TTL 5 min).
2. Le client **PUT** le fichier directement vers S3.
3. `POST …/finalize` : le serveur passe la pièce à `ready` (visible dans le fil).

La lecture se fait via `GET …/url` qui renvoie une **URL GET signée courte**
(TTL 2 min, `ResponseContentDisposition` pour conserver le nom d'origine),
**uniquement pour un membre du fil**. Aucun objet n'est jamais public.

> Note d'implémentation : `s3Client` est configuré en
> `requestChecksumCalculation: WHEN_REQUIRED` (sinon le header de checksum CRC32
> ajouté par AWS SDK v3 casse les PUT pré-signés). Compatible LocalStack (dev).

### 3. Types restreints + taille bornée

`ALLOWED_ATTACHMENT_MIME` = `application/pdf`, `image/png`, `image/jpeg`,
`image/webp` ; `MAX_ATTACHMENT_BYTES` = 10 Mo. Validation dans le **domaine**
(fonction pure `validateAttachment`), donc testée et réutilisable côté upload.

### 4. Effacement Loi 25 (cascade, audit préservé)

`AnonymizeConversationLoi25` :
- supprime l'**objet S3** (`deleteObject`, best-effort — l'effacement DB aboutit
  même si l'objet manque déjà) puis pose `deletedAt` sur la métadonnée ;
- met le **corps des messages à `null`** ;
- neutralise les **références voyageur** du fil (`briefId`, `voyageurRef` → null).

Les **lignes, ids et horodatages sont conservés** (piste d'audit). L'opération
est **idempotente** : un second passage ne re-supprime rien.

## Conséquences

**Positif**
- Anti-marketplace garanti structurellement (aucun champ montant + test d'invariant).
- Surface API réduite : le binaire ne transite pas par le serveur.
- Vie privée : accès strictement membre, URL éphémères, effacement Loi 25 complet.
- Région canadienne respectée (S3 ca-central-1).

**Négatif / dette assumée**
- **Scan antivirus différé** (Tier 5) — risque documenté (contrat S6). Les types
  sont restreints en attendant ; pas de scan de contenu au dépôt.
- L'expiration de l'URL pré-signée d'upload (5 min) peut être courte pour de très
  gros fichiers sur réseau lent ; relancer la demande d'URL au besoin.
- Pas de quota global par fil/jour à ce stade (anti-abus borné au type/poids).

## Alternatives écartées

- **Stocker le binaire en DB / le faire transiter par l'API** : coût mémoire,
  surface d'attaque, et pression sur la base — écarté.
- **Bucket public + URL stable** : viole Principe IX (pas d'accès public) — écarté.
- **Montant structuré du devis** (champ `amount`/`currency`) : viole Principe I /
  ADR-0002 — écarté ; le devis reste un fichier opaque.
