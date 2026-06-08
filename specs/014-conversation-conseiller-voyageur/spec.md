# Feature Specification: Conversation conseiller ↔ voyageur (post-acceptation)

**Feature Branch**: `014-conversation-conseiller-voyageur`

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "Conversation conseiller ↔ voyageur post-acceptation (feature roadmap 013, module matching). Une fois qu'un conseiller a accepté un lead (012), un fil textuel structuré s'ouvre entre ce conseiller et le voyageur du brief. Messages texte + pièces jointes (devis PDF transmis tels quels). Anti-marketplace strict (ADR-0002) : aucun paiement, aucun montant, aucun lien de réservation ; règlement hors plateforme. Re-filtrage verified, cascade Loi 25, idempotence, une notification par destinataire."

## Contexte produit

La boucle économique relie un voyageur (auteur d'un brief) à des conseillers vérifiés
via le matching (011) puis les leads + machine d'état (012). Quand un conseiller **accepte**
un lead, il faut un canal pour qu'il échange avec le voyageur : préciser le projet,
envoyer un devis (PDF), répondre aux questions. Aujourd'hui ce canal n'existe pas — la
boucle s'arrête à l'acceptation.

Cette feature ouvre un **fil de conversation** par couple (conseiller × lead accepté).
Conformément à [ADR-0002](../../docs/adr/0002-pas-de-cta-contact-direct.md) et au
Principe I (anti-marketplace), **la plateforme ne participe à aucune transaction** :
les devis sont des fichiers transmis tels quels, aucun montant n'est structuré ni traité,
et le règlement se fait directement entre le voyageur et le conseiller, hors plateforme.
La machine d'état du lead (012) reste la source de vérité du cycle ; cette feature ne
ré-implémente aucune transition.

## Clarifications

### Session 2026-06-07

- Q: Qui peut joindre des fichiers au fil ? → A: **Les deux parties** — le conseiller (ex. devis PDF) et le voyageur (ex. documents de référence). Les fichiers sont transmis **tels quels** (aucune extraction, aucun montant structuré). Une mise en garde Loi 25 invite à ne pas transmettre de données sensibles inutiles. Types/poids restreints (cf. FR-008).
- Q: Quand le fil s'ouvre-t-il et reste-t-il modifiable ? → A: Il s'ouvre à la transition **« accepté »** du lead (012). L'**écriture** est permise tant que le lead est dans un état post-acceptation non terminal-négatif (`accepté`, `devis_envoyé`, `réservation_confirmée`) **et** que le conseiller est **vérifié**. Il passe en **lecture seule** si le lead devient `refusé` ou `perdu`. Le fil reste toujours **consultable** (audit), sauf anonymisation Loi 25.
- Q: Le voyageur peut-il écrire à un conseiller avant acceptation ? → A: **Non.** Seul l'état « accepté » ouvre un fil. Aucun message possible avant acceptation (cohérent avec le modèle de lead, anti-spam, anti-contournement de l'intake).
- Q: Plusieurs conseillers acceptent le même brief ? → A: **Un fil distinct par couple (conseiller × lead)**. Le voyageur peut converser séparément avec chacun ; les fils sont cloisonnés (un conseiller ne voit jamais le fil d'un autre).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Échanger des messages texte après acceptation (Priority: P1) 🎯 MVP

Lorsqu'un conseiller a **accepté** un lead, un fil s'ouvre entre lui et le voyageur du
brief. Chacun peut **envoyer et lire des messages texte** horodatés, dans l'ordre. À
chaque nouveau message, **le destinataire** (et lui seul) est notifié. Le fil affiche en
permanence la mention anti-transaction.

**Why this priority**: C'est le maillon manquant de la boucle économique — sans canal
d'échange après acceptation, le lead accepté ne se concrétise pas. Livré seul, il permet
déjà au conseiller et au voyageur de dialoguer.

**Independent Test**: Sur un lead à l'état `accepté`, envoyer un message côté conseiller →
vérifier qu'il apparaît dans le fil, horodaté, et qu'une notification (et une seule) part
vers le voyageur ; répondre côté voyageur → même vérification en sens inverse.

**Acceptance Scenarios**:

1. **Given** un lead `accepté` (conseiller vérifié), **When** le conseiller envoie un message texte, **Then** le message est persisté, horodaté, visible dans le fil, et **une** notification part vers le voyageur (jamais vers d'autres conseillers).
2. **Given** le même fil, **When** le voyageur répond, **Then** le message est ajouté dans l'ordre et **une** notification part vers le conseiller.
3. **Given** un lead **non** accepté (ex. `envoyé`/`vu`), **When** une partie tente d'ouvrir/écrire un fil, **Then** c'est refusé (aucun fil avant acceptation).
4. **Given** un même brief avec deux conseillers ayant accepté, **When** le voyageur écrit dans l'un des fils, **Then** seul ce conseiller le reçoit ; l'autre fil reste cloisonné.
5. **Given** un envoi re-soumis (même clé d'idempotence), **When** il est rejoué, **Then** aucun message en double n'est créé.

---

### User Story 2 - Joindre des fichiers (devis PDF) transmis tels quels (Priority: P2)

Le conseiller peut joindre un **devis (PDF)** à un message ; le voyageur peut joindre des
**documents de référence**. Les fichiers sont stockés en **région canadienne** et
**transmis tels quels** : la plateforme n'extrait, ne calcule et n'affiche **aucun
montant**, et ne propose **aucun champ de paiement ni lien de réservation**. La mention
« La plateforme ne participe pas à la transaction… » est rappelée.

**Why this priority**: Le devis est l'objet central de la suite de la relation, mais il
doit rester **hors transaction** (Principe I). Dépend du fil (US1).

**Independent Test**: Joindre un PDF côté conseiller → vérifier qu'il est stocké (région
canadienne), téléchargeable par le voyageur tel quel, sans aucun montant structuré ni
champ de paiement dans l'UI ni dans les données.

**Acceptance Scenarios**:

1. **Given** un fil actif, **When** le conseiller joint un PDF conforme (type/poids autorisés), **Then** la pièce jointe est stockée, associée au message, et téléchargeable par le voyageur **telle quelle**.
2. **Given** un fichier de type non autorisé ou trop volumineux, **When** la partie tente de le joindre, **Then** l'envoi est refusé avec un message clair, sans bloquer le fil.
3. **Given** une pièce jointe, **When** on inspecte le message et les données du fil, **Then** **aucun montant**, **aucun champ de paiement**, **aucun lien de réservation interne** n'est présent.
4. **Given** n'importe quel fil, **When** il est affiché, **Then** la mention permanente « La plateforme ne participe pas à la transaction. Toute soumission et tout paiement se font directement entre vous et le conseiller. » est visible.

---

### User Story 3 - Conformité dynamique, vie privée et résilience (Priority: P3)

Le système garantit qu'un conseiller **devenu non vérifié** ne peut plus écrire, que
l'**effacement Loi 25** d'un voyageur (ou d'un conseiller) se propage au fil et aux pièces
jointes **sans détruire la piste d'audit**, que le fil passe en **lecture seule** quand le
lead est terminal-négatif, et que les notifications **survivent aux pannes**.

**Why this priority**: Exigences non négociables (Principes I, II, X) durcissant un flux
déjà fonctionnel (US1/US2).

**Independent Test**: Révoquer un conseiller → tenter un envoi → refusé. Anonymiser un
voyageur → vérifier que le contenu PII du fil + pièces jointes est neutralisé tandis que
la trace d'audit (existence, horodatages) subsiste. Simuler une panne courriel → reprise
sans perte ni doublon.

**Acceptance Scenarios**:

1. **Given** un conseiller dont le statut devient non vérifié, **When** il tente d'envoyer un message, **Then** c'est refusé (re-filtrage `verified` dynamique).
2. **Given** un lead qui passe à `refusé` ou `perdu`, **When** une partie tente d'écrire, **Then** le fil est en **lecture seule** (consultation possible, écriture refusée).
3. **Given** un voyageur exerçant son droit à l'effacement, **When** l'anonymisation s'exécute, **Then** le contenu PII des messages et les pièces jointes liées sont neutralisés/supprimés, **tandis que** la piste d'audit (métadonnées non-PII) est préservée.
4. **Given** le service de courriel indisponible, **When** une notification doit partir, **Then** elle est retentée jusqu'au succès, sans doublon perçu (livraison au moins une fois + idempotence destinataire).

---

### Edge Cases

- **Écriture sur lead non accepté ou terminal-négatif** : refusée (US1-3, US3-2).
- **Conseiller révoqué en cours de fil** : écriture bloquée, fil consultable (US3-1).
- **Doublon d'envoi** (même clé d'idempotence) : pas de message en double (US1-5).
- **Pièce jointe non conforme** (type/poids) : refus propre, fil intact (US2-2).
- **Anonymisation Loi 25** d'une partie : PII du fil + pièces jointes neutralisées, audit préservé (US3-3).
- **Cloisonnement multi-conseillers** : aucun conseiller ne voit le fil d'un autre (US1-4).
- **Message vide / trop long** : validation (refus message vide ; longueur max raisonnable).
- **Tentative d'insérer un montant/lien de paiement dans le texte** : aucun traitement transactionnel — le texte reste du texte libre, la plateforme ne le structure ni ne l'interprète comme une transaction (la mention anti-transaction reste affichée).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT ouvrir un **fil de conversation** par couple (conseiller × lead) **au moment où le lead passe à `accepté`** (transition de 012), et seulement à ce moment.
- **FR-002**: Le système DOIT permettre au conseiller et au voyageur d'un fil d'**envoyer et lire des messages texte** horodatés, conservés dans l'ordre.
- **FR-003**: À chaque nouveau message, le système DOIT notifier **uniquement le destinataire** (jamais une notification groupée, jamais d'autres conseillers) — **un job de notification par destinataire** (Principe X).
- **FR-004**: L'envoi de message DOIT être **idempotent** (une clé d'idempotence par envoi) : un rejeu ne crée pas de doublon.
- **FR-005**: Le système NE DOIT autoriser l'écriture QUE si (a) le lead est dans un état post-acceptation non terminal-négatif (`accepté`, `devis_envoyé`, `réservation_confirmée`) ET (b) le conseiller est **vérifié au moment de l'action** (re-filtrage dynamique). Sinon, le fil est en **lecture seule**.
- **FR-006**: Les fils DOIVENT être **cloisonnés** : chaque partie n'accède qu'aux fils qui la concernent ; un conseiller ne voit jamais le fil d'un autre conseiller pour le même brief.
- **FR-007**: Le système DOIT permettre de joindre des **fichiers** à un message (conseiller : ex. devis PDF ; voyageur : documents de référence), stockés en **région canadienne** (S3 ca-central-1, ADR-0001) et **transmis tels quels**.
- **FR-008**: Le système DOIT **valider les pièces jointes** (types autorisés — au moins PDF et images courantes — et taille maximale), et refuser proprement les fichiers non conformes sans bloquer le fil.
- **FR-009**: Le système NE DOIT enregistrer, structurer ou afficher **aucun montant**, **aucun champ de paiement**, **aucun lien de réservation interne** (Principe I, ADR-0002). Un devis est un fichier opaque, jamais un objet transactionnel.
- **FR-010**: Chaque fil DOIT afficher une **mention permanente** : « La plateforme ne participe pas à la transaction. Toute soumission et tout paiement se font directement entre vous et le conseiller. » (FR-CA).
- **FR-011**: Lorsqu'une partie est anonymisée (Loi 25), le système DOIT **neutraliser/supprimer** le contenu PII de ses messages et les pièces jointes associées, **tout en préservant la piste d'audit** (existence du fil, horodatages, métadonnées non-PII).
- **FR-012**: Les notifications de message DOIVENT suivre un **acheminement résilient** (livraison au moins une fois, reprise après panne du courriel) sans doublon perçu.
- **FR-013**: Le contenu utilisateur (copie d'interface, notifications, mention anti-transaction, erreurs) DOIT être en **FR-CA**, clés i18n en place pour l'EN futur (024).
- **FR-014**: Le système DOIT exposer le fil et ses actions à la fois comme **use cases + port public** ET comme **endpoints HTTP authentifiés**, consommables par le dashboard conseiller (014) et l'espace voyageur (015). Cette feature livre le backbone + une UI minimale ; elle ne ré-implémente pas les vues complètes de 014/015.
- **FR-015**: Le système NE DOIT PAS ré-implémenter la machine d'état du lead : il **lit** l'état/éligibilité via l'interface publique de 012 (`MatchingLeadQueryPort`) et n'écrit pas de transition de lead.
- **FR-016**: La communication **voyageur** (authentification, accès au fil côté voyageur) s'appuie sur le module identité/espace voyageur ; les notifications transitent par le module 003 (SES). Cette feature ne réimplémente ni l'auth ni l'envoi de courriel.
- **FR-017**: Les messages DOIVENT être validés (refus d'un message vide ; longueur maximale raisonnable) ; les actions d'écriture exigent une **autorisation** (la partie est bien membre du fil).

### Key Entities *(include if feature involves data)*

- **Conversation (fil)** : canal entre un conseiller et le voyageur d'un lead accepté. Attributs : référence au lead (012) et au brief (neutralisable Loi 25), références conseiller/voyageur, statut d'écriture dérivé (actif / lecture seule), horodatage d'ouverture. Un fil par couple (conseiller × lead).
- **Message** : auteur (conseiller / voyageur), corps texte, horodatage, clé d'idempotence, références éventuelles de pièces jointes. Conservé dans l'ordre.
- **Pièce jointe** : fichier stocké en région canadienne, métadonnées (nom, type, taille), **aucune donnée transactionnelle ni montant**. Neutralisable/supprimable Loi 25.
- **Notification de message** : intention d'avertir le destinataire d'un nouveau message, clé d'idempotence (destinataire × message), statut d'acheminement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % des messages envoyés dans un fil éligible sont persistés, horodatés et visibles par les deux parties, dans l'ordre d'envoi.
- **SC-002**: Chaque nouveau message déclenche **exactement une** notification vers le destinataire (ni zéro, ni doublon), vérifié par test d'invariant.
- **SC-003**: **0** fil, message ou pièce jointe ne contient de montant, de champ de paiement ou de lien de réservation interne (contrôle automatisé, invariant ADR-0002).
- **SC-004**: Un conseiller non vérifié, ou un lead terminal-négatif, n'autorise **aucune** écriture dans 100 % des cas testés (fil en lecture seule).
- **SC-005**: Aucun message ne peut être créé sur un lead **non accepté** (100 % des tentatives refusées).
- **SC-006**: Après anonymisation Loi 25 d'une partie, **0** message/pièce jointe ne permet de retrouver sa PII, tandis que **100 %** de la piste d'audit (existence, horodatages) reste consultable.
- **SC-007**: Les fils sont cloisonnés : **0** fuite inter-conseillers sur des tirages de test (un conseiller n'accède jamais au fil d'un autre).
- **SC-008**: En charge nominale, le délai **p95 d'envoi d'un message (endpoint synchrone)** est **< 800 ms** (SLO Principe X) ; le délai p95 entre l'envoi et la mise en file de la notification est **< 5 s**.
- **SC-009**: Un envoi rejoué (même clé d'idempotence) ne crée **jamais** de message en double (test d'invariant).

## Assumptions

- **Déclencheur unique** : l'ouverture du fil est pilotée par la transition `accepté` du lead (012) ; cette feature consomme l'événement/état via l'interface publique de 012, elle ne recalcule rien.
- **Source de vérité du cycle** : la machine d'état du lead (012) ; la conversation n'écrit pas de transition de lead. Une réservation reste un marqueur déclaratif sans donnée transactionnelle.
- **Identité & courriel** : l'authentification des parties provient du module identité (006/007 + espace voyageur) ; les courriels transitent par 003 (SES ca-central-1). Réutilisés, non réimplémentés.
- **Stockage des pièces jointes** : AWS S3 ca-central-1 (ADR-0001), accès via URL signée à durée limitée ; pas d'antivirus/OCR (différé Tier 5).
- **Données sensibles** : la plateforme déconseille (mention Loi 25) la transmission de documents sensibles ; le filtrage fin de contenu sensible est hors périmètre V1.
- **UI** : cette feature livre le backbone (use cases, port public, endpoints) + une **UI minimale** de fil ; les intégrations riches arrivent avec le dashboard conseiller (014) et l'espace voyageur (015).
- **Rétention** : fils, messages et pièces jointes suivent le tableau de rétention de la constitution ; l'audit Loi 25 est préservé après anonymisation.
- **Volume** : dimensionné pour le régime nominal de démarrage (quelques fils actifs simultanés), sans exigence de débit massif au-delà des SLO généraux.
