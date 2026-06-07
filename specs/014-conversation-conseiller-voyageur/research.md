# Research — Conversation conseiller ↔ voyageur (014)

Phase 0. Aucune `NEEDS CLARIFICATION` ouverte dans le spec ; ce document fige les choix
techniques et lève les ambiguïtés d'implémentation.

## R1 — Déclenchement de l'ouverture du fil

- **Décision** : ouverture **événementielle** à la transition `accepté` du lead. La feature
  012 émet déjà des transitions ; on ajoute un **consumer** (`lead-accepted.consumer`) qui
  crée le fil (conseiller × lead) **idempotemment**. Repli de robustesse : **création
  paresseuse** à la première lecture/écriture autorisée si le fil n'existe pas encore (le
  lead est lu `accepté` via `MatchingLeadQueryPort`).
- **Rationale** : découplage propre (012 ne connaît pas la conversation) ; l'idempotence
  évite les doublons de fil sur replay ; la création paresseuse couvre les races.
- **Alternatives rejetées** : faire écrire 012 dans la conversation (couple les modules,
  viole V) ; ouvrir le fil dès le matching (viole le déclencheur « accepté »).

## R2 — Stockage des pièces jointes

- **Décision** : fichiers sur **S3 ca-central-1** (ADR-0001). Upload via **URL pré-signée**
  (le client PUT directement vers S3, l'API ne relaie pas le binaire) ; lecture via **URL
  signée courte** (quelques minutes). Métadonnées (nom, type MIME, taille, clé S3) en DB.
  **Aucun montant, aucun champ transactionnel.**
- **Rationale** : conforme stack (S3 ca-central-1) ; pré-signature = pas de charge API sur
  le binaire + pas de fichier en webroot (IX) ; URL courtes limitent l'exposition.
- **Validation** : types restreints (au moins `application/pdf` + images courantes), taille
  max (ex. 10 Mo) — vérifiés **avant** signature d'upload et **confirmés** à la finalisation.
- **Alternatives rejetées** : stockage binaire en DB (anti-pattern, coût) ; relai via API
  (charge inutile) ; scan antivirus (différé Tier 5, risque noté).

## R3 — Notifications (1 par destinataire)

- **Décision** : **outbox DB** + **BullMQ**, **un job par destinataire** (jamais groupé),
  drainé vers **SES via le module 003**. Idempotence par couple (destinataire × message).
- **Rationale** : pattern hérité de 012 (LeadNotificationOutbox + job par destinataire) ;
  au moins une fois + dédup → pas de doublon perçu (X, FR-012).
- **Alternatives rejetées** : envoi synchrone dans l'endpoint (fragile si SES HS) ; une
  notification groupée (viole Principe X / FR-003).

## R4 — Garantie anti-transaction (ADR-0002)

- **Décision** : invariant **vérifié par test** : le modèle de données et l'UI ne contiennent
  **aucun** champ de montant/prix/paiement/lien de réservation ; un devis n'est qu'une
  **pièce jointe opaque**. Mention permanente affichée dans chaque fil (FR-010).
- **Rationale** : transforme la règle produit en garde-fou exécutable (VI/I, SC-003).

## R5 — Autorisation & cloisonnement

- **Décision** : chaque action vérifie que l'appelant est **membre du fil** (conseiller
  propriétaire OU voyageur du brief). Filtre **en couche DB** (requêtes scoping par
  participant) + vérification use case. Écriture conditionnée à `canWrite` (lead non
  terminal-négatif + conseiller vérifié).
- **Rationale** : empêche l'IDOR (IX) et garantit le cloisonnement inter-conseillers
  (FR-006, SC-007).

## R6 — Anonymisation Loi 25 (cascade)

- **Décision** : à l'anonymisation d'une partie (orchestrée par 023 / déclencheur module),
  un use case `anonymize-conversation-loi25` **neutralise** le corps des messages PII et
  **supprime** les objets S3 des pièces jointes liées, en conservant les **métadonnées
  d'audit** non-PII (existence, horodatages, compteur). Idempotent.
- **Rationale** : Principe II + préservation d'audit (FR-011, SC-006), cohérent 012.

## R7 — Cycle de vie du fil vs machine d'état du lead

- **Décision** : statut d'écriture **dérivé** (non stocké comme source) de l'état du lead lu
  via `MatchingLeadQueryPort` : écriture si `currentState ∈ {accepté, devis_envoyé,
  réservation_confirmée}` ET conseiller vérifié ; sinon **lecture seule**. La conversation
  n'écrit jamais de transition de lead (FR-015).
- **Rationale** : 012 reste l'unique source de vérité (III/V) ; pas de duplication d'état.

## Points ouverts (non bloquants)

- **ADR-0027** à rédiger : pièces jointes anti-transaction + URL signées + rétention/effacement.
- Scan antivirus des pièces jointes : différé (Tier 5) ; risque documenté dans le plan (IX).
