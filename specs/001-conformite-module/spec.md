# Spécification fonctionnelle : Module Conformité

**Branche feature** : `001-conformite-module`

**Créé le** : 2026-05-22

**Statut** : Draft

**Entrée** : Description utilisateur : `module conformité`

---

## Clarifications

### Session 2026-05-22

- Q : Comment référencer les permis d'agence OPC / TICO dans le système ?
  → A : Saisie texte libre par le conseiller (nom de l'agence + numéro de
  permis provincial), validation manuelle par l'admin à chaque soumission. Pas
  d'entité « Agence » partagée dans le modèle. Le numéro de permis sert de
  clé de regroupement pour les opérations de cascade (FR-015).
- Q : L'état `under_review` est-il utilisé dans le MVP ?
  → A : Non. La machine d'état est réduite à `pending` / `verified` /
  `suspended` / `revoked`. Un dossier reste `pending` tant qu'il n'est pas
  approuvé. La notion de « réclamé par un admin » sera ajoutée plus tard
  via un ADR si l'équipe admin grandit.
- Q : Quel volume de conseillers est attendu en année 1 ?
  → A : 50 à 500 conseillers. La file admin est paginée (20 dossiers par
  page) avec filtre par statut. Pas de recherche full-text ni de tri
  avancé au MVP — différés à un spec ultérieur si le volume dépasse
  500/an.
- Q : Quelles sont les contraintes de format et taille des documents soumis ?
  → A : 5 MB maximum par fichier, 5 fichiers maximum par soumission.
  Formats acceptés : PDF, JPG, PNG, HEIC (HEIC ajouté pour le format par
  défaut iPhone). Validation côté client avant upload pour rejet
  immédiat hors-limite.
- Q : Quelle est la latence maximale de propagation d'un changement de
  statut vers les modules consommateurs ?
  → A : **< 60 secondes** pour toute transition ; **< 10 secondes** pour
  les transitions négatives (`→ revoked`, `→ suspended`). Cache court
  avec invalidation explicite (pas de TTL seul pour la donnée critique,
  conformément à la constitution). Les transitions positives
  (`→ verified`) tolèrent jusqu'à 60 s parce qu'elles n'exposent pas à
  un risque réglementaire.

---

## Scénarios utilisateurs et tests *(obligatoire)*

> Toutes les *user stories* sont priorisées (P1 = critique MVP). Chacune est
> conçue pour être indépendamment testable et indépendamment livrable. Si on
> n'implémente que la US1, on a déjà un MVP qui débloque tous les autres
> modules.

### User Story 1 — Vérification initiale du conseiller (Priorité : P1) 🎯 MVP

Un conseiller en voyage qui veut être visible sur la plateforme crée son
compte, soumet son certificat provincial (CCV au Québec ou enregistrement
TICO en Ontario) et une preuve d'affiliation à une agence titulaire de
permis. Un admin examine les documents et approuve ou refuse la demande
avec un motif écrit. Le conseiller reçoit le résultat. Si approuvé, son
statut bascule à « vérifié » et il devient éligible aux fonctionnalités
qui dépendent de ce statut (visibilité publique, matching, etc.).

**Pourquoi cette priorité** : c'est le **gardien de la frontière
réglementaire** du produit. Sans ce flux, aucun conseiller ne peut
légalement être affiché ou matché, et donc aucune autre fonctionnalité de
la plateforme n'a de valeur. Cette user story débloque l'ensemble de la
chaîne de valeur économique. Sans elle, le risque de requalification en
agent de voyages est immédiat.

**Test indépendant** : on peut simuler bout-en-bout un conseiller qui
s'inscrit, soumet ses documents, voit son statut passer à `pending`, voit
un admin l'approuver, et constate le passage à `verified` — sans avoir
besoin d'aucun autre module métier (matching, intake, facturation).

**Scénarios d'acceptation** :

1. **Étant donné** un conseiller authentifié sans dossier conformité,
   **quand** il soumet un certificat CCV valide et une preuve d'affiliation
   à une agence détentrice d'un permis OPC actif, **alors** son dossier
   passe à l'état `pending` et un événement de soumission est journalisé.
2. **Étant donné** un dossier en état `pending`, **quand** un admin
   approuve avec une décision motivée, **alors** le statut du conseiller
   bascule à `verified`, une notification courriel est envoyée au
   conseiller dans les 5 minutes, et l'événement est journalisé de manière
   immuable.
3. **Étant donné** un dossier en état `pending`, **quand** un admin refuse
   avec un motif d'au moins 20 caractères, **alors** le statut reste à
   `pending` (non vérifié), le conseiller est notifié avec le motif et
   peut re-soumettre. Chaque rejet reste tracé.
4. **Étant donné** un conseiller dont le dossier est `pending`, **quand**
   un autre module (matching, SEO) interroge son statut, **alors** la
   réponse est « non vérifié » et le conseiller **ne peut pas** être
   affiché publiquement ni inclus dans un matching.

---

### User Story 2 — Expiration automatique des certificats (Priorité : P2)

Le système surveille en continu les dates d'expiration des certificats des
conseillers vérifiés. À l'approche de l'échéance, il envoie au conseiller
des rappels successifs (60 jours, 30 jours et 7 jours avant). Si aucun
renouvellement n'est soumis avant la date d'expiration, le statut du
conseiller bascule automatiquement à `suspended` et le conseiller redevient
invisible des matchings. Le conseiller peut renouveler à tout moment.

**Pourquoi cette priorité** : sans cette automatisation, la plateforme
risque de continuer à exposer des conseillers dont la conformité a expiré
— violation directe du Principe I. Manuel n'est pas acceptable à l'échelle.

**Test indépendant** : on peut simuler artificiellement l'avance du temps
(test d'horloge injectée) et vérifier que les notifications et bascules
de statut se produisent aux jalons attendus, sans toucher au matching.

**Scénarios d'acceptation** :

1. **Étant donné** un certificat expirant dans exactement 60 jours,
   **quand** le job quotidien de surveillance s'exécute, **alors** un
   courriel de rappel est envoyé au conseiller et l'événement est
   journalisé.
2. **Étant donné** un certificat qui a expiré la veille sans renouvellement
   soumis, **quand** le job quotidien s'exécute, **alors** le statut du
   conseiller bascule à `suspended` dans les 24 heures suivant
   l'expiration, le conseiller est notifié, et l'événement est journalisé.
3. **Étant donné** un conseiller suspendu pour expiration, **quand** il
   soumet un nouveau certificat valide avant qu'un admin n'ait revu son
   dossier, **alors** son dossier passe à `pending` (en attente de revue).

---

### User Story 3 — Consultation interne du statut vérifié (Priorité : P2)

Les autres modules (matching, SEO, identité) ont besoin de savoir si un
conseiller est actuellement vérifié pour décider de l'afficher, le
notifier ou l'inclure dans une recherche. Le module conformité expose
cette information via une interface publique qui retourne un statut
binaire (`vérifié` / `non vérifié`) plus l'horodatage de la dernière
vérification. Aucun autre module n'a le droit d'accéder directement aux
tables internes du module conformité.

**Pourquoi cette priorité** : c'est l'application opérationnelle du
Principe I (frontière réglementaire) et du Principe V (modularité par
interface publique). Sans cette frontière, les autres modules pourraient
contourner la vérification.

**Test indépendant** : on peut tester l'interface publique en isolation
avec des dossiers conformité de différents états et vérifier la réponse,
sans dépendre des modules consommateurs.

**Scénarios d'acceptation** :

1. **Étant donné** un conseiller à statut `verified` avec certificat
   non expiré et affiliation active, **quand** un module consommateur
   interroge l'interface publique, **alors** la réponse est `vérifié`
   avec la date de dernière vérification.
2. **Étant donné** un conseiller à statut `suspended` (peu importe la
   raison), **quand** un module consommateur interroge l'interface
   publique, **alors** la réponse est `non vérifié`.
3. **Étant donné** une tentative d'accès direct à la table interne des
   statuts depuis un autre module, **quand** cette tentative est faite,
   **alors** elle est refusée (pas de JOIN cross-module autorisé).

---

### User Story 4 — Révocation manuelle par un admin (Priorité : P3)

Un admin peut révoquer manuellement un conseiller en cas de fraude, de
plainte fondée d'un client, ou de retrait du permis par l'autorité. La
révocation est immédiate, exige un motif écrit, et est définitive : pour
revenir, le conseiller doit recommencer le processus de vérification
complet. La révocation est journalisée et le conseiller est notifié.

**Pourquoi cette priorité** : indispensable mais peu fréquent. La
plateforme peut démarrer sans cette fonctionnalité tant qu'aucun cas réel
ne se présente, mais on ne peut pas opérer publiquement sans elle.

**Test indépendant** : un admin déclenche la révocation, on vérifie que
le statut bascule, que le conseiller devient invisible des matchings, et
que l'événement est journalisé.

**Scénarios d'acceptation** :

1. **Étant donné** un conseiller à statut `verified`, **quand** un admin
   le révoque avec un motif d'au moins 20 caractères, **alors** son
   statut bascule à `revoked`, le conseiller est notifié, et l'événement
   est journalisé de manière immuable.
2. **Étant donné** un conseiller à statut `revoked`, **quand** il tente
   de soumettre un nouveau dossier, **alors** une nouvelle soumission
   complète est créée et passe par le flux normal de revue (la
   révocation ne peut pas être levée automatiquement).

---

### User Story 5 — Espace personnel du conseiller (Priorité : P3)

Le conseiller dispose dans son espace personnel d'une vue de son dossier
conformité : statut actuel, certificats avec dates d'expiration,
affiliations agence, historique d'événements (soumissions, approbations,
refus, rappels d'expiration), et un bouton pour soumettre ou renouveler
ses documents.

**Pourquoi cette priorité** : qualité de vie, pas critique pour le MVP.
Un conseiller peut vivre la première version en consultant ses courriels.

**Test indépendant** : un conseiller se connecte, voit son statut et son
historique, déclenche un renouvellement.

**Scénarios d'acceptation** :

1. **Étant donné** un conseiller authentifié, **quand** il accède à son
   espace personnel, **alors** il voit son statut actuel, la date
   d'expiration de chacun de ses certificats, et la liste de ses
   événements conformité ordonnée du plus récent au plus ancien.
2. **Étant donné** un conseiller avec un certificat expirant dans 30
   jours, **quand** il consulte son espace, **alors** un avertissement
   visible l'invite à renouveler.

---

### Cas limites

- **Conseiller affilié à plusieurs agences** : autorisé. Le statut
  `verified` est atteint dès qu'**au moins une** affiliation est active
  et qu'au moins un certificat correspondant n'est pas expiré.
- **Variations de nom d'agence** : deux conseillers peuvent déclarer la
  même agence avec des orthographes différentes du nom (typo, accents,
  abréviations). Le **numéro de permis provincial** est l'identifiant
  canonique pour toutes les opérations de cascade et d'audit ; le nom
  est purement descriptif.
- **Agence perd son permis OPC ou TICO** : tous les conseillers affiliés
  via cette agence voient leur affiliation à cette agence basculer à
  `inactive` automatiquement. Si c'était leur seule affiliation, leur
  statut conformité bascule à `suspended`.
- **Certificat qui expire au moment d'un matching en cours** : un
  conseiller dont le certificat vient d'expirer devient non éligible
  dans un délai de propagation maximal défini par FR-022 (10 s pour les
  transitions négatives), même pour un matching déjà en cours mais non
  encore confirmé.
- **Cross-province (CCV Québec ET TICO Ontario)** : un conseiller peut
  détenir les deux ; chaque certificat est indépendant. Le statut
  `verified` s'applique globalement dès qu'au moins un certificat est
  valide et qu'au moins une affiliation est active.
- **Document refusé puis re-soumis** : autorisé sans limite de
  re-soumissions. Tous les rejets restent dans le journal d'audit.
- **Demande d'effacement Loi 25** : la suppression anonymise le profil
  conseiller mais **conserve le journal d'audit pendant 7 ans**
  (obligation légale supplante le droit à l'effacement, conformément au
  régime de conservation prévu par la constitution).
- **Tentative de modification rétroactive d'une entrée d'audit** :
  refusée matériellement. Le journal d'audit est append-only.
- **Admin tente de révoquer un conseiller déjà révoqué** : opération
  idempotente, pas d'effet, pas de nouvelle entrée d'audit créée.

---

## Exigences *(obligatoire)*

### Exigences fonctionnelles

- **FR-001** : Le système **DOIT** permettre à un conseiller authentifié
  de soumettre un dossier de conformité incluant : (a) un certificat
  provincial (CCV Québec ou TICO Ontario, ou les deux) et (b) au moins
  une preuve d'affiliation à une agence titulaire d'un permis OPC ou
  TICO. La preuve d'affiliation comprend : **nom de l'agence**,
  **numéro du permis provincial** (OPC ou TICO), et un document scanné
  attestant l'affiliation. L'admin vérifie manuellement l'authenticité
  et la validité du permis lors de la revue (par exemple en consultant
  les registres publics OPC ou TICO).
- **FR-002** : Le système **DOIT** enregistrer chaque soumission avec
  horodatage, identifiant du conseiller, et état initial `pending`.
- **FR-003** : Le système **DOIT** permettre à un utilisateur de rôle
  `admin` de consulter la file des dossiers `pending`, classés du plus
  ancien au plus récent. La file **DOIT** être paginée (20 dossiers par
  page) et offrir un filtre par statut (`pending` / `verified` /
  `suspended` / `revoked`). Pas de recherche full-text ni de tri avancé
  au MVP.
- **FR-004** : Le système **DOIT** permettre à un admin d'approuver ou de
  refuser un dossier `pending`. Le refus **DOIT** être motivé par un
  texte d'au moins 20 caractères.
- **FR-005** : Le système **DOIT** notifier le conseiller (courriel
  transactionnel + notification in-app) dans les 5 minutes suivant la
  décision admin (approbation ou refus).
- **FR-006** : Le système **DOIT** exposer une interface publique
  permettant aux autres modules de consulter le statut vérifié d'un
  conseiller. La réponse **DOIT** contenir uniquement un statut binaire
  et l'horodatage de la dernière vérification. Aucun JOIN direct cross-
  module sur les tables internes ne **DOIT** être permis.
- **FR-007** : Le système **DOIT** filtrer matériellement (en couche de
  données, pas seulement UI) tout conseiller non-vérifié de toute requête
  publique ou de matching.
- **FR-008** : Le système **DOIT** exécuter quotidiennement un job de
  surveillance des dates d'expiration et envoyer des rappels de
  renouvellement aux conseillers à J-60, J-30 et J-7 avant expiration de
  chacun de leurs certificats.
- **FR-009** : Le système **DOIT** basculer automatiquement le statut
  d'un conseiller à `suspended` dans les 24 heures suivant l'expiration
  de **tous** ses certificats sans renouvellement.
- **FR-010** : Le système **DOIT** permettre à un admin de révoquer
  manuellement un conseiller avec un motif d'au moins 20 caractères. La
  révocation est définitive et nécessite une nouvelle soumission complète
  pour être levée.
- **FR-011** : Le système **DOIT** produire une entrée de journal
  d'audit immuable (append-only) pour chaque événement suivant :
  soumission de dossier, approbation, refus, rappel d'expiration,
  bascule automatique vers `suspended`, révocation manuelle,
  renouvellement, modification d'affiliation, demande d'effacement
  Loi 25.
- **FR-012** : Le journal d'audit **DOIT** être consultable par
  identifiant de conseiller et conservé pendant 7 ans après le dernier
  événement avant archivage chiffré (conformément à la rétention prévue
  par la constitution).
- **FR-013** : Le système **DOIT** permettre au conseiller authentifié
  de consulter son propre dossier : statut actuel, liste de ses
  certificats avec dates d'expiration, liste de ses affiliations agence,
  et historique de ses événements conformité.
- **FR-014** : Le système **DOIT** supporter qu'un conseiller soit
  affilié à plusieurs agences simultanément. Le statut `verified` est
  calculé comme l'agrégat « au moins une affiliation active **et** au
  moins un certificat non expiré ».
- **FR-015** : Le système **DOIT** permettre à un admin de déclarer
  qu'un numéro de permis d'agence (OPC ou TICO) n'est plus actif. Tous
  les conseillers ayant déclaré ce numéro de permis dans une affiliation
  voient cette affiliation basculer automatiquement à `inactive` et
  leur statut conformité recalculé. La déclaration de retrait de permis
  est journalisée comme événement d'audit. Le **numéro de permis** est
  la clé de regroupement (pas le nom de l'agence, qui peut varier).
- **FR-016** : Le système **DOIT** recueillir un consentement explicite
  du conseiller à la conservation et au traitement de ses documents de
  conformité au moment de la première soumission, avec finalité énoncée.
- **FR-017** : Le système **DOIT** permettre au conseiller de demander
  la suppression de ses données personnelles. La suppression
  **DOIT** anonymiser le profil et les documents stockés, tout en
  conservant le journal d'audit pendant 7 ans (obligation légale).
- **FR-018** : Toute opération admin qui modifie le statut d'un
  conseiller **DOIT** être attribuable à un identifiant admin nominatif
  dans le journal d'audit.
- **FR-019** : Le système **DOIT** empêcher la modification rétroactive
  ou la suppression d'une entrée de journal d'audit, quel que soit le
  rôle.
- **FR-020** : Les documents soumis (scans de certificats, preuves
  d'affiliation) **DOIVENT** être stockés en région canadienne et
  accessibles uniquement aux utilisateurs autorisés (le conseiller
  propriétaire et les admins).
- **FR-021** : Le système **DOIT** restreindre l'upload de documents
  comme suit : **5 MB maximum par fichier**, **5 fichiers maximum par
  soumission**, formats acceptés **PDF, JPG, PNG, HEIC**. La validation
  des contraintes **DOIT** être appliquée à la fois côté client (rejet
  immédiat avec message explicite) et côté serveur (rejet définitif au
  cas où le client serait contourné).
- **FR-022** : Tout changement de statut d'un conseiller **DOIT** se
  propager à l'interface publique de consultation (FR-006) dans un
  délai maximal de **60 secondes**. Les transitions vers `revoked` ou
  `suspended` (transitions négatives, qui exposent à un risque
  réglementaire si elles tardent) **DOIVENT** se propager dans un
  délai maximal de **10 secondes**. L'invalidation des caches associés
  à l'interface **DOIT** être explicite (pas de TTL seul pour cette
  donnée critique).

### Entités clés

- **Conseiller** : personne physique inscrite sur la plateforme. Identifié
  par un compte authentifié. Possède un statut de conformité agrégé.
- **Certificat de conformité** : document officiel délivré par une
  autorité provinciale (CCV au Québec, TICO en Ontario). Caractéristiques :
  province, numéro, date d'émission, date d'expiration, document numérisé.
- **Affiliation à une agence** : déclaration faite par le conseiller
  dans son dossier, comprenant : **nom de l'agence** (texte libre),
  **numéro de permis provincial** (OPC ou TICO, clé de regroupement
  canonique), document scanné attestant l'affiliation, rôle au sein de
  l'agence (optionnel), date de début, date de fin (optionnelle), état
  (`active` / `inactive`). Il n'existe pas d'entité « Agence » partagée
  dans le système ; chaque déclaration est indépendante mais les
  opérations de cascade (FR-015) regroupent par numéro de permis.
- **Déclaration de retrait de permis** : action admin qui marque un
  numéro de permis OPC ou TICO comme non actif, déclenchant la
  recalculation du statut de tous les conseillers ayant déclaré ce
  numéro.
- **Statut de conformité du conseiller** : agrégat calculé à partir des
  certificats valides et des affiliations actives. Valeurs possibles :
  `pending` (soumission en attente de revue ou refusée, conseiller non
  éligible), `verified` (vérifié et éligible), `suspended` (expiration
  ou perte d'affiliation), `revoked` (révoqué manuellement, état
  final). Transitions autorisées : `pending → verified` (approbation),
  `pending → pending` (refus, le conseiller peut re-soumettre),
  `verified → suspended` (expiration ou perte d'affiliation),
  `suspended → verified` (renouvellement approuvé), `verified → revoked`
  ou `suspended → revoked` (révocation admin), `revoked → pending`
  (uniquement via nouvelle soumission complète).
- **Entrée de journal d'audit** : événement immuable horodaté lié à un
  conseiller, décrivant un changement de statut, une décision admin, ou
  une action automatique du système.
- **Soumission de dossier** : action initiée par un conseiller qui
  regroupe un ou plusieurs certificats et au moins une preuve
  d'affiliation, et qui crée un nouvel item dans la file de revue admin.

---

## Critères de succès *(obligatoire)*

### Résultats mesurables

- **SC-001** : 95 % des soumissions de dossier sont décidées (approuvées
  ou refusées) par un admin dans un délai maximum de 5 jours ouvrables.
- **SC-002** : 100 % des certificats expirés provoquent une bascule
  automatique du statut du conseiller à `suspended` dans les 24 heures
  suivant l'expiration.
- **SC-003** : 0 conseiller non-vérifié n'apparaît dans une interface
  publique ou n'est inclus dans un matching, mesuré par audit automatique
  hebdomadaire.
- **SC-004** : 100 % des changements de statut produisent une entrée
  d'audit retrouvable par identifiant de conseiller pendant 7 ans.
- **SC-005** : Le conseiller reçoit la notification d'une décision admin
  dans un délai inférieur à 5 minutes (P95).
- **SC-006** : Un conseiller peut soumettre ou renouveler son dossier en
  moins de 3 minutes en parcours nominal.
- **SC-007** : Le taux d'erreur sur les bascules automatiques de statut
  (faux positif ou faux négatif) est inférieur à 0,5 % par mois.
- **SC-008** : 100 % des tentatives d'accès cross-module direct aux
  tables internes du module conformité sont refusées (vérifié par test
  d'intégration en CI).
- **SC-009** : Le délai entre l'expiration d'un permis d'agence et la
  bascule automatique de tous ses conseillers affiliés est inférieur à
  24 heures.
- **SC-010** : 99 % des transitions de statut sont visibles depuis
  l'interface publique (FR-006) dans un délai inférieur à 60 secondes ;
  99 % des transitions négatives (`→ revoked`, `→ suspended`) sont
  visibles dans un délai inférieur à 10 secondes (mesuré P99).

---

## Hypothèses

- Un module **identité** distinct (hors scope de ce spec) fournit
  l'authentification des conseillers et des admins, ainsi que la gestion
  des rôles (`voyageur`, `conseiller`, `admin`). Ce module **DOIT** être
  disponible avant le développement du module conformité.
- La validation du **contenu** des documents (authenticité, lisibilité,
  correspondance) est faite **manuellement par un admin** — pas d'OCR
  automatique en MVP, peut évoluer ultérieurement via un ADR. Les
  contraintes de **format et taille** sont définies dans FR-021.
- L'assurance responsabilité civile / E&O des conseillers est couverte
  par l'agence d'affiliation (via le permis OPC ou TICO de l'agence),
  donc **pas collectée séparément** par ce module.
- Un seul rôle `admin` global est suffisant au MVP. La séparation entre
  `admin-conformité` et `admin-tech` est différée à une itération
  ultérieure.
- Le SLA de 5 jours ouvrables pour la revue admin est une **cible
  commerciale** et de qualité de service, pas une garantie contractuelle.
- Volume attendu en **année 1** : 50 à 500 conseillers actifs. Au-delà
  de ce seuil, un spec d'évolution sera nécessaire pour introduire
  recherche, tri avancé, et attribution multi-admin.
- La liste des permis OPC et TICO actifs est maintenue par un mécanisme
  externe (saisie manuelle initiale, intégration API si disponible plus
  tard — sujet à ADR séparé).
- Multi-affiliation conseiller est autorisée (modèle courant au Canada :
  conseiller indépendant + grossiste, par exemple).
- Le canal de notification est composé du courriel transactionnel **et**
  d'une notification in-app, tous deux fournis par le module identité.
- Le stockage des documents et des données utilise un fournisseur en
  région canadienne (Principe II de la constitution).
- Le journal d'audit conserve 7 ans en stockage chiffré conformément au
  régime de rétention défini dans la constitution.
- Le module **matching** (hors scope de ce spec) consommera l'interface
  publique de conformité pour filtrer les conseillers éligibles. La
  conception interne du matching est indépendante.

---

## Dépendances

- **Module identité** : authentification, RBAC (`voyageur` / `conseiller`
  / `admin`), envoi de courriels transactionnels, notifications in-app.
  Doit être disponible avant le développement.
- **Stockage objet en région canadienne** pour les documents soumis (le
  choix précis du fournisseur fera l'objet d'un ADR distinct).
- **Source de référence des permis** OPC et TICO : alimentée
  manuellement au démarrage, alimentation automatisée différée à un
  spec ultérieur.

---

## Hors scope

- L'OCR automatique des certificats (validation manuelle uniquement au
  MVP).
- L'intégration en temps réel avec les bases de données OPC ou TICO
  (sujet à un spec et un ADR distincts).
- La gestion des assurances responsabilité civile individuelles des
  conseillers (couvertes par l'agence).
- L'authentification multifacteur du conseiller (responsabilité du
  module identité — bien qu'**exigée par la constitution**, son
  implémentation est cadrée par le spec de ce module).
- La facturation du conseiller (responsabilité du module facturation).
- L'expérience publique de découverte des conseillers (responsabilité du
  module matching et du module SEO).
