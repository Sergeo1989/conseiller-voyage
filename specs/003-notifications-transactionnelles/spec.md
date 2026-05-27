# Feature Specification : Notifications et courriel transactionnel

**Feature Branch** : `003-notifications-transactionnelles`

**Created** : 2026-05-26

**Status** : Draft

**Input** : User description : "identité — notifications + courriel transactionnel (Feature 003, Sprint 1, dernier livrable Tier 0). Service centralisé d'envoi de courriels transactionnels FR-CA / EN qui draine les tables outbox déjà posées par 001 conformité, 002 auth, 002a MFA, et expose une facade publique pour les futurs modules 005/008/012."

---

## Clarifications

### Session 2026-05-26

- Q : Volume d'envoi cible à M18 (impact dimensionnement worker, quota
  SES, indexation outbox) → A : Modéré, ~5 000 courriels/jour. Quota
  SES production cible 50 000/jour (marge 10×). Worker mono-instance
  suffit, scaling horizontal différé tant que la saturation n'est pas
  détectée par alerting.
- Q : Adresse expéditeur et stratégie de sous-domaine d'envoi (impact
  DKIM/SPF/DMARC + isolation réputation marketing/transactionnel) →
  A : Sous-domaine dédié `notifications@notifications.conseiller-voyage.ca`.
  DKIM/SPF/DMARC configurés au niveau du sous-domaine pour isoler la
  réputation transactionnelle d'éventuels usages marketing futurs (qui
  iront sur un autre sous-domaine, ex. `news.`).
- Q : Stratégie de consolidation des templates email existants
  (4+5+4 = 13 templates répartis dans 2 packages distincts) → A :
  Consolider tout dans `packages/email-templates/` en migrant les
  templates conformité (`packages/shared/src/email/templates/conformite/`)
  vers un sous-dossier `packages/email-templates/src/conformite/`.
  Le worker 003 importe depuis une source unique. Les futurs modules
  (008 intake, 012 matching) ajouteront leur sous-dossier dans le
  même package.
- Q : Canal et outil d'alerting opérationnel (impact wiring Grafana
  Cloud Canada → notification ops) → A : Slack uniquement, 2 canaux
  dédiés `#ops-page` (mention `@channel` pour les pages — bounce > 5%,
  complaint > 0,1%, provider HS > 30 min) et `#ops-warn` (silent —
  DLQ > 50). Pas d'on-call formel ni de rotation à ce stade. Webhook
  Slack natif de Grafana Cloud assure le wiring sans subscription
  tierce. Upgrade vers PagerDuty/OpsGenie envisagé post-launch.
- Q : Contrôle d'accès à la console admin US6 (qui peut retirer une
  adresse de la suppression list ou relancer un envoi DLQ) → A : Tous
  les admins (rôle `admin` existant, cohérent avec la convention 001
  conformité). Chaque action sensible exige un motif libre obligatoire
  et est consignée dans le journal d'audit append-only avec acteur et
  horodatage. Aucun nouveau sous-rôle RBAC introduit.

---

## Pourquoi cette feature *(contexte produit)*

Trois features mergées sur `main` (001 conformité, 002 auth, 002a MFA) ont
posé des tables `*_outbox_emails` qui s'accumulent **sans worker pour
envoyer les courriels correspondants**. Concrètement :

- Un conseiller qui s'inscrit ne reçoit jamais son courriel de
  vérification — son compte reste en `pending_email_verification`
  indéfiniment.
- Un admin qui réinitialise le MFA d'un conseiller compromis ne génère
  aucune notification — le conseiller ne sait pas que son TOTP est
  désactivé jusqu'à sa prochaine tentative de connexion.
- Un dossier de conformité approuvé ou refusé ne produit aucun courriel
  vers le conseiller — il doit pinger l'admin par téléphone.
- Les rappels d'expiration de certificat OPC/TICO (J-30, J-15, J-7, J-1)
  prescrits par FR-005 du module 001 ne sont jamais envoyés — risque
  conformité Principe I.

Cette feature livre le moteur transactionnel qui débloque l'ensemble. C'est
le **dernier verrou du Tier 0** avant de pouvoir lancer le Sprint 2 (profil
conseiller, qui dépend des courriels d'invitation et de notification).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Premier courriel transactionnel délivré bout en bout (Priority : P1)

Un nouveau conseiller termine son inscription via la page publique. Le
système enregistre son compte avec un courriel non vérifié, dépose un
événement dans la table outbox du module identité, et le système de
notifications le transforme en courriel délivré dans la boîte du
destinataire en moins de deux minutes. Le conseiller clique le lien de
vérification, retourne sur le site, son compte passe en `verified` et
peut configurer son MFA.

**Why this priority** : C'est la verticale complète qui valide
l'architecture. Tant que ce flux ne marche pas, aucun autre cas d'usage
(reset mot de passe, accusé conformité, rappel expiration) ne peut être
livré. C'est aussi le seul cas où l'utilisateur final voit zéro courriel
aujourd'hui malgré une feature mergée — c'est le bug le plus visible côté
voyageur/conseiller.

**Independent Test** : Inscription bout en bout d'un conseiller test en
environnement de staging avec courriel réel (compte SES sandbox vérifié)
— vérifier que le courriel arrive dans la boîte, que le lien fonctionne,
que le compte transite vers `verified`. Mesurable : délai entre signup
et réception du courriel < 2 minutes en p95.

**Acceptance Scenarios** :

1. **Given** un conseiller s'inscrit avec un courriel valide non encore
   en suppression list, **When** le système enregistre le compte,
   **Then** un courriel de vérification est délivré dans la boîte du
   destinataire en moins de 2 minutes, contenant un lien unique valable
   24 heures, dans la langue d'inscription.

2. **Given** un courriel transactionnel a été déposé dans une table
   outbox, **When** le worker draine la file, **Then** un seul courriel
   est envoyé même si le worker est redémarré en cours de traitement
   (idempotence garantie).

3. **Given** le provider courriel est temporairement indisponible
   (panne régionale, rate limit), **When** un envoi échoue, **Then** le
   système retente avec backoff exponentiel jusqu'à 5 tentatives sur
   24 heures, et l'entry outbox reste non publiée jusqu'au succès ou à
   l'épuisement.

4. **Given** une entry outbox a échoué 5 tentatives, **When** le
   maximum est atteint, **Then** l'entry est marquée en dead-letter avec
   le motif de la dernière erreur, et une alerte opérationnelle est
   levée pour intervention humaine.

---

### User Story 2 — Couverture complète des courriels transactionnels J1 (Priority : P1)

L'ensemble des événements posés J1 par les modules 001, 002, 002a
produisent un courriel cohérent en marque Conseiller Voyage, en FR-CA
par défaut et en anglais si la préférence du destinataire est `en`. Le
catalogue inclut treize templates **déjà créés** par les features
précédentes (à consolider dans `packages/email-templates/`) plus
quelques **templates à compléter** pour couvrir tous les événements
réellement posés en outbox :

- **Auth (déjà existants)** : `email-verification`, `password-reset`,
  `password-changed`, `admin-invitation`.
- **MFA (déjà existants)** : `admin-reset`, `device-changed`,
  `device-change-incomplete`, `login-locked`, `stepup-session-killed`.
- **Conformité (déjà existants, à migrer)** : `dossier-approved`,
  `dossier-refused`, `expiration-reminder` (paramétrable J-30/J-15/J-7/J-1),
  `revocation`.
- **À compléter J1** : accusé de soumission de dossier conformité,
  confirmation TOTP activé (post-setup réussi), confirmation
  d'effacement Loi 25. Le décompte exact des nouveaux templates est
  établi lors du plan, en regardant la liste des `eventType` réellement
  publiés par les outbox `auth_outbox_emails`, `mfa_outbox_emails` et
  l'`OutboxPublisherJob` conformité.

**Why this priority** : Une fois US1 livré, l'élargissement aux autres
templates est ce qui rend la plateforme opérationnelle au quotidien.
Sans cette US, on peut seulement s'inscrire mais on n'a aucun retour
quand on soumet un dossier, demande un reset, ou approche d'une
expiration.

**Independent Test** : Pour chaque type de courriel, déclencher l'action
métier correspondante en staging et vérifier que le courriel arrive avec
le bon contenu, dans la bonne langue, avec un rendu correct sur mobile
et desktop (Gmail, Outlook, iOS Mail, Thunderbird). Total : 13 scénarios
de bout en bout, chacun pouvant être lancé indépendamment.

**Acceptance Scenarios** :

1. **Given** un conseiller a soumis un dossier de conformité, **When**
   l'admin l'approuve, **Then** le conseiller reçoit un courriel
   « Dossier approuvé » dans la langue de son profil, mentionnant la
   date de prise d'effet et un lien vers son tableau de bord.

2. **Given** un conseiller a un certificat OPC expirant dans 30 jours
   exactement, **When** le job quotidien de rappels d'expiration tourne,
   **Then** le conseiller reçoit un courriel « Expiration imminente J-30 »
   avec le numéro du certificat concerné et la procédure de
   renouvellement.

3. **Given** un admin invite un nouvel admin par adresse courriel,
   **When** la requête est soumise, **Then** l'invité reçoit un
   courriel « Invitation admin » avec un lien d'acceptation valable
   7 jours.

4. **Given** un conseiller demande une réinitialisation de mot de passe,
   **When** la requête est valide (compte existant, non verrouillé),
   **Then** un courriel « Réinitialiser votre mot de passe » est envoyé
   contenant un lien à usage unique valable 1 heure. Si le compte
   n'existe pas, aucun courriel n'est envoyé mais la réponse HTTP est
   identique (anti-énumération).

5. **Given** un conseiller exécute son effacement Loi 25, **When**
   l'effacement est complété, **Then** un courriel « Confirmation
   d'effacement » est envoyé à l'adresse historique avant la
   suppression de cette adresse de la base, confirmant les données
   effacées et celles légalement conservées.

---

### User Story 3 — Protection de la réputation d'envoi via gestion automatique des rebonds (Priority : P2)

Le système écoute les notifications du provider courriel pour les
événements *bounce* (boîte inexistante ou pleine) et *complaint* (marqué
comme spam par le destinataire). Quand un événement arrive, l'adresse
concernée est ajoutée à une liste de suppression — permanente pour les
hard bounces et plaintes, temporaire 30 jours pour les soft bounces. Avant
tout envoi futur, le système consulte cette liste et abandonne l'envoi si
le destinataire y figure, en informant le module source de la décision.

**Why this priority** : Sans cette protection, le compte du fournisseur
courriel se fait suspendre dès qu'on franchit 5 % de rebonds (limite
imposée par AWS SES, vérifiable côté facturation). Une fois suspendu, **plus
aucun courriel ne sort**, paralysant toute la plateforme. C'est donc une
exigence opérationnelle non-négociable avant la sortie du sandbox SES.

**Independent Test** : Envoyer un courriel à une adresse de test qui
produit un hard bounce (`bounce@simulator.amazonses.com`), vérifier que
l'adresse apparaît en suppression list dans la minute, puis tenter un
nouvel envoi vers cette adresse et constater qu'il est abandonné avec un
log dédié.

**Acceptance Scenarios** :

1. **Given** un courriel est envoyé vers une boîte inexistante,
   **When** la notification de hard bounce arrive, **Then** l'adresse
   est ajoutée à la suppression list avec `permanent = true` et le
   module source qui a déposé l'événement reçoit un signal de retour
   (par exemple, le module 002 marque le profil conseiller comme
   `email_invalide`).

2. **Given** une adresse est déjà en suppression list permanente,
   **When** un module dépose un nouvel événement vers cette adresse,
   **Then** l'envoi est abandonné, un log structuré est émis, et
   l'entry outbox est marquée `skipped_suppressed` (différent de
   `failed` car non retry).

3. **Given** une adresse a fait l'objet d'un soft bounce, **When**
   30 jours se sont écoulés sans nouveau soft ou hard bounce, **Then**
   l'entry de suppression list expire automatiquement et l'envoi vers
   cette adresse redevient possible.

4. **Given** un utilisateur signale un courriel comme spam dans Gmail,
   **When** la notification *complaint* arrive, **Then** l'adresse est
   ajoutée en suppression list permanente et une alerte est levée pour
   inspection du template concerné (potentiel problème de wording ou de
   fréquence).

---

### User Story 4 — Observabilité de la délivrabilité et alerting opérationnel (Priority : P2)

L'équipe technique dispose d'un tableau de bord en temps réel montrant
les taux d'envoi, de délivrance, de rebond et de plainte par template et
par module source, avec alertes automatisées quand un seuil est franchi.
La file de courriels en dead-letter est visible et alerte au-delà d'un
volume critique.

**Why this priority** : C'est la condition pour détecter un incident
avant qu'il ne paralyse la plateforme. Sans observabilité, on découvre
les problèmes via les plaintes utilisateur, soit J+2 ou J+5 — trop tard.

**Independent Test** : Forcer un envoi qui échoue, vérifier que la
métrique de bounce s'incrémente dans le tableau de bord, et que l'alerte
correspondante part dans le canal d'astreinte si le seuil est franchi.

**Acceptance Scenarios** :

1. **Given** le tableau de bord est consulté, **When** un opérateur
   regarde l'écran, **Then** il voit en moins de 5 secondes :
   - le nombre de courriels envoyés sur les 24 dernières heures, par
     module source ;
   - les taux de délivrance, rebond, plainte (en pourcentage) sur les
     mêmes 24 heures ;
   - la liste des templates avec le plus de rebonds ;
   - le volume actuel en dead-letter.

2. **Given** le taux de rebond global dépasse 5 % sur une fenêtre
   glissante d'une heure, **When** le seuil est franchi, **Then** une
   alerte de niveau **page** est levée dans le canal d'astreinte avec
   les top 3 templates contributeurs.

3. **Given** le taux de plainte dépasse 0,1 % sur 24 heures, **When**
   le seuil est franchi, **Then** une alerte de niveau **page** est
   levée immédiatement (proximité de la limite SES 0,1 % qui déclenche
   suspension automatique du compte).

4. **Given** plus de 50 courriels stagnent en dead-letter, **When** le
   seuil est franchi, **Then** une alerte de niveau **warn** est levée
   pour traitement humain.

---

### User Story 5 — Respect du droit à l'effacement Loi 25 (Priority : P2)

Quand un utilisateur exerce son droit à l'effacement (orchestré par la
feature 023 à venir), tout l'historique de ses courriels personnels est
anonymisé dans le journal d'envoi : l'adresse claire est remplacée par
un hash irréversible, le sujet et le contenu sont purgés. Les
identifiants techniques (ID d'événement, horodatage, statut, template)
sont conservés pour audit sur sept ans, car ils ne contiennent plus
d'information personnellement identifiable.

**Why this priority** : Obligation légale Principe IV (Loi 25 article 28.1).
Sans cela, la plateforme ne peut pas être lancée publiquement au Québec.
Mais le système peut fonctionner sans cette US tant qu'on est en
pré-lancement, donc P2 et non P1.

**Independent Test** : Pour un destinataire de test, envoyer 5
courriels, déclencher la routine d'effacement, vérifier que dans la table
de log les 5 lignes sont anonymisées (adresse hashée, sujet vide,
contenu vide), que les identifiants techniques sont conservés, et
qu'aucune trace du courriel clair n'existe ailleurs (logs applicatifs
inclus).

**Acceptance Scenarios** :

1. **Given** un destinataire a 5 courriels dans le journal d'envoi,
   **When** la routine d'effacement Loi 25 est appelée pour cette
   adresse, **Then** en moins de 60 secondes les 5 lignes ont leur
   `recipientEmailClear` à `null`, leur `subject` à `null`, leur
   `htmlBody`/`textBody` purgés, et seul subsiste un
   `recipientEmailHashHMAC` non réversible sans pepper serveur.

2. **Given** un courriel pour cette adresse était en file d'envoi non
   encore parti, **When** l'effacement est exécuté, **Then** l'envoi
   est annulé et l'entry outbox est marquée `cancelled_erased`.

3. **Given** un courriel pour cette adresse était déjà parti chez le
   provider, **When** l'effacement est exécuté, **Then** le journal
   local est anonymisé mais le courriel déjà transmis ne peut pas être
   rappelé (limitation acceptée et mentionnée dans la politique de
   confidentialité).

---

### User Story 6 — Outils administratifs opérationnels (Priority : P3)

Un opérateur de la plateforme accède à une console interne pour
consulter la suppression list, retirer manuellement une adresse de la
suppression list (en cas de faux positif vérifié), inspecter une entry
en dead-letter pour comprendre l'échec, et déclencher une re-tentative
manuelle après correction (par exemple après mise à jour d'une variable
de configuration).

**Why this priority** : Réduit le coût opérationnel et permet une
résolution rapide des incidents de support, mais n'est pas nécessaire
pour le fonctionnement nominal. Peut être livré en J+30.

**Independent Test** : Authentifier un opérateur via SSO admin
existant, charger la console, vérifier l'affichage de la liste, retirer
manuellement une adresse, relancer un envoi en dead-letter, et constater
que les changements sont audités.

**Acceptance Scenarios** :

1. **Given** un opérateur authentifié sur la console admin, **When** il
   ouvre l'onglet « Notifications », **Then** il voit la suppression
   list paginée triée par date d'ajout, et peut filtrer par raison
   (`hard_bounce`, `soft_bounce`, `complaint`, `manual`).

2. **Given** un opérateur identifie un faux positif (adresse valide en
   suppression list pour soft bounce périmé), **When** il clique
   « Retirer », **Then** l'adresse est retirée immédiatement, une
   entrée d'audit est créée avec son identifiant et le motif, et les
   prochains envois vers cette adresse fonctionnent.

3. **Given** un opérateur consulte une entry en dead-letter, **When**
   il a corrigé le motif d'échec (par exemple, un template mal formaté
   patché), **Then** il peut cliquer « Relancer » et l'envoi part en
   nouvelle tentative, avec audit du déclencheur humain.

---

### Edge Cases

- **Destinataire change de langue après inscription** : si la
  préférence linguistique passe de FR à EN entre le moment où l'événement
  est déposé et le moment où le worker draine, quelle langue est
  appliquée ? Réponse retenue : la langue au moment du **drainage**
  (lecture fraîche du profil), car c'est celle qui correspond aux
  préférences les plus récentes du destinataire.

- **Courriel envoyé puis utilisateur change d'adresse** : si la routine
  d'effacement Loi 25 tourne pendant qu'un courriel pour l'ancienne
  adresse est en train d'être envoyé, le journal final reflète
  l'anonymisation mais le courriel a quitté la plateforme. Comportement
  documenté dans la politique de confidentialité.

- **Provider courriel inaccessible plus de 24 h** : tous les retries
  échouent, la file outbox s'accumule. Comportement attendu : les
  entries restent en attente, le système ne perd rien, et une alerte
  niveau **page** est levée après 30 minutes d'indisponibilité continue.

- **Template absent au moment du drainage** : un nouveau type
  d'événement est déposé par un module avant que son template ait été
  ajouté au catalogue. Comportement attendu : l'entry est marquée
  `failed_template_missing`, une alerte est levée, et le déploiement
  est bloqué côté CI car la liste des templates est validée au build.

- **Destinataire en suppression list essaie de soumettre un nouveau
  formulaire** : le module source (par exemple intake voyageur futur)
  doit pouvoir détecter en amont qu'une adresse est en suppression list
  permanente, pour proposer à l'utilisateur une saisie alternative
  (mécanisme exposé par la facade publique).

- **Pic d'envoi simultané** (par exemple, 200 conseillers dont les
  certificats expirent le même jour) : le rate limit du provider doit
  être respecté ; le worker temporise les envois sur la fenêtre de
  rate limit configurée (initiale : 14 envois/seconde, hausse possible
  après historique de réputation positive avec SES).

- **Courriel rebondit après envoi réussi initial** : le statut journal
  doit refléter le bounce *postérieur* (`delivered` puis `bounced` plus
  tard via SNS). La métrique de délivrabilité finale doit utiliser le
  dernier statut connu, pas l'initial.

---

## Requirements *(mandatory)*

### Functional Requirements

**Drainage et envoi (US1)**

- **FR-001** : Le système DOIT consommer en continu les tables outbox
  posées par les modules 001 (conformité), 002 (auth), 002a (MFA)
  ainsi que celles que les futurs modules (005, 008, 012) poseront.
- **FR-002** : Le système DOIT garantir au moins une livraison par
  entry outbox, avec idempotence côté provider via un identifiant
  unique propagé (`correlationId`).
- **FR-003** : Le système DOIT respecter une politique de retry à
  backoff exponentiel — minimum 5 tentatives sur 24 h — avant de
  considérer un envoi en dead-letter.
- **FR-004** : Le système DOIT détecter et bloquer les tentatives
  d'envoi en doublon dues à un redémarrage du worker en cours de
  traitement (atomicité de la transition entry → publishedAt).

**Templates et internationalisation (US2)**

- **FR-005** : Le système DOIT couvrir l'ensemble des `eventType`
  publiés par les outbox des modules 001, 002 et 002a. Les templates
  déjà créés (`email-verification`, `password-reset`,
  `password-changed`, `admin-invitation`, `admin-reset`,
  `device-changed`, `device-change-incomplete`, `login-locked`,
  `stepup-session-killed`, `dossier-approved`, `dossier-refused`,
  `expiration-reminder`, `revocation`) sont consolidés dans le package
  unique. Les `eventType` non couverts à ce jour (notamment accusé de
  soumission conformité, confirmation TOTP activé, confirmation
  d'effacement Loi 25) sont identifiés au plan et ajoutés au catalogue.
- **FR-006** : Chaque template DOIT exister en FR-CA et en anglais,
  avec catalogue de traductions partagé.
- **FR-007** : Chaque template DOIT inclure un preview text optimisé
  pour l'affichage dans la liste de la boîte mail.
- **FR-008** : Chaque courriel DOIT inclure une version texte brut
  (plain-text) en plus du HTML, pour les clients mail texte uniquement
  et l'accessibilité.
- **FR-009** : Chaque courriel DOIT être lisible sur écran mobile
  (largeur ≤ 375 px) et en mode sombre (sans inversion de couleurs
  cassée).
- **FR-010** : Chaque courriel transactionnel DOIT inclure une
  signature « Conseiller Voyage », un footer indiquant qu'il s'agit
  d'un courriel transactionnel non-marketing, et un mécanisme
  permettant au destinataire de mettre à jour ses préférences (sans
  unsubscribe car transactionnel obligatoire, mais lien vers ses
  paramètres de notification).

**Provider et délivrabilité (US3)**

- **FR-011** : Le système DOIT utiliser le provider courriel imposé
  par ADR-0006 (AWS SES en région ca-central-1).
- **FR-012** : Le sous-domaine d'envoi `notifications.conseiller-voyage.ca`
  DOIT être authentifié par SPF, DKIM et DMARC avant la sortie du
  sandbox SES. La configuration vit au niveau du sous-domaine
  exclusivement, sans modification des enregistrements DNS du domaine
  racine `conseiller-voyage.ca`.
- **FR-013** : Le système DOIT recevoir et traiter les notifications
  de rebond et de plainte du provider en moins de 60 secondes après
  émission par le provider.
- **FR-014** : Le système DOIT maintenir une liste de suppression
  consultée avant tout envoi, contenant les adresses ayant produit un
  hard bounce (permanent), un soft bounce répété (30 jours), ou une
  plainte (permanent).
- **FR-015** : Le système DOIT informer le module source qu'un envoi
  a été abandonné pour cause de suppression list, via un signal de
  retour (par exemple, un event `notification.delivery_aborted`).
- **FR-016** : Le système DOIT respecter le rate limit du compte SES
  en temporisant les envois en pic.

**Observabilité (US4)**

- **FR-017** : Le système DOIT instrumenter les métriques suivantes,
  publiées sur la plateforme d'observabilité du projet :
  - nombre de courriels envoyés (avec étiquettes : template, langue,
    module source) ;
  - nombre de courriels délivrés ;
  - nombre de courriels rebondis (avec étiquette : type hard/soft) ;
  - nombre de plaintes ;
  - latence d'envoi (depuis dépôt outbox jusqu'à acceptation provider) ;
  - taille de la file dead-letter.
- **FR-018** : Le système DOIT déclencher une alerte de niveau page
  vers le canal Slack `#ops-page` (mention `@channel`) quand le taux
  de rebond glissant sur 1 h dépasse 5 %.
- **FR-019** : Le système DOIT déclencher une alerte de niveau page
  vers `#ops-page` quand le taux de plainte glissant sur 24 h dépasse
  0,1 %.
- **FR-020** : Le système DOIT déclencher une alerte de niveau warn
  vers le canal Slack `#ops-warn` (silent) quand la file dead-letter
  dépasse 50 entrées.
- **FR-021** : Le système DOIT déclencher une alerte de niveau page
  vers `#ops-page` quand le provider est inaccessible plus de 30
  minutes continues.

**Loi 25 et confidentialité (US5)**

- **FR-022** : Le système DOIT exposer une opération d'effacement
  cross-module consommée par la routine d'effacement Loi 25, qui en
  moins de 60 secondes anonymise tout l'historique d'envoi vers une
  adresse donnée (adresse en clair → null, sujet → null, corps → null)
  tout en conservant les identifiants techniques pour audit 7 ans.
- **FR-023** : Le système NE DOIT JAMAIS journaliser une adresse
  courriel en clair dans les logs applicatifs ou les traces
  d'observabilité — uniquement un hash irréversible.
- **FR-024** : Le système DOIT stocker dans la suppression list un
  hash HMAC peppered de l'adresse (pas un SHA-256 nu), pour empêcher la
  reconstruction par rainbow tables en cas de fuite de la table.
- **FR-025** : Le système DOIT normaliser l'adresse avant lookup en
  suppression list pour neutraliser les variantes Gmail
  (`user+tag@gmail.com`, `u.s.e.r@gmail.com` → forme canonique
  `user@gmail.com`).
- **FR-026** : Le système DOIT conserver le journal d'envoi pendant
  24 mois après l'envoi, puis purger automatiquement les entries
  non-anonymisées (la suppression list a sa propre rétention liée au
  motif d'inscription).

**Outils administratifs (US6)**

- **FR-027** : Tout utilisateur portant le rôle `admin` DOIT pouvoir
  consulter la suppression list paginée et filtrable par raison.
- **FR-028** : Tout utilisateur portant le rôle `admin` DOIT pouvoir
  retirer manuellement une adresse de la suppression list. Le retrait
  exige un motif libre obligatoire (champ texte, minimum 10 caractères)
  et est consigné dans le journal d'audit (acteur, horodatage,
  adresse hashée, motif).
- **FR-029** : Tout utilisateur portant le rôle `admin` DOIT pouvoir
  consulter les entries en dead-letter et déclencher une re-tentative
  manuelle. La re-tentative exige un motif libre obligatoire et est
  consignée dans le journal d'audit.
- **FR-030** : Toute action manuelle administrative sur le système de
  notifications DOIT être consignée dans un journal d'audit
  append-only (cohérent avec la convention 001 conformité,
  `conformite_audit_entries`).

---

### Key Entities

- **Notification Envelope** : objet métier représentant un courriel
  à envoyer, avant rendu. Attributs : identifiant unique, module
  source, type d'événement, adresse destinataire, langue préférée,
  données dynamiques pour le template, horodatage de dépôt.

- **Email Template** : recette de rendu d'un type de courriel. Possède
  un identifiant stable (par exemple `auth.verify_email`), une version
  par langue supportée, des champs de données attendus (typés), un
  preview text, et des règles de rendu mobile/dark mode.

- **Notification Log Entry** : trace de l'envoi (ou tentative) d'un
  courriel. Attributs : identifiant envelope, template utilisé, statut
  (queued/sent/delivered/bounced/complained/failed/cancelled), hash de
  l'adresse destinataire, horodatages de transition d'état, motif
  d'erreur le cas échéant.

- **Suppression List Entry** : adresse à laquelle plus aucun courriel
  ne doit être envoyé. Attributs : hash HMAC peppered de l'adresse
  canonique, raison (`hard_bounce`/`soft_bounce`/`complaint`/`manual`),
  date d'ajout, date d'expiration (nulle si permanente), source
  (système automatique vs opérateur humain).

- **Dead Letter Entry** : entry outbox ayant échoué le maximum de
  tentatives. Attributs : identifiant entry source, motif de la dernière
  erreur, nombre de tentatives, dernière date de tentative, statut de
  traitement humain (en attente / résolu / abandonné).

- **Audit Log Entry** (système de notifications) : trace append-only
  des actions humaines ou systèmes critiques (retrait manuel
  suppression list, re-tentative dead-letter, anonymisation Loi 25).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** : 100 % des entries outbox déposées par les modules 001,
  002 et 002a sont drainées en moins de 24 heures (mesuré sur la
  cohorte 7 jours après go-live).
- **SC-002** : Le délai p95 entre dépôt d'une entry outbox et
  acceptation du courriel par le provider est inférieur à 2 secondes
  en charge nominale (≤ 100 courriels/minute).
- **SC-003** : Le taux de délivrance (courriels remis dans la boîte
  du destinataire vs courriels envoyés) est supérieur ou égal à 98 %
  sur les 30 derniers jours en production.
- **SC-004** : Le taux de rebond global est inférieur à 3 % sur 30
  jours glissants (marge de sécurité vs limite SES à 5 %).
- **SC-005** : Le taux de plainte global est inférieur à 0,05 % sur
  30 jours glissants (marge vs limite SES à 0,1 %).
- **SC-006** : Aucun cas en production où l'inscription d'un nouveau
  conseiller ne produit pas de courriel de vérification dans les 5
  minutes (mesuré par revue hebdomadaire des comptes
  `pending_email_verification` créés ce jour).
- **SC-007** : Zéro adresse courriel en clair retrouvée dans les logs
  applicatifs ou les exports d'audit (vérifié par grep automatisé en CI
  hebdomadaire).
- **SC-008** : 100 % des effacements Loi 25 exécutés via la routine
  cross-module aboutissent à un journal local anonymisé en moins de 60
  secondes (mesuré sur les effacements de test mensuels).
- **SC-009** : Le temps moyen de détection d'un incident de
  délivrabilité (taux de rebond ou de plainte au seuil) est inférieur
  à 15 minutes (alerte page → réception astreinte).
- **SC-010** : Un opérateur peut retirer manuellement une adresse de
  la suppression list en moins de 30 secondes depuis l'ouverture de la
  console (mesure UX).
- **SC-011** : Le système soutient sans dégradation un volume nominal
  de 5 000 courriels envoyés par jour avec pics horaires jusqu'à
  1 500 courriels par heure (cohérent avec l'objectif M18 et le quota
  SES production cible de 50 000/jour).

---

## Assumptions

- **Provider** : AWS SES en région ca-central-1 (ADR-0006 déjà acté,
  consommé tel quel).
- **Sortie sandbox SES** : démarche AWS support traitée en parallèle
  de l'implémentation par les ops ; le système est conçu pour
  fonctionner en sandbox en dev/staging (adresses vérifiées
  uniquement) et en mode production une fois le sandbox levé.
- **Format des adresses** : RFC 5321 (≤ 254 caractères, validation
  Zod côté serveur dans chaque module source).
- **Préférence linguistique** : récupérée depuis le profil du
  destinataire au moment du drainage. Les destinataires sans profil
  (par exemple invités admin avant acceptation) reçoivent FR-CA par
  défaut.
- **Identité de marque de l'expéditeur** : adresse
  `notifications@notifications.conseiller-voyage.ca`, nom d'affichage
  « Conseiller Voyage ». Le sous-domaine dédié isole la réputation
  transactionnelle de futurs usages marketing.
- **Cadence de drainage** : drainage continu via worker, latence
  cible < 5 secondes entre dépôt et tentative d'envoi en conditions
  nominales.
- **Tolérance à la duplication initiale** : pendant la fenêtre où des
  outbox accumulées depuis le go-live de 002 et 002a sont drainées
  pour la première fois, les destinataires peuvent recevoir un
  rattrapage de notifications datées de plusieurs semaines.
  Acceptable car les actions associées (vérifier courriel, configurer
  MFA) restent pertinentes.
- **Compatibilité clients mail** : ciblage des dix clients majeurs
  selon Litmus (Gmail web/mobile, Outlook 365 / 2019, Apple Mail iOS/macOS,
  Thunderbird, Yahoo Mail, Outlook.com, Samsung Mail). Couverture à 95 %
  du parc.
- **Dev local** : un émulateur du provider courriel tourne en
  environnement de développement local. Les courriels y sont
  inspectables via une interface de capture locale (les destinataires
  réels ne sont jamais joints en dev).
- **Audit cross-module** : la routine d'effacement Loi 25 est
  orchestrée par la feature 023 (à venir) — la présente feature
  expose uniquement la primitive consommée. La coordination des
  modules à effacer reste responsabilité de 023.
- **Conservation Loi 25 du journal d'envoi** : 24 mois (proportionnée
  à l'utilité du journal pour supporter les utilisateurs, distincte de
  la conservation 7 ans du journal d'audit conformité).
- **Périmètre des destinataires** : voyageurs, conseillers, admins.
  Les courriels système entre membres de l'équipe (notification
  d'erreur opérationnelle) passent par les canaux d'astreinte
  habituels, hors scope de cette feature.

---

## Dépendances

- ✅ **001 conformité** mergé (PR #1) — table outbox posée, events
  publiés via Redis attendant un worker SES.
- ✅ **002 auth** mergé (PR #14) — table `auth_outbox_emails` posée,
  events de signup/verify/reset/invitation déposés.
- ✅ **002a MFA** mergé (PR #13) — table `mfa_outbox_emails` posée,
  events de setup/step-up/reset déposés.
- ✅ **ADR-0006** Provider SES ca-central-1.
- ✅ **ADR-0003** Observabilité Grafana Cloud Canada.
- ✅ **ADR-0005** Déploiement AWS ECS Fargate (pour le composant
  serverless qui parse les notifications de rebond et plainte).
- 🔲 **ADR à créer** dans le plan : politique de rétention 24 mois du
  journal d'envoi (extension du tableau de rétention de la
  constitution).
- 🔲 **ADR à créer dans le plan** : pepper HMAC pour la suppression
  list et le journal anonymisé (`NOTIFICATIONS_EMAIL_HASH_PEPPER`).

---

## Hors scope explicite (V1)

- **SMS et notifications push** — différés en Tier 5, dépendent d'un
  provider tiers à choisir et d'une décision de fonds (coût, opt-in,
  consentement spécifique CASL/RGPD).
- **Courriels marketing / newsletter** — séparés de la voie
  transactionnelle pour conformité CASL et configuration DKIM dédiée.
- **Webhooks outbound** vers systèmes tiers conseillers (ex. CRM
  externe d'une agence mère) — différé tant qu'aucune demande
  formelle n'existe.
- **Courriel entrant et parsing de réponse** — différé, la plateforme
  reste unidirectionnelle côté courriel.
- **Conversation voyageur ↔ conseiller** — vit dans la feature 013
  (matching), pas dans la couche notification générique.
- **Internationalisation au-delà du français canadien et de l'anglais**
  — différée jusqu'à ouverture du marché hors Canada (Tier 5).
- **Personnalisation par destinataire au-delà des préférences
  linguistiques** (par exemple, choix d'horaires d'envoi, choix des
  types de rappels à recevoir) — différée à la feature 015 (espace
  voyageur post-intake) qui ajoutera ces options.
