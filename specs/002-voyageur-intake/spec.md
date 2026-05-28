# Feature Specification: Module Intake / Préqualification voyageur

**Feature Branch**: `002-voyageur-intake`

**Created**: 2026-05-25

**Status**: Draft

**Input**: User description: "module intake / préqualification voyageur — feature 002 du projet Conseiller Voyage. Permet à un voyageur francophone (FR-CA prioritaire, EN supporté) de décrire son projet de voyage via un formulaire structuré qui produit un brief qualifié, prêt à être matché à des conseillers vérifiés CCV/TICO par la feature matching (future, ID roadmap 011). Aucune transaction monétaire dans cette feature."

---

## Objectif (résumé exécutif)

Le voyageur arrive sur le site avec une intention de voyage non-générique
(*« je veux un voyage en Italie en mars, budget 5-10 k$, en français, on est
3 dont un enfant »*). Il décrit son projet en moins de 7 minutes via un
formulaire en étapes. Le système produit un **brief structuré** capturant
les 5 différenciateurs identifiés dans `docs/positioning.md` (langue,
spécialité, budget fourchette, flexibilité dates, familiarité) — éléments
absents chez Mon Voyage Mon Agence et autres acteurs québécois. Ce brief
sera consommé par la feature matching (future, ID roadmap 011) qui plafonnera à 3 conseillers
notifiés par brief (Principe III).

Aucune transaction monétaire dans cette feature. Pas de compte permanent
exigé : un email vérifié via magic link suffit pour soumettre et suivre.

## Clarifications

### Session 2026-05-28

- Q: Politique UX si AWS SES tombe au moment du submit ? → A: Brief créé `pending_verification` + BullMQ retry SES (5 tentatives, backoff exponentiel). Voyageur voit la page « email-envoyé » immédiatement ; le mail arrive quand SES rouvre. Bouton « renvoyer le lien » disponible après 2 min sans réception.
- Q: Comment différencier les réponses rate-limit email vs IP (FR-019/020) côté API + UI ? → A: Même status `429`, discriminator dans le champ `code` du body. Email-limit → `code: 'EMAIL_RATE_LIMIT_EXCEEDED'` + `retryAfter` → frontend affiche un message FR-CA précis (3 briefs en 24h, alternatives proposées). IP-limit → `code: 'RATE_LIMIT_EXCEEDED'` neutre → frontend affiche un message générique anti-énumération. Ordre d'évaluation : email-limit d'abord (favorise utilisateur légitime), IP-limit ensuite.
- Q: Quel scope pour la reprise de formulaire localStorage 24h (PII comprise ou non) ? → A: 5 étapes intégrales (PII comprise) en localStorage du device voyageur, TTL 24h, clear post-submit OK et clear sur logout magic link. Loi 25 couvre la donnée détenue par l'entreprise (serveur) — le localStorage sur le device du voyageur lui appartient. À mentionner dans la politique de confidentialité (clause « stockage local côté client »).
- Q: Granularité effacement Loi 25 : brief seul, cascade contact, ou hybride ? → A: Hybride. **Par défaut**, l'effacement d'un brief ne touche QUE ce brief (status `deleted`, audit) — le contact partagé et les autres briefs persistent. Un **flow séparé explicite** `/voyage/mes-donnees/effacer-tout` permet au voyageur d'effacer le contact + tous ses briefs en une opération (FR-022a). Cohérent avec le pattern 001 (effacement conseiller = acte explicite global) et la séparation Contact/Brief du data model.
- Q: Durée du cookie session voyageur post-vérification magic link ? → A: 7 jours **rolling renewal** — chaque visite à la page récap étend le cookie de 7 jours depuis cette visite. Voyageur actif 1x / semaine reste connecté sans friction ; 7 jours d'inactivité → cookie expire → nouveau magic link nécessaire. Limite le blast radius en cas de vol device après période d'inactivité.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Voyageur soumet un brief de voyage qualifié (Priority: P1)

Marie, 42 ans, résidente de Laval, planifie le voyage de noces de son frère
en Italie pour mars 2027. Elle veut un conseiller qui parle français,
spécialisé en lune de miel, budget 5 000-10 000 CAD pour 2 personnes, dates
flexibles à ±5 jours. Elle remplit le formulaire en 6 minutes, valide son
email via le lien reçu, et reçoit la confirmation que jusqu'à 3 conseillers
vérifiés vont la contacter sous 24 h.

**Why this priority** : C'est la **valeur cœur** de la plateforme — sans ce
flux, aucun lead ne peut être produit, donc aucun matching et aucune
monétisation. C'est l'équivalent du *« submit dossier »* de la feature 001 :
le squelette du MVP.

**Independent Test** : Un voyageur fictif remplit le formulaire dans
l'environnement de test, vérifie son email magic link, et le brief résultant
est vérifiable en BD avec toutes les données structurées + le consentement
Loi 25 horodaté. La feature matching (future, ID roadmap 011) peut alors consommer ce brief.

**Acceptance Scenarios** :

1. **Given** un voyageur arrive sur `/[locale]/voyage/nouveau` sans session,
   **When** il remplit toutes les étapes du formulaire avec des données
   valides et accepte le consentement Loi 25,
   **Then** un courriel magic link est envoyé à son adresse, le brief est
   créé en BD avec statut *« en attente de vérification email »*, et un
   compteur de complétion temps réel est enregistré.

2. **Given** le voyageur clique sur le magic link dans son courriel dans
   les 24 h, **When** le lien est valide et non expiré,
   **Then** le brief passe au statut *« actif »*, un évènement
   `voyageur.brief.activated` est publié sur l'outbox pour la feature matching (ID roadmap 011).

3. **Given** le voyageur tente de soumettre un formulaire avec un champ
   obligatoire vide (ex : destination),
   **When** il clique sur *« Soumettre »*,
   **Then** la validation côté client + serveur retourne un message
   d'erreur FR-CA précis sur le champ fautif, le brief n'est pas créé,
   et le formulaire reste rempli (pas de perte de saisie).

4. **Given** le voyageur tente de soumettre 4 briefs depuis le même email
   en 24 h, **When** la 4e soumission arrive côté serveur,
   **Then** le système refuse avec un message expliquant la limite
   (max 3 briefs / 24 h / email), aucun brief n'est créé.

---

### User Story 2 - Voyageur consulte le statut de son brief (Priority: P2)

Marie a soumis son brief il y a 3 jours. Elle a reçu un courriel de
confirmation puis le silence. Elle clique sur le lien *« Voir mon brief »*
dans ce courriel pour vérifier ce qui se passe : est-ce que des conseillers
l'ont contactée ? combien ? quand expire le brief ?

**Why this priority** : La transparence du statut est la base de la
confiance utilisateur. Sans cette vue, Marie n'a aucun moyen de savoir si
son brief est traité, et risque de re-soumettre (générant du bruit) ou
d'abandonner (perdant le lead).

**Independent Test** : Soumettre un brief, attendre la vérif email,
visiter l'URL du brief via le magic link, et confirmer que la page affiche :
résumé des données soumises, statut courant (actif / en attente /
expiré / supprimé), nombre de conseillers contactés (0 dans cette feature
isolée), date d'expiration prévue.

**Acceptance Scenarios** :

1. **Given** Marie a un brief actif, **When** elle clique le magic link
   *« Voir mon brief »* dans le courriel de confirmation,
   **Then** elle voit une page récapitulative en lecture seule de son brief
   avec statut *« actif »*, date de création, date d'expiration, et un
   message informant que la feature matching n'est pas encore livrée (en
   pré-MVP).

2. **Given** le magic link a expiré (> 7 jours après l'envoi),
   **When** Marie clique dessus,
   **Then** elle voit une page d'erreur avec un bouton *« Renvoyer un
   nouveau lien »* qui regénère un token et un courriel.

3. **Given** Marie a 2 briefs distincts en cours (voyage famille +
   voyage solo),
   **When** elle visite le récap depuis un magic link de l'un,
   **Then** la page affiche uniquement ce brief précis, mais offre un lien
   *« Voir mes autres briefs »* qui réutilise le même email pour lister
   tous les briefs actifs.

---

### User Story 3 - Voyageur soumet un second brief distinct (Priority: P2)

Marie a soumis son brief *« voyage de noces frère »* il y a une semaine.
Elle a maintenant un autre besoin : un voyage solo en Asie pour elle, budget
2-5 k$. Elle revient sur le site et soumet un second brief avec le même
email mais des paramètres complètement différents.

**Why this priority** : Un voyageur engagé peut avoir plusieurs projets.
Forcer un compte permanent juste pour cela créerait de la friction
inutile (cf. positioning §1). La feature DOIT permettre la multi-soumission
sans compte.

**Independent Test** : Soumettre 2 briefs avec le même email dans la même
journée, vérifier que les 2 sont enregistrés distinctement avec leur propre
identifiant et magic link, et que le rate-limit (3/24 h/email) est
respecté.

**Acceptance Scenarios** :

1. **Given** Marie a déjà soumis un brief vérifié il y a 7 jours,
   **When** elle soumet un nouveau brief avec le même email mais des
   destinations/dates/budget différents,
   **Then** le second brief est créé indépendamment, reçoit son propre
   magic link de vérification, et n'écrase pas le premier.

2. **Given** Marie a 3 briefs déjà créés dans les dernières 24 h,
   **When** elle tente d'en soumettre un 4e avec le même email,
   **Then** le système refuse avec un message expliquant la limite et lui
   propose d'attendre 24 h ou d'utiliser une autre adresse.

---

### User Story 4 - Voyageur retire son brief (Loi 25 effacement) (Priority: P3)

Marie a changé d'avis : elle a finalement réservé via Expedia. Elle ne veut
plus que ses données circulent. Elle clique *« Supprimer mes données »*
depuis la page récap, confirme par typage exact d'une phrase, et reçoit
confirmation que toute donnée personnelle a été effacée.

**Why this priority** : Exigence légale Loi 25 (droit à l'effacement).
Non-critique pour le MVP voyageur initial, mais bloquant pour la mise en
production grand public.

**Independent Test** : Soumettre un brief, demander l'effacement, vérifier
en BD que les champs PII (nom, email, téléphone, adresse) sont nullifiés ou
anonymisés, mais que l'identifiant du brief et le timestamp sont conservés
dans l'audit log (preuve de conformité Loi 25).

**Acceptance Scenarios** :

1. **Given** Marie a un brief actif, **When** elle clique
   *« Supprimer mes données »* puis confirme par typage exact de la phrase
   demandée,
   **Then** un job d'effacement est enregistré, ses PII sont anonymisées
   immédiatement, le brief passe au statut *« supprimé »*, et une entrée
   d'audit log conservant uniquement l'identifiant et le timestamp est
   conservée.

2. **Given** Marie a effacé son brief, **When** elle clique sur le magic
   link plus tard,
   **Then** elle voit une page neutre indiquant *« Brief supprimé »* sans
   exposer aucune donnée personnelle, et confirme la suppression de toute
   PII.

---

### User Story 5 - Admin traite manuellement un brief sans match (Priority: P3)

Pierre (admin) consulte la file admin. Un brief soumis hier n'a pas pu être
matché automatiquement par la feature matching (ID roadmap 011) (par exemple : destination très
niche, langue rare). Pierre voit le brief dans une file
*« non-matchés automatiquement »*, l'examine, et le pousse manuellement à
un conseiller du réseau qu'il sait compétent.

**Why this priority** : Filet de sécurité pour ne perdre aucun lead. La
feature matching (ID roadmap 011) ne couvrira pas 100 % des cas dès J1. Ce flux admin permet de
garder le service utile même en cas de match algorithmique impossible.

**Independent Test** : Créer un brief avec des critères très restrictifs
(ex : langue = japonais, spécialité = voyage extrême), vérifier qu'il
apparaît dans la file admin avec un drapeau, et qu'un admin peut le
ré-assigner manuellement (cette feature ne fait que la file et le drapeau,
le push lui-même est partie de la feature matching (ID roadmap 011)).

**Acceptance Scenarios** :

1. **Given** un brief actif depuis > 4 h sans aucun conseiller contacté
   (signal envoyé par la feature matching future (ID roadmap 011)),
   **When** un admin consulte sa file de revue,
   **Then** ce brief apparaît avec un drapeau *« non-matché auto »* et
   les détails complets.

2. **Given** un admin a poussé manuellement un brief à un conseiller,
   **When** le conseiller voit le lead,
   **Then** un évènement d'audit est créé indiquant l'admin acteur, le
   conseiller cible, et le motif de push manuel (champ texte 20-500
   caractères obligatoire).

---

### Edge Cases

- **Email mal formé** : Validation Zod côté serveur, message d'erreur FR-CA
  précis (*« Cette adresse courriel ne semble pas valide. Vérifiez la
  présence du @ et du domaine. »*).
- **Email jetable / temporaire** (mailinator, 10minutemail, etc.) : Bloquer
  via liste publique d'emails jetables (signal anti-spam), message FR-CA
  *« Cette adresse semble temporaire. Nous avons besoin d'un courriel
  durable pour vous mettre en relation avec un conseiller. »*
- **Soumission depuis IP avec proxy / VPN suspect** : Pas de blocage
  systématique, mais marqueur dans le brief pour audit ultérieur.
- **Navigateur ferme à mi-formulaire** : Sauvegarde locale (état complet
  des 5 étapes — PII étape 5 comprise — dans `localStorage` du device
  voyageur) pour reprise dans 24 h sur le même device. TTL 24 h appliqué
  via timestamp dans le payload ; auto-clear après soumission réussie
  ET après logout magic link. **Aucune** persistence serveur tant que
  l'email n'est pas vérifié (anti-PII serveur). Le stockage local sur
  le device propre du voyageur n'est pas couvert par Loi 25 (donnée non
  détenue par l'entreprise), mais cette pratique **DOIT** être
  mentionnée explicitement dans la politique de confidentialité
  (clause « stockage local côté client »).
- **Date de retour avant la date de départ** : Validation client + serveur,
  message *« La date de retour doit être après la date de départ. »*
- **Voyage dans le passé** : Refusé avec message contextuel *« Cette date
  est dépassée. Avez-vous voulu saisir une date future ? »*
- **Voyage dans plus de 3 ans** : Accepté mais avec un signal *« Très loin
  dans le futur — les tarifs ne sont généralement pas encore disponibles. »*
- **Brief expire à J+90** : 7 jours avant expiration, un courriel de
  rappel automatique est envoyé. À J+90, le brief passe au statut
  *« expiré »*, un évènement d'audit est créé, les PII sont nullifiées mais
  l'agrégat statistique anonyme est conservé.
- **Voyageur supprime son brief alors qu'un conseiller l'a déjà contacté**
  (Loi 25 + équité conseiller) : Le brief est supprimé côté voyageur ; le
  conseiller voit *« Ce voyageur a retiré sa demande »* sans accès aux PII.
- **Tentative de soumission concurrente** (le voyageur clique deux fois
  rapidement sur *« Soumettre »*) : Idempotence garantie par clé client
  envoyée à chaque soumission, le serveur dédoublonne.
- **AWS SES indisponible au submit** : Le brief est créé en statut
  *« en attente de vérification »* et l'envoi du magic link est mis en
  file BullMQ (retry exponentiel jusqu'à 5 tentatives, backoff base 30s
  → max 30 min). Le voyageur voit immédiatement la page *« vérifie ton
  courriel »* avec un sous-titre discret *« il peut y avoir un léger
  délai »*. Un bouton *« Je n'ai rien reçu — renvoyer un lien »*
  apparaît après 120 s sans réception (FR-013a).

## Requirements *(mandatory)*

### Functional Requirements — Capture du brief (P1)

- **FR-001** : Le système **DOIT** présenter un formulaire en étapes
  numérotées (max 5 étapes) avec barre de progression visible.
- **FR-002** : L'étape 1 **DOIT** capturer la **destination** (texte libre
  ou sélection autocomplete depuis une liste de pays/régions canoniques)
  et permettre plusieurs destinations (multi-stop).
- **FR-003** : L'étape 2 **DOIT** capturer les **dates** : date de départ,
  date de retour, et un toggle *« mes dates sont flexibles »* qui révèle un
  champ d'amplitude (± N jours, 1-30 jours).
- **FR-004** : L'étape 3 **DOIT** capturer la **composition du groupe** :
  nombre d'adultes, nombre d'enfants (avec leur âge si > 0), nombre de
  bébés.
- **FR-005** : L'étape 4 **DOIT** capturer le **budget fourchette** en
  CAD : *< 2 000* / *2 000-5 000* / *5 000-10 000* / *10 000-20 000* /
  *20 000+*. Un champ optionnel permet d'ajouter une précision libre.
- **FR-006** : L'étape 4 **DOIT** capturer la **langue souhaitée du
  conseiller** : FR / EN / ES / autre (champ texte libre si autre). Au
  moins une langue obligatoire.
- **FR-007** : L'étape 4 **DOIT** capturer la **spécialité de voyage**
  depuis une liste fermée canonique (croisière / aventure / lune de miel /
  famille avec enfants / voyage adapté mobilité réduite / multigénérationnel
  / culturel / luxe / road trip / voyage d'affaires / autre avec
  précision libre). Au moins une spécialité obligatoire.
- **FR-008** : L'étape 4 **DOIT** capturer la **familiarité du voyageur** :
  *premier grand voyage international* / *voyageur occasionnel (1-3
  voyages internationaux)* / *voyageur expérimenté (4+ voyages)*.
- **FR-009** : L'étape 5 **DOIT** capturer les **coordonnées** : prénom,
  nom de famille, courriel, téléphone optionnel, code postal du voyageur
  (pour évaluer la distance à un conseiller).
- **FR-010** : L'étape 5 **DOIT** présenter le **consentement Loi 25**
  comme une case à cocher non pré-cochée avec un texte clair en FR-CA
  expliquant exactement ce qui sera fait avec les données, la durée de
  rétention, et le droit à l'effacement.
- **FR-011** : Le système **DOIT** valider toutes les saisies côté serveur
  via un schéma Zod, indépendamment de la validation client (Principe IX).
  Les messages d'erreur **DOIVENT** être en FR-CA par défaut, EN si
  l'utilisateur est en `/en/`.
- **FR-012** : Tant que le voyageur n'a pas vérifié son email via le magic
  link, le brief **DOIT** être en statut *« en attente de vérification »*
  et ne **DOIT PAS** être pushé aux conseillers ni apparaître dans la file
  admin.

### Functional Requirements — Vérification email et statut (P1, P2)

- **FR-013** : Après soumission, le système **DOIT** envoyer dans la minute
  un courriel transactionnel FR-CA (ou EN selon le locale du voyageur)
  contenant un magic link unique signé, expirant à J+7.
- **FR-013a** : Si l'envoi via AWS SES échoue (5xx, throttle, timeout),
  le système **DOIT** créer le brief en statut *« en attente de
  vérification »* malgré l'échec et placer la tentative d'envoi dans
  une file BullMQ avec retry exponentiel (max 5 tentatives, backoff
  30 s → 30 min). La page *« vérifie ton courriel »* **DOIT** s'afficher
  immédiatement avec mention discrète d'un délai possible. Un bouton
  *« Je n'ai rien reçu — renvoyer un lien »* **DOIT** être révélé après
  120 s sans réception (compteur visible côté client).
- **FR-014** : Le clic sur le magic link **DOIT** activer le brief
  (statut → *« actif »*) et publier un événement
  `voyageur.brief.activated` consommable par la feature matching (ID roadmap 011).
- **FR-014a** : À la vérification réussie du magic link, le système
  **DOIT** poser un cookie de session voyageur (`__Host-cv.intake.token`
  en prod HTTPS, `cv.intake.session` en dev HTTP) avec
  `Max-Age=604800` (7 jours), `HttpOnly`, `Secure`, `SameSite=Lax`,
  `Path=/`. Chaque visite ultérieure à la page récap (`/voyage/<token>`
  ou `/voyage/mes-briefs`) **DOIT** **renouveler** le cookie pour 7
  jours à partir de cette visite (**rolling renewal**). 7 jours
  d'inactivité → cookie expire → nouveau magic link nécessaire.
- **FR-015** : Un magic link expiré ou déjà consommé **DOIT** afficher une
  page d'erreur claire avec un bouton *« Renvoyer un nouveau lien »* qui
  regénère un token et déclenche un nouvel envoi.
- **FR-016** : La page de suivi du brief (`/[locale]/voyage/<token>`)
  **DOIT** afficher en lecture seule : résumé des champs soumis, statut
  courant, date de création, date d'expiration prévue (J+90).
- **FR-017** : La page de suivi **DOIT** lister les autres briefs actifs
  du même email via un lien *« Voir mes autres briefs »*.

### Functional Requirements — Multi-briefs et anti-spam (P2)

- **FR-018** : Un voyageur **DOIT** pouvoir soumettre plusieurs briefs
  distincts avec la même adresse courriel ; chaque brief a son propre
  identifiant et magic link.
- **FR-019** : Le système **DOIT** plafonner à **3 briefs / 24 h / adresse
  courriel** ; la 4e tentative dans cette fenêtre est refusée avec un
  status HTTP `429` et un body `{ code: 'EMAIL_RATE_LIMIT_EXCEEDED',
  retryAfter: <secondes> }`. Le frontend **DOIT** afficher un message
  FR-CA explicite (« Vous avez soumis 3 briefs sur cette adresse en
  24 h — attendez X heures ou utilisez une autre adresse »).
- **FR-020** : Le système **DOIT** plafonner à **5 briefs / 24 h / adresse
  IP** ; les soumissions au-delà sont refusées avec un status HTTP
  `429` et un body neutre `{ code: 'RATE_LIMIT_EXCEEDED' }` (sans
  retryAfter ni mention de l'IP). Le frontend **DOIT** afficher un
  message générique (« Votre demande ne peut être traitée actuellement,
  veuillez réessayer plus tard ») afin de ne pas révéler la limite à
  un bot.
- **FR-020a** : L'**ordre d'évaluation** des deux limites **DOIT** être :
  email-limit d'abord (favorise la signalisation utile à l'utilisateur
  légitime), IP-limit ensuite. Conséquence : si Marie hit les deux
  limites simultanément, elle reçoit le message email-limit (utile)
  plutôt que le message neutre (déroutant pour elle).
- **FR-021** : Le système **DOIT** détecter et bloquer les adresses
  courriel jetables via une liste publique mise à jour mensuellement.

### Functional Requirements — Loi 25 et rétention (P3)

- **FR-022** : Le voyageur **DOIT** pouvoir demander l'effacement **d'un
  brief précis** depuis la page de suivi de ce brief, via une
  confirmation par typage exact d'une phrase imposée (anti-erreur,
  modèle US5 feature 001). L'effacement d'un brief ne touche **que ce
  brief** ; le contact partagé et les autres briefs du même voyageur
  persistent inchangés.
- **FR-022a** : Le voyageur **DOIT** pouvoir effacer **toutes ses
  données** (contact + tous ses briefs) en une opération via un flow
  séparé accessible depuis la page « Voir mes autres briefs » (FR-017),
  sous le chemin `/[locale]/voyage/mes-donnees/effacer-tout`.
  Confirmation par typage exact d'une phrase distincte (« JE_CONFIRME_
  LA_SUPPRESSION_DE_TOUTES_MES_DONNEES »), avec rappel explicite du
  nombre de briefs concernés.
- **FR-023** : Sur effacement (FR-022 ou FR-022a), les champs PII
  applicables (prénom, nom, courriel, téléphone, code postal de la table
  `VoyageurContact` ; aucune PII directe dans `VoyageurBrief`) **DOIVENT**
  être nullifiés selon la portée de la demande. Le statut des briefs
  affectés passe à *« supprimé »* ; une entrée d'audit log conservant
  uniquement l'identifiant brief/contact et le timestamp est créée par
  ressource affectée.
- **FR-024** : Tout brief actif **DOIT** expirer 90 jours après sa
  création s'il n'a pas été matché à un conseiller ayant émis un devis ;
  à expiration, les PII sont nullifiées et le statut passe à *« expiré »*.
- **FR-025** : 7 jours avant l'expiration prévue, le système **DOIT**
  envoyer un courriel de rappel proposant de re-soumettre un brief
  similaire pour étendre la fenêtre.

### Functional Requirements — File admin et flux manuel (P3)

- **FR-026** : Un brief actif depuis plus de 4 h sans aucun conseiller
  notifié (signal de la feature matching (ID roadmap 011)) **DOIT** apparaître dans une file
  admin *« non-matchés auto »* avec drapeau visible.
- **FR-027** : Un admin **DOIT** pouvoir consulter le détail complet d'un
  brief non-matché et déclencher un push manuel vers un conseiller
  spécifique (le push lui-même est implémenté en feature matching (ID roadmap 011) ; cette
  feature ne fait que rendre disponible la file et le détail).
- **FR-028** : Toute action admin sur un brief **DOIT** être tracée en
  audit log (acteur admin, brief cible, motif texte 20-500 caractères).

### Functional Requirements — i18n et accessibilité (transverse)

- **FR-029** : Toutes les chaînes utilisateur **DOIVENT** passer par le
  catalogue i18n. FR-CA est le default ; EN est livré dès J1 ; structure
  extensible pour ES en feature ultérieure.
- **FR-030** : Le formulaire **DOIT** être navigable au clavier
  intégralement (Principe XI, WCAG 2.1 AA) ; chaque champ a un libellé
  associé ; les erreurs sont annoncées par `aria-live` ; aucune dépendance
  à la souris.

### Key Entities *(include if feature involves data)*

- **VoyageurBrief** : Le brief structuré soumis par un voyageur.
  Contient toutes les données collectées (destination, dates, groupe,
  budget, langue, spécialité, familiarité), un statut
  (*pending_verification / active / matched / expired / deleted*), un
  identifiant UUID v4, une date de création, une date d'expiration prévue
  (J+90), un horodatage de consentement Loi 25.

- **VoyageurContact** : Les coordonnées du voyageur isolées des données
  de voyage (PII séparée). Contient prénom, nom, email, téléphone optionnel,
  code postal, et un compteur de briefs soumis dans la fenêtre 24 h pour
  appliquer le rate-limit. Référencée par 1..N VoyageurBrief.

- **MagicLinkToken** : Token signé temporaire pour vérifier l'email d'un
  voyageur et lui permettre de consulter son brief. Contient un identifiant,
  un hash du token, une référence au VoyageurBrief, une date d'expiration
  (J+7 par défaut), un statut *unused / consumed / expired*. Un nouveau
  token est généré à chaque renvoi de magic link.

- **BriefAuditEntry** : Entrée d'audit append-only de toute action sur un
  brief (création, vérification email, modification statut, effacement,
  push admin manuel). Réutilise le mécanisme audit append-only de la
  feature 001 (Principe X-fiabilité).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** : Au moins **65 %** des voyageurs qui commencent le formulaire
  (étape 1 affichée) le complètent et soumettent (étape 5 confirmée).
- **SC-002** : Le **temps médian de complétion** du formulaire est de **6
  minutes ou moins**, mesuré depuis l'affichage de l'étape 1 jusqu'à la
  soumission finale.
- **SC-003** : Au moins **90 %** des briefs soumis ont un budget fourchette
  renseigné (différenciateur clé vs Mon Voyage Mon Agence selon
  `docs/positioning.md` §3).
- **SC-004** : Au moins **80 %** des briefs soumis ont une langue conseiller
  renseignée explicitement (au-delà du FR par défaut).
- **SC-005** : Le **taux d'erreur de validation à la soumission** est
  inférieur à **5 %**, signe que l'UX guide correctement le voyageur en
  amont (signaux visuels clairs sur champs invalides avant submit).
- **SC-006** : Au moins **70 %** des voyageurs qui soumettent vérifient
  leur email magic link dans les 24 h.
- **SC-007** : Le **taux d'abus** (briefs spam, jetables, ou bots) reste
  inférieur à **3 %** des soumissions, mesuré par marquage manuel d'un
  échantillon hebdomadaire.
- **SC-008** : **100 %** des demandes d'effacement Loi 25 sont traitées en
  moins de 60 secondes après confirmation (mesuré entre clic confirmation
  et nullification des PII).
- **SC-009** : Le formulaire est **100 % navigable au clavier** sans souris
  (validation manuelle pré-release + audit axe-core en CI).

## Assumptions

- Le voyageur arrive via un canal organique (SEO, bouche-à-oreille,
  référence conseiller) ou un canal payant ; cette feature ne gère pas
  l'acquisition, seulement la conversion une fois sur le site.
- L'identité voyageur est gérée *light* : email + magic link, sans table
  users complète. La feature future identité voyageur permanente consolidera plus tard si un
  voyageur veut un vrai compte (multi-device, historique long, etc.).
- La vérification email est **2-step** : le brief n'est actif et
  visible des conseillers qu'après que le voyageur ait cliqué le magic
  link. Raison : anti-spam (un bot ne peut pas valider un email réel) et
  garantie que la livraison du futur devis est possible.
- La liste des spécialités v1 est **fermée** (11 valeurs canoniques)
  pour permettre le scoring déterministe de la feature matching (ID roadmap 011). Une valeur
  *« autre + texte libre »* couvre les cas hors liste, et un admin peut
  promouvoir une valeur *« autre »* récurrente vers une nouvelle entrée
  canonique en feature matching (ID roadmap 011).
- Le brief expire à J+90 sans possibilité de prolongation directe par le
  voyageur (sinon manipulation du scoring matching). Le voyageur peut
  re-soumettre un brief similaire.
- L'envoi des courriels (magic link, rappel expiration, confirmation
  effacement) réutilise l'infrastructure AWS SES ca-central-1 de la
  feature 001 (ADR-0006).
- Les évènements outbox publiés par cette feature
  (`voyageur.brief.activated`, `voyageur.brief.deleted`,
  `voyageur.brief.expired`) seront consommés par la feature matching (ID roadmap 011)
  (matching) ; le contrat évènement est partagé via `packages/shared`.
- La feature 001 (conformité) est mergée avant le démarrage du
  développement, donc le module identité (AuthGuard, AuthSession,
  prisma.authSession) et l'audit log append-only sont disponibles.
- Le module matching (feature matching (ID roadmap 011)) n'est PAS un pré-requis : cette
  feature livre une valeur autonome (collecte qualifiée + suivi voyageur),
  même si le matching n'est pas encore branché. Les évènements outbox
  s'accumulent en attendant la feature matching (ID roadmap 011).

## Dependencies

- **Feature 001 (conformité)** mergée vers `main` : besoin de l'infra
  audit log append-only, AWS SES configuré, observabilité OTel + Sentry,
  schéma de migration Prisma testé.
- **Module identité (feature identité voyageur permanente)** PAS un pré-requis : authentification
  voyageur reste sur magic link signé pour ce MVP.
- **Module matching (feature matching (ID roadmap 011))** PAS un pré-requis : les évènements
  outbox produits par cette feature seront consommés quand la 003 sera
  livrée. En attendant, le brief reste actif jusqu'à J+90 ou demande
  d'effacement.

## Out of Scope (v1 de cette feature)

- ❌ Création d'un compte permanent voyageur avec mot de passe (feature
  006).
- ❌ Algorithme de matching brief ↔ conseiller (feature matching (ID roadmap 011)).
- ❌ Notification des conseillers (feature matching (ID roadmap 011)).
- ❌ Gestion des devis envoyés par les conseillers (feature future devis).
- ❌ Paiement, réservation, ou toute transaction (hors périmètre Principe I).
- ❌ Application mobile native (web responsive uniquement pour v1).
- ❌ Intégration calendrier (Google Calendar, Outlook) pour les dates.
- ❌ Upload de pièces jointes au brief (passeport, demandes spéciales) —
  envisagé en v2 si besoin avéré.
- ❌ Chat en direct voyageur ↔ conseiller (envisagé en feature future chat
  messagerie).
