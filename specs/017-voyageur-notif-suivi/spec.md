# Feature Specification: Notifications + magic-link de suivi voyageur

**Feature Branch**: `017-voyageur-notif-suivi`

**Created**: 2026-06-16

**Status**: Draft

**Roadmap**: feature **010** (modules *préqualification* × *identité*, Scope S). S'appuie sur
**008** (brief + verify magic-link + page récap, livré) et **003** (notifications SES
ca-central-1, livré) ; consomme les événements de matching de **011/012**. Débloque **015**
(espace voyageur). Périmètre **MVP-1** (arbitré).

**Input**: User description: "Soumission + magic-link de suivi voyageur (010). Couche de
NOTIFICATION et de SUIVI côté voyageur que 008 n'a pas incluse : accusé d'activation,
notification proactive « vos conseillers vérifiés sont prêts » quand le brief est matché
(events 011/012, incl. partiellement/non matché), et magic-link de suivi durable/renvoyable.
Anti-marketplace (ADR-0002) : aucun contact direct conseiller. Loi 25 : région CA, pas de PII
conseiller superflue, cascade d'effacement. Fiabilité : 1 job/destinataire idempotent, mode
dégradé courriel. FR-CA + i18n. Le contenu de l'espace voyageur reste à 015."

## Clarifications

*(Aucune pour l'instant — `/speckit.clarify` à exécuter si souhaité. Les points sensibles
sont documentés en Assumptions avec un défaut raisonnable.)*

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Le voyageur est prévenu quand ses conseillers sont prêts (Priority: P1) 🎯 MVP

Après soumission et vérification de son brief (008), le voyageur **reçoit un courriel
proactif** dès que l'appariement aboutit : « Vos conseillers vérifiés sont prêts », avec un
**lien de suivi** qui le ramène à son récapitulatif / espace. Le système gère les trois
issues : **matché** (jusqu'à 3 conseillers prêts), **partiellement matché** (1–2 prêts), et
**non matché** (message rassurant « on continue de chercher », **jamais** un échec).

**Why this priority**: C'est ce qui **ferme la boucle côté voyageur** — sans cette
notification, le voyageur soumet un brief et ne sait jamais que ses conseillers sont prêts.
Cœur de la valeur et déblocage de 015.

**Independent Test**: Provoquer l'événement « brief matché » (011/012) → un courriel FR-CA
part vers le voyageur avec un lien de suivi, **sans** aucune coordonnée de conseiller. Idem
pour partiellement/non matché (ton rassurant). Couper le canal courriel → aucun blocage.

**Acceptance Scenarios**:

1. **Given** un brief activé qui devient **matché**, **When** l'événement de matching survient, **Then** le voyageur reçoit **un** courriel « conseillers prêts » avec un lien de suivi, sans coordonnée conseiller ni montant.
2. **Given** un brief **partiellement matché** (1–2 conseillers), **When** l'événement survient, **Then** le voyageur reçoit un courriel adapté (conseillers disponibles + suivi), sans ton d'échec.
3. **Given** un brief **non matché** (0 conseiller), **When** l'événement survient, **Then** le voyageur reçoit un message **rassurant** (« on continue de chercher »), jamais une erreur.
4. **Given** le même événement de matching rejoué (livraison at-least-once), **When** il est traité une 2e fois, **Then** **aucun** courriel en double n'est envoyé (idempotence).

---

### User Story 2 — Accusé d'activation du brief (Priority: P2)

Une fois son brief **vérifié et activé** (après le magic-link de vérification de 008), le
voyageur reçoit un **accusé** : « Votre demande est confirmée, nous cherchons vos conseillers
vérifiés ». Pose les attentes pendant la fenêtre entre activation et appariement.

**Why this priority**: Améliore l'expérience et la confiance (le voyageur sait que sa demande
est prise en charge), mais la valeur cœur reste US1. Distinct du courriel de **vérification**
de 008.

**Independent Test**: Activer un brief → un accusé FR-CA part, distinct du courriel de
vérification, sans donnée transactionnelle.

**Acceptance Scenarios**:

1. **Given** un brief qui passe à l'état **actif** (post-vérification), **When** l'activation survient, **Then** le voyageur reçoit **un** accusé de prise en charge (idempotent).

---

### User Story 3 — Revenir suivre son dossier via un lien durable (Priority: P2)

Le voyageur peut **revenir** consulter son dossier à tout moment via un **lien de suivi**
durable ; si le lien/la session a expiré, il peut **en demander un nouveau** (renvoi). Ce lien
de suivi est **distinct** du lien de vérification à usage unique de 008.

**Why this priority**: Garantit l'accès récurrent au suivi (le voyageur revient quand ses
conseillers sont prêts) ; réutilise l'infra magic-link de 008.

**Independent Test**: Depuis le courriel de suivi, ouvrir le lien → page récap accessible.
Lien expiré → possibilité d'en redemander un et d'accéder à nouveau.

**Acceptance Scenarios**:

1. **Given** un courriel de suivi reçu, **When** le voyageur clique le lien (valide), **Then** il accède à son récapitulatif / espace.
2. **Given** un lien de suivi **expiré**, **When** le voyageur demande un renvoi, **Then** un nouveau lien lui est envoyé et l'accès est rétabli.

---

### Edge Cases

- **Canal courriel indisponible (SES HS)** : la notification est mise en file et **réessayée** plus tard ; la soumission et l'appariement ne sont **jamais** bloqués (mode dégradé, Principe X).
- **Événement de matching rejoué** : aucun doublon (idempotence par événement source).
- **Re-appariement (supersession 012)** : ne pas spammer — notifier sur un **changement d'issue** (p. ex. non matché → matché), pas à chaque re-calcul identique.
- **Brief anonymisé / effacé (Loi 25)** pendant qu'une notification est en file : la notification en attente est **annulée**, aucune notification ultérieure n'est envoyée.
- **Brief non matché puis matché plus tard** : le voyageur reçoit la mise à jour « conseillers prêts ».
- **Lien de suivi expiré** : message clair + possibilité de renvoi (jamais de cul-de-sac).
- **Adresse courriel du voyageur invalide / bounce** : échec tracé (observabilité), pas de blocage du reste du système.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: À chaque transition d'appariement d'un brief (**matché** / **partiellement matché** / **non matché**, issue de 011/012), le système DOIT envoyer au voyageur **une** notification transactionnelle FR-CA, via le canal de notification existant (003).
- **FR-002**: La notification « conseillers prêts » DOIT contenir un **lien de suivi** ramenant le voyageur à son récap/espace, et NE DOIT **jamais** exposer de coordonnée de contact d'un conseiller ni inviter à un contact hors plateforme (anti-marketplace ADR-0002). Aucun montant/paiement/réservation.
- **FR-003**: Le cas **non matché** DOIT être communiqué comme un message **rassurant** (« on continue de chercher »), jamais comme un échec ou une erreur.
- **FR-004**: À l'**activation** du brief (post-vérification 008), le système DOIT envoyer au voyageur un **accusé** de prise en charge, **distinct** du courriel de vérification de 008.
- **FR-005**: Chaque notification DOIT être émise via **un envoi par destinataire**, **idempotent** : un même événement source ne produit **jamais** de notification en double (livraison at-least-once).
- **FR-006**: Si le canal courriel est indisponible, la notification DOIT être **mise en file et réessayée** ; la soumission et l'appariement NE DOIVENT **jamais** être bloqués par un échec de notification (mode dégradé).
- **FR-007**: Le **lien de suivi** DOIT être **durable et renvoyable** : le voyageur peut demander un nouveau lien si le précédent a expiré. Il est **distinct** du lien de vérification à usage unique (008).
- **FR-008**: Tout contenu et tout envoi de notification DOIVENT rester en **région canadienne** (Loi 25).
- **FR-009**: Les notifications NE DOIVENT PAS inclure de **PII de conseiller** au-delà du strict nécessaire, et **jamais** de coordonnée de contact.
- **FR-010**: Lorsqu'un brief est **anonymisé/effacé** (Loi 25), les notifications en attente pour ce brief DOIVENT être **annulées** et **aucune** notification ultérieure ne DOIT être envoyée.
- **FR-011**: La copie des notifications DOIT être **FR-CA** par défaut, **EN** via catalogues i18n.
- **FR-012**: Depuis un lien de suivi **valide**, le voyageur DOIT atteindre son récapitulatif ; un lien **expiré** DOIT permettre d'en **redemander** un (jamais de cul-de-sac).
- **FR-013**: Les issues de notification (envoyée / échec / réessayée / annulée) DOIVENT être **observables** (métriques) pour la boucle économique (ré-engagement voyageur).
- **FR-014**: En cas de **re-appariement** d'un brief déjà notifié, le système DOIT éviter les notifications redondantes (notifier sur un **changement d'issue**, pas sur un re-calcul identique).

### Key Entities *(include if feature involves data)*

- **Notification voyageur** : intention d'envoi rattachée à un brief — **type** (`accuse_activation` / `conseillers_prets` / `recherche_en_cours`), destinataire (le voyageur, via 008), **statut** (`en_attente` / `envoyée` / `échouée` / `annulée`), **clé d'idempotence** (événement source), horodatages. Append-only pour l'audit.
- **Lien de suivi** *(réutilise l'infra magic-link de 008)* : jeton durable de `purpose` « suivi/consultation », renvoyable, distinct du jeton de vérification one-time.
- **Événement source** *(011/012, existant)* : `voyageur.brief.matched` / `partially_matched` / `unmatched` — déclencheurs des notifications.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **100 %** des événements d'appariement (matché/partiel/non matché) produisent **exactement une** notification voyageur (0 doublon).
- **SC-002**: **0** coordonnée de contact de conseiller (ni montant/paiement) dans une notification — vérifiable (invariant anti-marketplace).
- **SC-003**: **100 %** des soumissions et appariements aboutissent même si le canal courriel est HS (mode dégradé, non bloquant).
- **SC-004**: **100 %** des voyageurs peuvent atteindre leur récap via le lien de suivi (lien expiré → renvoi fonctionnel).
- **SC-005**: Après anonymisation d'un brief, **0** notification ultérieure et **100 %** des notifications en attente annulées.
- **SC-006**: **100 %** des notifications traitées et envoyées en **région canadienne** (Loi 25).
- **SC-007**: Les issues de notification sont **observables** en continu (envoyée/échec/réessayée/annulée).
- **SC-008**: Le cas non matché est perçu comme **rassurant** (ton « on cherche »), validé en revue de copie — **0** formulation d'échec.
- **SC-009**: **Ré-engagement** : part des voyageurs qui reviennent via le lien de suivi après notification (métrique de boucle économique, suivie dès J1).

## Assumptions

- **Contenu de la notification « prêts » (défaut, à confirmer en revue)** : la copie indique **un nombre** de conseillers vérifiés prêts (p. ex. « jusqu'à 3 ») et renvoie au récap/espace, **sans nommer** les conseillers ni exposer leurs détails — minimisation Loi 25 + anti-marketplace. Le détail (mes 3 conseillers) vit dans l'**espace voyageur (015)**.
- **Déclenchement** : 010 **consomme** les événements d'appariement déjà publiés par 011/012 (bus `matching.events`) ; aucune nouvelle logique de matching.
- **Réutilise 003** : outbox + envoi SES ca-central-1 + pattern « un job par destinataire » (comme les notifications conseiller de 012), et **008** pour l'infra magic-link (lien de suivi) + la page récap (cible du lien).
- **Accusé d'activation** : envoyé **après** la vérification (activation), distinct du courriel de **vérification** de 008 (pas de double envoi à la soumission).
- **Re-appariement** : notifier seulement sur un **changement d'issue** (anti-spam) — défaut raisonnable, affinable au plan.
- **Hors périmètre** : le contenu de l'espace voyageur (mes 3 conseillers, conversation côté voyageur) = **feature 015** ; 010 ne fait que **notifier** et **ramener** le voyageur.
- **Consentement** : l'envoi de notifications transactionnelles au voyageur est couvert par le consentement d'intake existant (008/004) ; ce sont des notifications **transactionnelles** (pas marketing).
