# ADR-0013 — Pepper HMAC-SHA-256 pour les hash d'adresses courriel (notifications)

**Statut** : Accepté
**Date** : 2026-05-27
**Feature concernée** : 003 (`specs/003-notifications-transactionnelles/`)

## Contexte

Le module `notifications` doit stocker l'historique d'envoi et la liste de suppression
sans conserver les adresses courriel en clair au-delà de leur utilité immédiate.
Deux besoins entrent en tension :

1. **Traçabilité durable** : la `suppression_list` et le journal d'audit doivent
   rester interrogeables longtemps (7 ans pour l'audit légal) pour retrouver si un
   email donné est supprimé, sans exposer l'adresse.
2. **Pseudonymisation Loi 25** : les données doivent être anonymisées après la durée
   de rétention ou sur demande d'effacement.

Un SHA-256 nu est exclu car il est vulnérable aux tables arc-en-ciel sur le domaine
fini et prévisible des adresses courriel (leçon extraite de la review adversariale de
la feature 002, finding B-1).

## Décision

`HMAC-SHA-256(emailCanonical, pepper)` avec un pepper unique stocké en AWS Secrets
Manager `ca-central-1` (`cv/notifications/email-hash-pepper`).

**Format du secret** :
```json
{ "current": "<base64-256-bits>", "previous": ["<old1>", ...] }
```

**Génération initiale** :
```bash
openssl rand -base64 32   # 256 bits cryptographiquement aléatoires
```

**Politique de rotation** :
- Pas de rotation programmée (J1) — rotation manuelle sur fuite avérée uniquement.
- Sur rotation : fenêtre double-pepper 30 jours (`current` et `previous` tous deux
  acceptés en lecture, `current` seul pour les nouvelles écritures).
- Les rows `notification_email_log` déjà effacées (Loi 25) **conservent leur hash
  sur l'ancien pepper** — l'email en clair ne pouvant être recalculé, le pepper
  précédent doit rester dans la liste `previous` indéfiniment.
- À terme, `previous` est un tableau (potentiellement 2-3 entrées sur 10 ans) ;
  la vérification boucle sur chaque pepper — coût O(n) négligeable.

**Cache** : lu au boot, rafraîchi sur `SIGUSR1` ou redémarrage ECS. Pas de
cache Secrets Manager d'1 h — la latence de boot est acceptable.

## Conséquences

**Positives** :
- Résistance aux rainbow tables même si la base Postgres est exfiltrée.
- Lookup `suppression_list` O(1) sur le hash (index unique).
- Conformité Loi 25 : l'adresse en clair n'est stockée que le temps de l'envoi ;
  le hash persiste pour la traçabilité anti-rebond.

**Négatives** :
- Si le pepper fuit, les hashes de la suppression list peuvent être réversés par
  brute-force (domaine d'entrée limité). Risque modéré — la suppression list n'est
  pas le dataset le plus sensible.
- Les rows effacées gardent leur hash ancien-pepper → obligation de conserver le
  tableau `previous` à vie. Dette acceptée comme propriété intrinsèque de la
  pseudonymisation.

## Alternatives considérées

- **SHA-256 nu** → rejeté (rainbow tables, finding B-1 review adversariale 002).
- **Rotation mensuelle automatique** → rejeté (re-hachage de millions de rows,
  bloquant pour le service, peu de gain marginal).
- **Pepper par tenant** → rejeté (multi-tenant hors scope).
- **Re-hash forcé en ignorant les rows effacées** → rejeté (brise l'audit
  anti-resoumission sur tout l'historique pré-rotation).
- **bcrypt / argon2** → rejeté pour ce cas d'usage (lookup O(n) sur toute la table,
  pas adapté aux jointures — HMAC suffit, le secret est le pepper, pas le hash).
