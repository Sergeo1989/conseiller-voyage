# Feature Specification: Tableau de bord conseiller (mes leads, mes conversations)

**Feature Branch**: `015-dashboard-conseiller`

**Created**: 2026-06-08

**Status**: Draft

**Input**: User description: "Tableau de bord conseiller (feature roadmap 014, modules matching × identité ; Tier 2). Espace authentifié du conseiller vérifié réunissant Mes leads (liste + détail + actions de transition de 012) et Mes conversations (liste + fil + envoi de 013). Lecture exclusivement via les ports publics MatchingLeadQueryPort (012) et ConversationQueryPort (013) — aucune logique métier ré-implémentée. Anti-marketplace strict, Loi 25 (résumé non nominatif), cloisonnement, a11y. Couche interface/présentation : aucune nouvelle table ni machine d'état."

## Contexte

La boucle économique cœur amène un voyageur à décrire son projet (intake 008), le
matching (011) lui propose **3 conseillers vérifiés**, et la machine d'état de lead
(012) suit le cycle côté conseiller. Une fois un lead **accepté**, un fil de
conversation (013) s'ouvre. Jusqu'ici, le conseiller n'a **aucune interface unifiée**
pour voir ses leads, agir dessus, et dialoguer : tout existe en **backbone** (ports
publics + endpoints HTTP), mais sans vue.

Cette feature livre le **tableau de bord conseiller** : la couche
interface/présentation qui réunit *Mes leads* et *Mes conversations* dans l'espace
authentifié `(conseiller)`. Elle **ne ré-implémente aucune logique métier** : elle lit
via `MatchingLeadQueryPort` (012) et `ConversationQueryPort` (013), et délègue les
actions aux endpoints/use cases existants de 012/013.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consulter mes leads (Priority: P1) 🎯 MVP

En tant que **conseiller vérifié connecté**, je veux voir la **liste de mes leads**
(les projets de voyage pour lesquels le matching m'a proposé) avec leur **statut**
actuel et un **aperçu non nominatif** du projet, afin de décider rapidement lesquels
traiter — sans jamais accéder à des coordonnées de contact du voyageur.

**Why this priority**: Sans visibilité sur ses leads, le conseiller ne peut rien faire.
C'est la porte d'entrée du tableau de bord et le socle des autres parcours. Livrée
seule, elle apporte déjà de la valeur (le conseiller voit l'activité de son compte).

**Independent Test**: Connecté comme conseiller vérifié possédant des leads, ouvrir
*Mes leads* → la liste affiche uniquement **mes** leads, avec statut + résumé non
nominatif (destinations, période, type), paginée, sans aucune PII de contact ni
montant ; ouvrir un lead → la vue détail montre l'historique de statut.

**Acceptance Scenarios**:

1. **Given** un conseiller vérifié avec 3 leads à divers statuts, **When** il ouvre *Mes leads*, **Then** ses 3 leads s'affichent avec statut et résumé non nominatif, triés par récence, paginés.
2. **Given** la liste de leads, **When** le conseiller ouvre un lead, **Then** le détail affiche le résumé du brief, le statut courant et l'historique horodaté des transitions — sans nom, courriel, téléphone ni adresse du voyageur.
3. **Given** un conseiller A et un lead appartenant au conseiller B, **When** A tente d'accéder à ce lead, **Then** l'accès est refusé (cloisonnement).
4. **Given** un lead dont le brief a été anonymisé (Loi 25), **When** le conseiller l'ouvre, **Then** le résumé est neutralisé sans erreur et l'historique de statut reste visible (audit).

---

### User Story 2 - Piloter le cycle de vie d'un lead (Priority: P2)

En tant que **conseiller vérifié**, je veux **agir sur un lead** depuis son détail
(l'**accepter**, le **refuser**, marquer **devis envoyé**, marquer **réservation
confirmée**, marquer **perdu**) afin de faire avancer le dossier — les actions
proposées dépendant du statut courant et de mon statut vérifié.

**Why this priority**: L'acceptation d'un lead débloque la conversation (013) et toute
la suite de la relation. C'est l'action à plus forte valeur, mais elle suppose US1
(voir le lead). Le pilotage s'appuie sur la machine d'état **déjà** implémentée (012).

**Independent Test**: Sur un lead au statut `vu`, l'action **Accepter** est proposée ;
l'exécuter → le statut passe à `accepté`, l'historique s'enrichit, et seules les
actions valides depuis le nouvel état restent proposées ; une action devenue invalide
(état modifié entre-temps) est refusée proprement (conflit), sans double effet.

**Acceptance Scenarios**:

1. **Given** un lead `vu` (conseiller vérifié), **When** le conseiller clique **Accepter**, **Then** le statut devient `accepté`, l'historique l'enregistre, et un fil de conversation devient disponible.
2. **Given** un lead `accepté`, **When** le conseiller marque **devis envoyé**, **Then** la transition est appliquée ; les actions affichées reflètent le nouvel état.
3. **Given** un lead dont l'état réel a changé depuis l'affichage, **When** le conseiller soumet une action basée sur l'ancien état, **Then** l'action est refusée comme **conflit** (aucun changement appliqué) et l'interface invite à rafraîchir.
4. **Given** un conseiller devenu **non vérifié**, **When** il tente une action sur un lead, **Then** l'action est refusée (re-filtrage dynamique).
5. **Given** une action déjà appliquée, **When** le conseiller la re-soumet (double-clic, rejeu réseau), **Then** aucun double effet n'est produit (idempotence).

---

### User Story 3 - Mes conversations (Priority: P3)

En tant que **conseiller vérifié**, je veux voir la **liste de mes conversations**
ouvertes et **dialoguer** dans un fil (lire les messages ordonnés, envoyer un message,
consulter et joindre des fichiers), afin d'accompagner le voyageur — la plateforme ne
participant jamais à la transaction.

**Why this priority**: La conversation n'a de sens qu'après acceptation (US2) et son
backbone est déjà livré (013). Elle complète le parcours mais n'est pas le strict
minimum pour un MVP de visibilité/pilotage.

**Independent Test**: Avec un lead accepté donc un fil ouvert, ouvrir *Mes
conversations* → le fil apparaît avec son statut d'écriture et l'horodatage du dernier
message ; ouvrir le fil → les messages s'affichent dans l'ordre, l'envoi fonctionne, la
mention de neutralité est visible en permanence, une pièce jointe se télécharge via un
lien à durée limitée.

**Acceptance Scenarios**:

1. **Given** un conseiller avec 2 fils ouverts, **When** il ouvre *Mes conversations*, **Then** ses fils s'affichent (dernier message, statut actif/lecture seule), triés par récence.
2. **Given** un fil actif, **When** le conseiller envoie un message, **Then** le message apparaît dans le fil et la mention « La plateforme ne participe pas à la transaction… » reste affichée.
3. **Given** un fil dont le lead est devenu `refusé`/`perdu`, **When** le conseiller l'ouvre, **Then** le fil est en **lecture seule** (consultation possible, envoi désactivé).
4. **Given** une pièce jointe (devis), **When** le conseiller l'ouvre, **Then** elle se télécharge via un lien à durée limitée ; **aucun** montant ni champ transactionnel n'est affiché.
5. **Given** un conseiller A, **When** il tente d'ouvrir le fil d'un conseiller B, **Then** l'accès est refusé (cloisonnement).

---

### Edge Cases

- **Aucun lead / aucune conversation** : afficher un état vide explicite et orientant
  (« Aucun lead pour le moment »), jamais une page en erreur.
- **Brief anonymisé Loi 25** : résumé non nominatif neutralisé, corps de message à
  blanc, pièces jointes indisponibles — l'historique/audit reste consultable.
- **Conseiller non vérifié au chargement** : le tableau de bord reste consultable
  (lecture), mais les actions d'écriture (transitions, envoi de message, pièces jointes)
  sont indisponibles, avec un message explicatif.
- **Désynchronisation d'état** (action sur état périmé) : conflit signalé, invitation à
  rafraîchir, aucun effet partiel.
- **Pagination** : grand nombre de leads/fils → pages stables et navigables au clavier.
- **Lien de pièce jointe expiré** : régénérer à la demande, message clair si indisponible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le tableau de bord DOIT être accessible uniquement à un **conseiller
  authentifié** ; un visiteur non connecté est redirigé vers la connexion.
- **FR-002**: Le système DOIT afficher la **liste paginée des leads du conseiller
  courant uniquement** (cloisonnement strict), avec pour chaque lead son **statut** de
  cycle de vie et un **résumé non nominatif** du brief (destinations, période, type de
  projet).
- **FR-003**: Le système NE DOIT JAMAIS exposer au conseiller de **PII de contact du
  voyageur** (nom, courriel, téléphone, adresse) ni aucun **identifiant nominatif**.
- **FR-004**: Le système DOIT afficher le **détail d'un lead** : résumé non nominatif,
  statut courant et **historique horodaté** des transitions.
- **FR-005**: Le système DOIT proposer, sur le détail d'un lead, **uniquement les
  actions de transition valides** depuis le statut courant (accepter, refuser, marquer
  devis envoyé, marquer réservation confirmée, marquer perdu) **et** seulement si le
  conseiller est **vérifié**.
- **FR-006**: L'exécution d'une action de transition DOIT déléguer à la **machine d'état
  existante (012)** sans la ré-implémenter, en transmettant l'**état attendu**
  (concurrence optimiste) ; un état périmé DOIT produire un **conflit** sans effet.
- **FR-007**: Les actions de transition DOIVENT être **idempotentes** côté interface (un
  rejeu / double soumission ne produit aucun double effet).
- **FR-008**: Le système DOIT afficher la **liste des conversations** du conseiller
  courant (cloisonnement), avec **statut d'écriture dérivé** (actif / lecture seule) et
  **horodatage du dernier message**.
- **FR-009**: Le système DOIT afficher un **fil de conversation** : messages **ordonnés
  chronologiquement**, composeur d'envoi (si écriture autorisée), et **pièces jointes**
  consultables via un **lien à durée limitée**.
- **FR-010**: Le système DOIT permettre l'**envoi d'un message** et l'**ajout d'une
  pièce jointe** en déléguant aux endpoints existants (013), avec validation côté serveur
  et **idempotence d'envoi**.
- **FR-011**: Le fil DOIT passer en **lecture seule** lorsque l'écriture n'est pas
  autorisée (lead terminal-négatif ou conseiller non vérifié) ; la **consultation** reste
  possible.
- **FR-012**: Le système DOIT afficher en **permanence** dans la vue conversation la
  mention de neutralité : « La plateforme ne participe pas à la transaction. Toute
  soumission et tout paiement se font directement entre vous et le conseiller. »
- **FR-013**: Le système NE DOIT afficher **aucun** champ transactionnel (montant, prix,
  paiement, lien de réservation) ; le devis est un **fichier opaque**.
- **FR-014**: Toute donnée affichée par le tableau de bord DOIT provenir des **ports
  publics** `MatchingLeadQueryPort` (012) et `ConversationQueryPort` (013) ou des
  endpoints conseiller existants — **aucune** requête directe à la base ni logique métier
  dupliquée.
- **FR-015**: Le système DOIT être **navigable intégralement au clavier** et conforme
  **WCAG 2.1 AA** (contraste, libellés, focus visibles, annonces lecteur d'écran).
- **FR-016**: Les pages du tableau de bord DOIVENT être **privées** (non indexées,
  `noindex`) et exiger une session valide à chaque accès.
- **FR-017**: Le système DOIT afficher des **états vides** explicites (aucun lead, aucune
  conversation) et des **messages d'erreur** clairs (conflit, action indisponible, lien
  expiré) sans jamais exposer de détail technique.
- **FR-018**: L'interface utilisateur DOIT être en **FR-CA par défaut**, avec support
  **EN** via i18n (aucun texte en dur).

### Key Entities *(include if feature involves data)*

> Cette feature **n'introduit aucune nouvelle entité persistée**. Elle consomme des
> **vues en lecture** déjà exposées par les ports publics.

- **Vue Lead (lecture)** : identifiant, position (1–3), statut de cycle de vie, résumé
  non nominatif du brief (destinations, période, type), horodatages, historique des
  transitions. Source : `MatchingLeadQueryPort` (012). Sans PII de contact.
- **Vue Conversation (lecture)** : identifiant, lead associé, statut d'écriture dérivé
  (actif / lecture seule), horodatage du dernier message. Source : `ConversationQueryPort`
  (013).
- **Vue Message (lecture)** : auteur (conseiller / voyageur), corps (null si anonymisé),
  horodatage, pièces jointes (nom, disponibilité — **aucune** donnée transactionnelle).
- **Action de transition** (commande) : verbe (accepter / refuser / marquer_*), état
  attendu, idempotence — déléguée aux endpoints de 012.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un conseiller voit **100 % de ses propres leads** et **0 %** des leads
  d'un autre conseiller (cloisonnement vérifié).
- **SC-002**: **0** donnée de contact nominative du voyageur et **0** champ
  transactionnel (montant/paiement/réservation) n'apparaît dans l'ensemble des écrans du
  tableau de bord (vérifié par revue + test d'invariant).
- **SC-003**: Depuis le détail d'un lead, le conseiller peut **accepter** un lead et
  ouvrir la conversation correspondante en **moins de 3 actions** (clics).
- **SC-004**: **100 %** des actions de transition soumises sur un état périmé sont
  refusées comme conflit, **sans** effet partiel ni double effet (idempotence +
  concurrence optimiste).
- **SC-005**: Les écrans du tableau de bord obtiennent **0 violation sérieuse** axe-core
  (WCAG 2.1 AA) et sont **entièrement utilisables au clavier**.
- **SC-006**: Un fil dont le lead est terminal-négatif s'affiche en **lecture seule**
  dans **100 %** des cas (envoi désactivé, consultation possible).
- **SC-007**: La mention de neutralité est visible dans **100 %** des vues de
  conversation.
- **SC-008**: Les vues *Mes leads* et *Mes conversations* présentent un rendu utile
  initial en **moins de 2 secondes** sur une connexion standard, dans les budgets Core
  Web Vitals du projet.

## Assumptions

- **Authentification et autorisation déjà en place** : la connexion conseiller (006,
  Auth.js v5 + RBAC), le middleware CGU B2B (004) et le filtrage du statut vérifié (001)
  sont **déjà** appliqués au route group `(conseiller)` ; cette feature s'y greffe.
- **Backbone livré** : les ports publics `MatchingLeadQueryPort` (012) et
  `ConversationQueryPort` (013) ainsi que les endpoints conseiller de transition (012) et
  de conversation (013) existent et sont la **source de vérité** ; le dashboard est une
  couche de présentation.
- **Pas de nouvelle persistance** : aucune table, migration, machine d'état ni stockage
  transactionnel n'est ajouté par cette feature.
- **Espace privé** : les pages sont authentifiées, non indexées ; SEO/SSG public n'est
  pas un objectif (contrairement aux pages publiques), mais la performance perçue (CWV)
  reste un objectif.
- **Réutilisation** : le slice front `features/conversation` (livré par 013) et le design
  system sont réutilisés ; un slice `features/leads` (ou équivalent) porte la partie leads.
- **Voyageur symétrique hors périmètre** : l'espace voyageur (mes 3 conseillers, suivi)
  relève de la feature 015 de la roadmap et n'est pas traité ici.
- **Notifications/temps réel hors périmètre** : le rafraîchissement est à la navigation /
  action ; pas de push temps réel des nouveaux messages dans cette itération.
