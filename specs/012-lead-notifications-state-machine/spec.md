# Feature Specification: Matching — notifications conseillers + machine d'état de lead

**Feature Branch**: `012-lead-notifications-state-machine`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "Feature 012 — Matching : notifications conseillers + machine d'état de lead. Consomme les 4 événements outbox de 011 sur le bus, notifie chaque conseiller du top 3 (un job par destinataire, idempotent), matérialise une entité lead par (conseiller × MatchingResultEntry) avec machine d'état envoyé→vu→accepté→refusé→devis_envoyé→réservation_confirmée→perdu, transitions append-only, anti-marketplace strict, re-filtrage verified dynamique, cascade Loi 25."

## Clarifications

### Session 2026-06-05

- Q: Re-matching admin (011 supersède un MatchingResult) — que deviennent les leads de l'ancien MatchingResult ? → A: Les leads non terminaux de l'ancien MR passent à `perdu` (motif système « re-matché », audit préservé) ; de nouveaux leads sont créés pour le nouveau top-3 (un conseiller ré-apparaissant reçoit un nouveau lead + une nouvelle notification). Pas de nouvel état.
- Q: Comment un lead passe-t-il à l'état `vu` ? → A: Automatiquement à la première consultation du lead par le conseiller (via l'endpoint de lecture), de façon idempotente (une relecture ne régresse pas).
- Q: Transitions concurrentes sur le même lead — quelle stratégie ? → A: Concurrence optimiste : une transition valide depuis l'état courant réussit, une transition concurrente partant d'un état devenu obsolète est rejetée ; les transitions « montantes » identiques sont idempotentes (no-op).
- Q: Événement `all_matches_revoked` — comment 012 le traite-t-il ? → A: Réutiliser l'alerte admin existante (011 émet l'événement, consommé par la file admin 008-US5). 012 ne notifie aucun conseiller pour ce cas et clôture les leads concernés en `perdu` ; pas de nouveau canal d'alerte admin dans 012.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Le conseiller est averti d'un nouveau lead (Priority: P1) 🎯 MVP

Lorsqu'un brief voyageur est matché (feature 011), chaque conseiller vérifié du top 3 reçoit **individuellement** un courriel l'informant qu'un projet de voyage correspond à son profil, avec un résumé non sensible du brief (destination, période approximative, type de projet) et un lien vers son espace conseiller. La plateforme ne divulgue **aucune coordonnée directe** du voyageur dans cette notification (anti-marketplace, ADR-0002).

**Why this priority**: C'est le déclencheur de toute la boucle économique. Sans notification, un matching calculé reste invisible des conseillers et aucun lead ne se concrétise. Livrable seul, il apporte déjà la valeur cœur « le bon conseiller apprend qu'il a une opportunité ».

**Independent Test**: Publier un événement `voyageur.brief.matched` sur le bus avec 3 conseillers vérifiés → vérifier que 3 notifications distinctes sont mises en file (une par conseiller), idempotentes (un replay du même événement ne reproduit pas de notification), et qu'aucune PII de contact voyageur n'est présente dans le contenu.

**Acceptance Scenarios**:

1. **Given** un brief matché avec 3 conseillers vérifiés, **When** l'événement `voyageur.brief.matched` est consommé, **Then** 3 notifications individuelles sont créées (une par conseillerId) et chacune référence le lead correspondant.
2. **Given** un événement déjà consommé (même `idempotencyKey`), **When** il est re-livré par le bus, **Then** aucune notification supplémentaire n'est créée (idempotence par conseiller × matchingResult).
3. **Given** un brief `partially_matched` (1 ou 2 conseillers), **When** l'événement est consommé, **Then** seuls les 1 ou 2 conseillers concernés sont notifiés.
4. **Given** un brief `unmatched` (0 conseiller), **When** l'événement est consommé, **Then** aucun conseiller n'est notifié et l'événement est tracé (la prise en charge admin du « non matché » reste celle de la feature 008).
5. **Given** un conseiller du top 3 dont le statut est devenu non vérifié entre le calcul et la notification, **When** l'événement est consommé, **Then** ce conseiller n'est pas notifié et l'exclusion est tracée.

---

### User Story 2 - Le cycle de vie du lead est suivi de bout en bout (Priority: P2)

Chaque conseiller notifié dispose d'un **lead** dont l'état évolue : `envoyé → vu → accepté / refusé`, puis si accepté `→ devis_envoyé → réservation_confirmée`, ou `→ perdu` à tout moment. Le conseiller (ou le système, pour certaines transitions automatiques) enregistre ces transitions, qui sont **horodatées et conservées de façon append-only** pour l'audit et le calcul des métriques de la boucle économique. Les transitions invalides (ex. `envoyé → réservation_confirmée` directement) sont refusées.

**Why this priority**: Alimente les métriques produit « % de leads acceptés » et « conversion lead → devis → réservation » (Principe VII), et prépare le tableau de bord conseiller (014). Dépend de US1 (le lead doit exister) mais testable indépendamment via les use cases de transition.

**Independent Test**: Créer un lead à l'état `envoyé`, appliquer une séquence de transitions valides → vérifier l'historique horodaté append-only ; tenter une transition invalide → vérifier le rejet sans mutation d'état.

**Acceptance Scenarios**:

1. **Given** un lead à l'état `envoyé`, **When** le conseiller consulte le lead, **Then** l'état passe à `vu` avec horodatage (transition idempotente : déjà `vu` ne régresse pas).
2. **Given** un lead à l'état `vu`, **When** le conseiller l'accepte, **Then** l'état passe à `accepté` ; **When** il le refuse, **Then** l'état passe à `refusé` (terminal).
3. **Given** un lead à l'état `accepté`, **When** le conseiller marque un devis transmis, **Then** l'état passe à `devis_envoyé` ; puis une réservation confirmée → `réservation_confirmée` (terminal positif).
4. **Given** un lead dans un état non terminal, **When** une transition non autorisée par la machine d'état est demandée, **Then** elle est rejetée et l'état + l'historique restent inchangés.
5. **Given** un lead à n'importe quel état non terminal, **When** le conseiller le marque `perdu`, **Then** l'état passe à `perdu` (terminal) avec horodatage.

---

### User Story 3 - Conformité dynamique, vie privée et résilience (Priority: P3)

Le système garantit en continu qu'aucun conseiller non vérifié n'agit sur un lead, que l'effacement Loi 25 du brief voyageur se propage aux leads (sans détruire la piste d'audit), que la cascade de révocation est traitée, et que les notifications survivent aux pannes (courriel ou bus indisponible).

**Why this priority**: Exigences non négociables (Principes I, II, X) mais qui s'appliquent sur le socle livré par US1/US2. Regroupées en P3 car elles durcissent un flux déjà fonctionnel.

**Independent Test**: Anonymiser un brief ayant des leads → vérifier que les pointeurs PII des leads sont neutralisés et que l'audit subsiste ; révoquer un conseiller puis tenter une action sur son lead → vérifier le refus ; simuler une panne courriel → vérifier la reprise sans perte ni doublon.

**Acceptance Scenarios**:

1. **Given** un brief voyageur avec des leads actifs, **When** le voyageur exerce son droit à l'effacement (brief anonymisé), **Then** les leads liés perdent leurs pointeurs vers la PII voyageur tandis que l'historique d'audit est préservé.
2. **Given** un conseiller dont le statut devient non vérifié, **When** il tente une transition sur son lead, **Then** l'action est refusée.
3. **Given** un `MatchingResult` dont les 3 conseillers ont été révoqués (`all_matches_revoked`), **When** l'événement est consommé, **Then** l'administration est alertée (et non les conseillers révoqués), conformément à la prise en charge prévue côté 008/011.
4. **Given** le service de courriel indisponible, **When** une notification doit partir, **Then** elle est retentée jusqu'au succès sans doublon (livraison au moins une fois + idempotence destinataire).

---

### Edge Cases

- **Doublon d'événement** : la même `idempotencyKey` re-livrée ne crée ni lead ni notification en double.
- **Conseiller révoqué entre calcul et notification** : exclu de la notification, exclusion tracée.
- **Brief anonymisé avant l'envoi de la notification** : la notification ne doit pas divulguer de PII ; le système n'émet pas une notification devenue caduque.
- **Transition concurrente** sur le même lead (deux actions simultanées) : concurrence optimiste — la transition partant de l'état courant réel réussit, l'autre est rejetée (relecture requise) ; une transition montante identique est un no-op idempotent (FR-020).
- **Brief re-matché** alors que des leads de l'ancien matching sont actifs : les leads non terminaux passent à `perdu` (motif système) et de nouveaux leads sont créés pour le nouveau top-3 (FR-018).
- **Atteinte d'un état terminal positif par un lead** : les leads frères du même brief restent indépendants (pas de clôture automatique — FR-016).
- **`devis_envoyé` / `réservation_confirmée`** : ce sont des marqueurs déclaratifs du conseiller — aucune donnée financière ni transactionnelle n'est gérée par la plateforme.
- **Notification d'un conseiller sans adresse courriel valide** : tracée comme échec non bloquant, n'empêche pas les autres destinataires.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Le système DOIT consommer les 4 événements de matching (`voyageur.brief.matched`, `voyageur.brief.partially_matched`, `voyageur.brief.unmatched`, `voyageur.brief.all_matches_revoked`) publiés par la feature 011 sur le bus interne.
- **FR-002**: Pour chaque conseiller vérifié présent dans un événement `matched`/`partially_matched`, le système DOIT produire une notification **individuelle** (jamais une notification groupée pour plusieurs conseillers).
- **FR-003**: La notification d'un conseiller DOIT être idempotente par couple (conseiller × MatchingResult) : un re-traitement de l'événement ne génère pas de notification additionnelle.
- **FR-004**: La notification DOIT être en français (FR-CA) et NE DOIT contenir **aucune coordonnée de contact direct du voyageur** (nom complet, courriel, téléphone, adresse) — uniquement un résumé non sensible et un lien vers l'espace conseiller (Principe I, ADR-0002).
- **FR-005**: Le système DOIT créer une entité **lead** par couple (conseiller × MatchingResultEntry) à l'état initial `envoyé`.
- **FR-006**: Le système DOIT implémenter la machine d'état `envoyé → vu → accepté → refusé → devis_envoyé → réservation_confirmée → perdu` avec les transitions autorisées définies, et DOIT rejeter toute transition non autorisée.
- **FR-007**: Chaque transition d'état DOIT être horodatée et persistée de façon **append-only** (aucune modification ni suppression rétroactive d'une transition passée).
- **FR-008**: Le système NE DOIT notifier, ni permettre d'action sur un lead, QUE pour des conseillers **vérifiés au moment de l'action** (re-filtrage dynamique du statut, cohérent avec la latence < 10 s des transitions négatives définie par 001).
- **FR-009**: Lorsqu'un brief voyageur est anonymisé (Loi 25), le système DOIT neutraliser les pointeurs vers la PII voyageur sur les leads associés tout en **préservant la piste d'audit** des transitions.
- **FR-010**: Le système DOIT alimenter les métriques de la boucle économique : taux de leads acceptés et conversion lead → devis → réservation, exploitables en observabilité.
- **FR-011**: Les notifications sortantes DOIVENT suivre un acheminement résilient (livraison au moins une fois, reprise après panne du service de courriel ou du bus) sans doublon perçu par le destinataire.
- **FR-012**: Le système DOIT tracer le cas `unmatched` (aucun conseiller notifié). Pour `all_matches_revoked`, le système NE DOIT notifier aucun conseiller et DOIT clôturer les leads concernés en `perdu` ; l'alerte administration **réutilise le mécanisme existant** (événement émis par 011, consommé par la file admin 008-US5) — 012 n'introduit pas de nouveau canal d'alerte admin.
- **FR-013**: Le système NE DOIT enregistrer **aucune donnée financière ou transactionnelle** ; `devis_envoyé` et `réservation_confirmée` sont des marqueurs déclaratifs sans montant ni paiement.
- **FR-014**: Le système DOIT exposer le cycle de vie du lead via une interface publique consommable par les features clientes (014 tableau de bord conseiller, 015 espace voyageur).
- **FR-015**: Le système DOIT exposer les actions conseiller à la fois comme **use cases + port public** ET comme **endpoints HTTP authentifiés** dès 012 : consultation du lead (passage automatique à `vu`), `accepter`, `refuser`, `devis_envoyé`, `réservation_confirmée`, `perdu`. Le tableau de bord conseiller (014) ne construira que l'interface utilisateur par-dessus ce backbone — aucune logique de transition ne sera ré-implémentée en 014.
- **FR-016**: Les leads d'un même brief sont **indépendants** : lorsqu'un lead atteint `réservation_confirmée`, le système NE DOIT PAS clôturer automatiquement les leads frères. La plateforme ne contrôlant pas la transaction réelle (anti-marketplace), elle ne présume pas l'exclusivité ; le passage d'un lead frère à `perdu` reste une action explicite (conseiller ou administration).
- **FR-017**: La communication **vers le voyageur** (information qu'un conseiller a accepté/refusé) est **hors périmètre de 012** et déléguée à l'espace voyageur (015) et à la conversation (013). 012 couvre exclusivement le versant conseiller (notifications conseiller + machine d'état).
- **FR-018**: Lorsqu'un brief est re-matché (un nouveau MatchingResult supersède le précédent, FR-016 de 011), le système DOIT clôturer en `perdu` les leads non terminaux du MatchingResult superseded (motif système « re-matché », audit préservé) et créer de nouveaux leads à l'état `envoyé` pour le nouveau top-3 ; un conseiller présent dans l'ancien et le nouveau top-3 reçoit un nouveau lead et une nouvelle notification (idempotence par couple conseiller × MatchingResult).
- **FR-019**: La transition vers `vu` DOIT être déclenchée **automatiquement à la première consultation du lead** par le conseiller (endpoint de lecture), de façon idempotente (une relecture ultérieure ne modifie pas l'état ni n'ajoute de transition).
- **FR-020**: Les transitions de lead DOIVENT suivre une **concurrence optimiste** : une transition n'est appliquée que si elle part de l'état courant réel ; une transition concurrente partant d'un état devenu obsolète est rejetée (le client doit relire l'état). Les transitions « montantes » identiques (ex. `vu` alors que déjà `vu`) sont idempotentes (no-op sans nouvelle entrée d'historique).

### Key Entities *(include if feature involves data)*

- **Lead**: représente l'opportunité d'un conseiller donné sur un brief donné. Attributs clés : référence au MatchingResultEntry d'origine (position, score), référence au conseiller, référence au brief (neutralisable Loi 25), état courant, horodatage de création. Un lead par couple (conseiller × MatchingResultEntry).
- **Transition de lead** (historique append-only): état précédent, état suivant, horodatage, acteur (conseiller / système), motif éventuel. Jamais modifiée a posteriori.
- **Notification conseiller**: intention d'avertir un conseiller d'un lead, avec clé d'idempotence (conseiller × MatchingResult), statut d'acheminement, sans PII de contact voyageur.
- **Événement de matching consommé**: trace d'idempotence des événements du bus déjà traités.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 % des conseillers vérifiés d'un brief matché reçoivent exactement **une** notification par matching (ni zéro, ni doublon), vérifié par test d'invariant sur des tirages aléatoires.
- **SC-002**: Aucune notification ni aucun lead exposé ne contient de coordonnée de contact direct du voyageur (vérifié par contrôle automatisé, 0 fuite).
- **SC-003**: Toute transition d'état invalide est refusée (0 transition illégale acceptée sur la suite de tests d'invariant de la machine d'état).
- **SC-004**: Après anonymisation d'un brief, 0 lead associé ne permet de retrouver la PII voyageur, tandis que 100 % de l'historique d'audit des transitions reste consultable.
- **SC-005**: Le délai entre la disponibilité d'un matching et la mise en file de la notification du conseiller est inférieur à un seuil opérationnel (cible : notification déclenchée en moins de quelques secondes en charge nominale).
- **SC-006**: Un conseiller révoqué n'est ni notifié ni autorisé à agir dans 100 % des cas testés (re-filtrage dynamique effectif).
- **SC-007**: Les métriques « % leads acceptés » et « conversion lead → devis → réservation » sont calculables à partir des données persistées, sans traitement manuel.
- **SC-008**: Après un re-matching, un conseiller n'a jamais plus d'un lead **actif** (non terminal) pour un même brief (les leads de l'ancien matching sont clôturés en `perdu`), vérifié par test d'invariant.

## Assumptions

- **Déclencheur unique** : 012 est piloté exclusivement par les 4 événements de matching publiés par 011 sur le bus interne ; il ne recalcule jamais de matching.
- **Canal de notification** : les courriels transactionnels transitent par le module de notifications existant (003, AWS SES région canadienne) ; 012 ne réimplémente pas l'envoi de courriel.
- **Source de vérité du statut vérifié** : le re-filtrage s'appuie sur l'interface publique de conformité (001), seule autorité du statut `verified`.
- **Identité du conseiller** : l'adresse de notification et l'authentification des actions conseiller proviennent du module identité (006/007) ; 012 ne gère pas les comptes.
- **Notification voyageur** : décidé (FR-017) — la communication côté voyageur est déléguée aux features 013/015 ; 012 se concentre sur le versant conseiller.
- **Rétention** : l'historique des leads et transitions suit le tableau de rétention de la constitution ; l'audit Loi 25 est préservé même après anonymisation du brief.
- **Pas d'UI livrée** : 012 livre le backend (consommation, notifications, machine d'état, port public) ; le tableau de bord conseiller (014) et l'espace voyageur (015) consommeront cette base.
- **Volume** : dimensionné pour le régime nominal de la plateforme au démarrage (quelques briefs par minute en pointe), sans exigence de débit massif spécifique au-delà des SLO généraux.
