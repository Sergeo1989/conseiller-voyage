# Feature Specification: Profil conseiller (public + privé)

**Feature Branch**: `007-profil-conseiller`

**Roadmap ID**: 005 (Tier 1 — Activation conseiller B2B)

**Created**: 2026-05-27

**Status**: Draft

**Input**: User description: "005 profil conseiller"

---

## Contexte produit

Le **conseiller en voyage** est l'unité économique de la plateforme : sans
profil exposé, il n'existe pas pour le voyageur. Cette feature livre les
deux faces complémentaires de cette présence :

1. **Vue publique** — page accessible sans authentification, présentée
   au voyageur comme un point de confiance avant d'entrer dans l'intake.
   **Pas de canal de contact direct** : seul CTA mène vers le formulaire
   de qualification (`/intake`), conformément à [ADR-0002](../../docs/adr/0002-pas-de-cta-contact-direct.md).
2. **Vue privée (dashboard)** — espace authentifié du conseiller où il
   édite son profil, suit ses leads, consulte son statut de conformité
   et sa facturation.

La feature s'appuie sur les fondations Tier 0 déjà mergées :

- **Conformité** (feature 001) — un profil n'est visible publiquement que
  si `ConformiteQueryPort` renvoie statut `verified`.
- **Identité** (features 002 + 002a) — seuls les conseillers authentifiés
  (mot de passe + MFA actif) accèdent au dashboard.
- **Mentions légales** (feature 004) — le middleware bloque l'accès au
  dashboard si le conseiller n'a pas accepté la version courante des CGU.

Cette spec couvre le **MVP fonctionnel** du profil. Les optimisations SEO
avancées (Schema.org JSON-LD étendus, hreflang, sitemap dédié,
distribution CDN images) sont scope de la feature 016 (Tier 3 SEO).

---

## Clarifications

### Session 2026-05-27

- Q: Stratégie de slug du conseiller (URL immuable post-publication, réservée à vie après effacement Loi 25) → A: `prenom-nom` slugifié FR-CA (ASCII fold, lowercase, espaces→tirets) avec suffixe numérique en cas de collision (`marie-dupont`, `marie-dupont-2`, …). Génération automatique au premier passage en statut `verified`. Le conseiller ne choisit pas son slug.
- Q: Sémantique du CTA `/intake?suggested=<id>` côté algorithme de matching (feature 011) → A: Boost soft du scoring ≤ +10 % cumulé au scoring normal, validité 24 h après ouverture de la page publique. Aucun override du plafond Principe III (3 max) ; le conseiller suggéré peut être écarté s'il est fortement non aligné. Le paramètre `suggested` est validé serveur (existence + statut `verified` + fraîcheur) et reflété dans le contexte intake visible au voyageur.
- Q: Onboarding du profil post-vérification — obligatoire ou facultatif ? → A: Facultatif avec relances. Le conseiller verified mais au profil incomplet conserve l'accès au dashboard (avec warning persistant), mais sa page publique reste 404 et il est exclu du matching tant que le profil n'est pas `prêt`. Relances email transactionnelles à J+3, J+7, J+14 post-vérification, drainées via feature 003 (SES). Pas de hard-block UX, l'invisibilité fonctionnelle est le levier.
- Q: Nom affiché publiquement sur la page conseiller — quelle forme ? → A: `Prénom + initiale-nom` par défaut (ex. « Marie D. »), avec opt-in conseiller pour afficher le nom complet (« Marie Dupont »). Aucun pseudonyme autorisé (l'identité affichée reste rattachée à l'identité vérifiée). Le slug URL reste `prenom-nom` (cf. Q1) indépendamment du nom affiché — asymétrie intentionnelle : URL stable et indexable, libellé visible plus discret. Schema.org `Person.name` utilise la même valeur que l'affichage UI.
- Q: Outil de modération éditoriale pour MVP (retrait photo / masquage profil non conforme) → A: Extension de la console conformité existante (feature 001). Nouvel onglet « Profils » avec actions « retirer photo » et « masquer profil temporairement », audit immutable identique au flux conformité (rétention 7 ans), RBAC admin. Pas d'ADR séparé : extension naturelle de 001 sans nouveau module. Workflow de modération en équipe et outil dédié = scope d'une feature ultérieure (Tier 4/5) quand le volume le justifiera.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Conseiller édite son profil privé (Priority: P1) 🎯 MVP

Le conseiller authentifié accède au dashboard et édite les éléments
constitutifs de son profil : titre / accroche, biographie, spécialités
(thématiques de voyage), zones géographiques d'expertise, langues
parlées, années d'expérience, photo. Les modifications sont sauvegardées
avec validation côté serveur, et un statut `Profil incomplet` /
`Profil prêt à publier` est affiché tant que les champs obligatoires
manquent.

**Why this priority** : sans données saisies, il n'y a rien à exposer
publiquement. C'est la source de vérité de la feature, et elle est
indépendante (peut être livrée et démontrée avant US2).

**Independent Test** : un conseiller vérifié se connecte, ouvre l'onglet
« Mon profil », remplit les champs obligatoires, sauvegarde, recharge la
page — les valeurs persistent. Le statut passe de `incomplet` à `prêt`.

**Acceptance Scenarios** :

1. **Given** un conseiller authentifié avec statut conformité `verified`
   et profil vide, **When** il ouvre `/conseiller/profil`, **Then** il
   voit un formulaire pré-rempli (champs obligatoires marqués) et un
   indicateur visuel « Profil incomplet ».
2. **Given** un conseiller qui remplit titre, biographie ≥ 100
   caractères, ≥ 1 spécialité, ≥ 1 langue et une photo, **When** il
   sauvegarde, **Then** la page recharge et affiche « Profil prêt à
   publier ».
3. **Given** un conseiller qui efface sa biographie, **When** il tente
   de sauvegarder, **Then** un message d'erreur indique le champ manquant
   et la sauvegarde est refusée.
4. **Given** un conseiller qui dépose une photo > 5 Mo ou de format
   non-image, **When** il tente l'upload, **Then** un message d'erreur
   en FR-CA explique la contrainte (taille / format).

---

### User Story 2 — Voyageur découvre un conseiller vérifié (Priority: P1) 🎯 MVP

Un voyageur navigue (depuis un moteur de recherche, un partage, ou une
liste interne) vers la page publique d'un conseiller. Il voit la photo,
le nom affiché (`Prénom + initiale-nom` par défaut, ou nom complet si
le conseiller l'a opté — cf. FR-006a), la biographie, les certifications
visibles (gage de sérieux, lues depuis le module conformité), les
spécialités, les langues, les années d'expérience. Aucun bouton de
contact direct n'apparaît — un seul CTA mène à `/intake` avec un signal
serveur indiquant que ce conseiller a été consulté (boost de scoring
soft, jamais une garantie d'inclusion — cf. FR-008a).

**Why this priority** : c'est la valeur métier visible au voyageur. Sans
US2, US1 produit des données invisibles. La feature MVP livre US1 + US2
ensemble (intégration via `ConformiteQueryPort` pour le filtrage strict).

**Independent Test** : seed un conseiller vérifié avec profil complet,
ouvrir `/conseiller/<slug>` sans authentification — la page rend tous
les champs attendus et le CTA pointe vers `/intake?suggested=<id>`.

**Acceptance Scenarios** :

1. **Given** un conseiller avec profil complet et statut `verified`,
   **When** un visiteur anonyme ouvre la page publique, **Then** il voit
   tous les champs du profil + la liste de certifications visibles +
   un encart « Pourquoi je ne peux pas le contacter directement ? » +
   un CTA unique « Décrivez votre projet ».
2. **Given** un conseiller non vérifié (statut `pending` ou `expired`)
   ou supprimé, **When** un visiteur anonyme tente d'ouvrir sa page
   publique, **Then** il reçoit une réponse 404 (indiscernable d'un
   slug inexistant — anti-énumération).
3. **Given** un conseiller au profil incomplet (champs obligatoires
   manquants), **When** un visiteur anonyme tente d'ouvrir sa page,
   **Then** la page renvoie 404 (le profil n'est pas encore publié
   même si le conseiller est vérifié).
4. **Given** un voyageur sur la page publique, **When** il clique sur le
   CTA principal, **Then** il arrive sur `/intake` avec un indicateur
   visuel « Ce conseiller sera pris en compte en priorité dans votre
   matching, mais le système peut suggérer un autre profil mieux aligné. »
   (formulation honnête du boost soft + plafond 3 — cf. FR-008a). Le
   serveur enregistre côté session anonyme le timestamp de consultation
   et l'identifiant `suggested`.
5. **Given** un voyageur, **When** il scrolle la page, **Then** il
   trouve une section pédagogique permanente expliquant pourquoi il
   n'y a pas de contact direct (renvoi à `/comment-ca-marche`).

---

### User Story 3 — Dashboard conseiller (Priority: P2)

Le conseiller authentifié atterrit sur son dashboard et voit en un coup
d'œil : statut de conformité (avec date d'expiration prochaine si
proche), nombre de leads en attente de réponse, mon profil (lien vers
US1), statut d'abonnement / facturation (placeholder tant que features
006-007 ne sont pas livrées). Les sections inactives affichent un état
explicite « bientôt disponible » plutôt qu'un lien mort.

**Why this priority** : améliore l'expérience d'usage pour le conseiller
mais n'est pas bloquant pour la valeur métier voyageur. Indépendamment
testable.

**Independent Test** : un conseiller authentifié ouvre `/conseiller` —
les widgets statut conformité + leads + profil + facturation s'affichent
avec des données correctes (ou placeholders).

**Acceptance Scenarios** :

1. **Given** un conseiller authentifié, **When** il ouvre `/conseiller`,
   **Then** il voit un widget « Conformité » indiquant son statut et la
   date d'expiration la plus proche s'il y en a une dans les 60 jours.
2. **Given** un conseiller sans certification valide, **When** il ouvre
   le dashboard, **Then** un avertissement persistant indique « Votre
   profil n'est pas visible publiquement » avec un lien vers la page de
   conformité (feature 001).
3. **Given** un conseiller `verified` mais profil `incomplet`, **When**
   il ouvre le dashboard, **Then** un avertissement persistant distinct
   liste les champs manquants et précise explicitement les deux
   conséquences « votre page publique n'est pas en ligne » et « vous
   n'apparaissez dans aucun matching » (cf. FR-012a).
4. **Given** un conseiller avec abonnement non encore implémenté
   (features 006/007 absentes), **When** il ouvre le dashboard, **Then**
   la section « Facturation » affiche « Bientôt disponible » sans
   placeholder cassé.

---

### User Story 4 — Aperçu public depuis le dashboard (Priority: P2)

Le conseiller peut prévisualiser sa propre page publique depuis le
dashboard pour valider ce que les voyageurs verront. Cette prévisualisation
fonctionne même si le profil n'est pas encore publié (statut conformité
ou champs incomplets), avec un bandeau explicite « Aperçu — non visible
publiquement ».

**Why this priority** : améliore la confiance du conseiller dans son
profil et réduit les surprises post-vérification. Pas bloquant mais
fort impact UX.

**Acceptance Scenarios** :

1. **Given** un conseiller au profil complet ET vérifié, **When** il
   clique « Aperçu public », **Then** il voit sa propre page publique
   sans bandeau (identique à ce que voit le voyageur).
2. **Given** un conseiller au profil incomplet OU non encore vérifié,
   **When** il clique « Aperçu public », **Then** il voit la page avec
   un bandeau jaune « Aperçu — non encore visible publiquement »
   listant les éléments manquants.

---

### User Story 5 — Effacement Loi 25 préserve l'invariant SEO (Priority: P3)

Lorsqu'un conseiller demande l'effacement Loi 25 (feature 023 Tier 4) ou
voit sa conformité révoquée, sa page publique disparaît immédiatement
(404) et son slug **n'est jamais réutilisé** pour un nouveau conseiller
— préservant la cohérence des liens externes existants et bloquant le
hijack SEO.

**Why this priority** : invariant de compliance qui devient critique au
moment de la livraison de la feature 023 (effacement Loi 25). Pour
MVP, il suffit que la disparition soit instantanée (caches invalidés)
et que le slug soit marqué « réservé » en BD.

**Acceptance Scenarios** :

1. **Given** un conseiller publié au slug `/conseiller/marie-dupont`,
   **When** son statut conformité passe à `expired` ou `revoked`,
   **Then** dans un délai ≤ 10 secondes (cf. FR-022 spec 001) la page
   publique renvoie 404.
2. **Given** un slug ayant appartenu à un conseiller effacé, **When**
   un nouveau conseiller s'inscrit avec un nom identique, **Then** le
   système lui attribue un slug différencié (suffixe numérique ou
   variation) sans réutiliser l'ancien.

---

### User Story 6 — Admin modère un profil non conforme (Priority: P2)

Un administrateur, depuis la console conformité étendue (feature 001 +
FR-023), retire la photo d'un conseiller jugée non conforme ou masque
temporairement le profil entier. Toute action de modération est
journalisée avec raison obligatoire, et le conseiller est notifié par
courriel (feature 003) de la mesure et de sa motivation.

**Why this priority** : verrou éditorial indispensable dès la première
publication publique pour gérer les écarts (photo, propos, ton) sans
attendre une feature dédiée. Indépendamment testable (un admin agit,
le profil disparaît, le conseiller est notifié).

**Independent Test** : seed un conseiller vérifié au profil `prêt` ;
un admin ouvre la console « Profils », clique « masquer profil » avec
raison « contenu inapproprié » ; la page publique du conseiller renvoie
404 en moins de 10 s, le journal d'audit contient l'événement, le
conseiller reçoit un courriel.

**Acceptance Scenarios** :

1. **Given** un conseiller publié avec profil `prêt`, **When** un admin
   clique « retirer photo » dans la console « Profils » et fournit une
   raison, **Then** la photo est supprimée de S3 (courante + historique
   FIFO), le profil bascule en `incomplet`, la page publique renvoie 404
   en moins de 10 s, le journal d'audit enregistre `admin_id`, `raison`,
   `timestamp`, et le conseiller reçoit un courriel.
2. **Given** un conseiller publié, **When** un admin clique « masquer
   profil temporairement » avec raison, **Then** le statut profil
   bascule à `masqué_admin` (cf. enum FR-003), la page publique renvoie
   404, le conseiller est exclu du matching, conserve l'accès au
   dashboard, et reçoit un courriel l'informant de la mesure et de la
   raison.
3. **Given** un profil au statut `masqué_admin`, **When** un admin
   clique « rétablir », **Then** le profil retrouve son statut antérieur
   (`prêt` si éligible), la page publique redevient accessible, et
   l'événement est journalisé.
4. **Given** un admin qui tente une action de modération sans renseigner
   la raison, **When** il valide, **Then** l'action est refusée avec un
   message « la raison est obligatoire ».

---

### Edge Cases

- **Conseiller passe `verified` → `expired` pendant qu'un voyageur a la
  page en cache navigateur** : le voyageur peut voir une version
  rafraîchie depuis le CDN (TTL ≤ 60s) ; à la prochaine action (CTA
  intake notamment) le serveur invalide le paramètre `suggested` (cf.
  FR-008a, validation à la soumission) et l'intake continue sans ce
  conseiller dans le pool éligible.
- **Conseiller modifie son titre ou bascule l'option `afficherNomComplet`** :
  seul le libellé visible change (titre dans l'UI, nom affiché entre
  `Marie D.` ↔ `Marie Dupont`). Le slug URL reste celui généré au
  premier passage `verified` (immutable, cf. Q1 + FR-006a) — pas de
  cascade de redirects 301 ni de slug volatil au premier MVP (scope 016).
- **Asymétrie slug ↔ nom affiché (compromis assumé)** : un conseiller
  qui a opté pour `afficherNomComplet=false` voit son libellé public
  réduit à `Marie D.`, **mais le slug URL reste `marie-dupont`** (basé
  sur le nom légal, immuable). C'est une fuite intentionnelle du nom
  de famille via l'URL, justifiée par : (1) le slug est SEO-critique
  et doit rester stable, (2) le nom complet est de toute façon
  référencé dans le module conformité (registre vérifié). Cette
  limite DOIT être communiquée au conseiller dans l'UI au moment du
  toggle (texte d'aide explicite). Le conseiller pour qui cette
  asymétrie est inacceptable doit utiliser le flux d'effacement Loi 25.
- **Conseiller renseigne une photo offensante ou non conforme** :
  modération via la console conformité étendue (feature 001 + FR-023
  de cette spec). Un admin peut retirer la photo (FIFO + S3) ou masquer
  le profil entier, avec raison obligatoire et notification courriel
  au conseiller (cf. US6).
- **Photo trop volumineuse / format invalide** : refus côté serveur
  avec message FR-CA expliquant la contrainte (≤ 5 Mo, JPEG/PNG/WebP).
- **Conseiller efface tout son profil** : si tous les champs deviennent
  vides, le profil bascule en `incomplet` et disparaît de la vue
  publique sans suppression DB (récupérable par le conseiller s'il
  remplit à nouveau). Les relances FR-021 ne sont **pas** redéclenchées
  par ce ré-effacement (déclencheur unique = première transition
  `pending → verified`).
- **Re-vérification après expiration** : si un conseiller passe
  `verified → expired → verified` alors que son profil était déjà
  `prêt`, sa page publique redevient accessible immédiatement (≤ 60 s
  cf. SC-001), aucune relance FR-021 n'est émise. Si le profil est
  redevenu `incomplet` entretemps, les relances ne sont **pas**
  réinitialisées non plus (pas de spam).
- **Concurrent edit** : si deux onglets sauvegardent simultanément, la
  dernière écriture gagne ; aucun verrou optimiste exposé à l'utilisateur
  pour MVP.

---

## Requirements *(mandatory)*

### Functional Requirements

**Édition du profil (US1)**

- **FR-001** : Le système DOIT permettre à un conseiller authentifié
  d'éditer les champs : titre (max 80 chars), biographie (100-2000
  chars), spécialités (multi-select, min 1, max 8), zones géographiques
  d'expertise (multi-select, min 1, max 12), langues parlées (multi-select,
  min 1, max 6), années d'expérience (entier 0-60), photo (image JPEG /
  PNG / WebP ≤ 5 Mo).
- **FR-002** : Le système DOIT valider toutes les entrées côté serveur
  (longueur, type, cardinalité) et refuser les sauvegardes invalides
  avec un message d'erreur explicite en FR-CA par champ concerné.
- **FR-003** : Le système DOIT calculer / persister un statut de profil
  parmi :
  - `incomplet` — au moins un champ obligatoire manquant (calculé) ;
  - `prêt` — tous les champs obligatoires remplis ET conseiller en
    statut conformité `verified` (calculé) ;
  - `masqué_admin` — masquage temporaire par décision admin (persisté,
    cf. FR-023). Override tout autre calcul ; le profil n'est ni
    public, ni éligible matching, mais le conseiller conserve l'accès
    dashboard.
  - `anonymisé` — effacement Loi 25 propagé (persisté, cf. FR-016).
    Override tout autre statut, irréversible.
  
  Ce statut DOIT être affiché au conseiller dans le dashboard avec la
  liste des éléments manquants si `incomplet`, la raison invoquée par
  l'admin si `masqué_admin`. Le port public d'éligibilité (FR-022) ne
  retourne `true` que si le statut effectif est exactement `prêt`.
- **FR-004** : Le système DOIT stocker l'historique des photos uploadées
  par le conseiller (au plus 5 versions, FIFO) pour permettre un retour
  arrière en cas de modification accidentelle.
- **FR-005** : Le système DOIT empêcher toute modification du profil
  d'un conseiller dont le statut conformité (spec 001) ou le statut
  profil (FR-003) est dans un état terminal d'effacement (`anonymized`
  côté conformité, `anonymisé` côté profil) — toute tentative renvoie
  une erreur explicite et journalise un événement d'audit. Le statut
  `masqué_admin` n'empêche **pas** l'édition (le conseiller peut
  corriger son profil ; seule la visibilité publique est suspendue).

**Vue publique (US2)**

- **FR-006** : Le système DOIT exposer une page publique non-authentifiée
  à l'URL `/conseiller/<slug>` qui rend tous les champs du profil + la
  liste des certifications visibles lues depuis le port public du module
  conformité.
- **FR-006a** : Le nom affiché publiquement DOIT être par défaut
  `Prénom + initiale-nom + "."` (ex. `Marie D.`) calculé à partir du
  nom légal vérifié (source : module conformité). Le conseiller PEUT
  opter (toggle dans l'édition du profil) pour afficher son nom légal
  complet (ex. `Marie Dupont`). Aucun pseudonyme libre n'est autorisé :
  les seules valeurs valides sont `prenom + initiale-nom + "."` ou
  `prenom + nom-complet`. La balise Schema.org `Person.name` et le
  `<title>` de la page utilisent la même valeur que l'affichage UI.
  Le slug URL (`/conseiller/prenom-nom`) reste basé sur le nom légal
  complet, indépendamment du nom affiché.
- **FR-006b** : Le toggle `afficherNomComplet` DOIT afficher à proximité
  un **avertissement explicite** au moment de l'activation (passage
  `false → true`), formulé en FR-CA :
  > « En affichant votre nom complet, vous acceptez son indexation par
  > les moteurs de recherche (Google, Bing). Cette indexation persiste
  > même après une éventuelle demande d'effacement Loi 25 — les moteurs
  > de recherche conservent leur cache plusieurs semaines. »
  
  Cet avertissement DOIT être documenté dans la politique Loi 25 (page
  publique `/politique-loi25` livrée par feature 004 — coordination
  rédactionnelle à confirmer).
- **FR-007** : Le système DOIT renvoyer une réponse `404 Not Found` (et
  rien d'autre — pas de 401, 403, ou 410) pour toute combinaison qui
  ne devrait pas être exposée publiquement, à savoir :
  - slug inexistant ;
  - slug réservé (cf. FR-015) sans profil actif ;
  - conseiller en statut conformité `pending`, `expired`, `revoked`,
    ou `anonymized` ;
  - profil en statut `incomplet`, `masqué_admin`, ou `anonymisé`
    (cf. FR-003).
  
  L'objectif est l'anti-énumération : la signature HTTP (status code +
  content-type + taille approximative du corps) DOIT être identique
  pour tous ces cas, indiscernable d'un slug strictement inexistant
  (cf. SC-003).
- **FR-008** : La page publique DOIT inclure un et un seul CTA principal
  menant à `/intake?suggested=<conseiller-id>`. Aucun email, téléphone,
  formulaire de contact, ou lien direct vers une boîte de messagerie
  ne DOIT figurer sur la page (Principe I + ADR-0002).
- **FR-008a** : Le paramètre `suggested=<id>` DOIT être traité comme
  un **boost soft de scoring ≤ +10 %** (cumulé au scoring normal du
  module matching, feature 011), avec une **fenêtre de validité de 24 h**.
  Aucun override du plafond Principe III : le conseiller suggéré PEUT
  être écarté du top 3 si fortement non aligné.
  
  **Mécanique technique compatible SSR/SSG cacheable** :
  1. La page publique du conseiller reste statique au CDN (FR-010).
     Le CTA est un lien `<a href="/intake?suggested=<conseiller-id>">`,
     aucune mutation serveur n'est faite au chargement de la page
     publique.
  2. La route `/intake` est protégée par un **middleware Next.js** qui,
     à la première requête contenant `?suggested=<id>` : (a) ajoute /
     met à jour dans la session anonyme du voyageur (cookie HttpOnly +
     SameSite=Lax + Secure) une entrée `{conseillerId, timestamp}`,
     (b) redirige 302 vers `/intake` sans le paramètre (URL propre pour
     SEO). La page `/intake` est rendue ensuite normalement.
  3. À la soumission de l'intake (server action), le serveur DOIT
     valider, pour chaque entrée de la liste : l'identifiant existe,
     le port `profil.estPublic` (FR-022) retourne `true`, et le
     timestamp est dans la fenêtre 24 h. Une entrée invalide est
     ignorée silencieusement (aucun message d'erreur au voyageur).
  4. La liste persistée dans le cookie DOIT être plafonnée à ≤ 10
     entrées pour éviter l'inflation ; au-delà, FIFO sur la date
     d'insertion.
- **FR-009** : La page publique DOIT contenir une section pédagogique
  permanente « Pourquoi je ne peux pas contacter ce conseiller
  directement ? » qui renvoie vers `/comment-ca-marche` (feature 004).
- **FR-010** : La page publique DOIT être rendue en SSR/SSG pour
  garantir l'indexation moteurs et le rendu sans JavaScript activé.

**Dashboard (US3)**

- **FR-011** : Le système DOIT exposer une route authentifiée
  `/conseiller` qui rend en un seul écran : widget conformité (statut +
  date d'expiration la plus proche dans 60 jours s'il y en a), widget
  profil (statut + accès à l'édition US1), widget leads (placeholder ou
  données réelles selon avancement de la feature 012), widget facturation
  (placeholder tant que 006/007 ne sont pas livrées).
- **FR-012** : Le dashboard DOIT afficher un avertissement persistant
  bien visible si le conseiller n'est pas en statut `verified`, avec
  pointeur vers la page conformité.
- **FR-012a** : Le dashboard DOIT afficher un avertissement persistant
  distinct si le conseiller est en statut `verified` mais profil
  `incomplet`, avec liste des champs manquants et CTA vers la page
  d'édition. Cet avertissement DOIT préciser explicitement les deux
  conséquences : « votre page publique n'est pas en ligne » et « vous
  n'apparaissez dans aucun matching ».

**Onboarding du profil (transverse)**

- **FR-021** : Le système DOIT planifier des relances email à J+3, J+7
  et J+14 (calculés depuis la première transition `pending → verified`)
  pour tout conseiller dont le profil reste au statut `incomplet`. Les
  relances sont émises via le module notifications (feature 003) ; un
  job BullMQ par conseiller, idempotent (l'arrivée au statut `prêt`
  annule les relances restantes).
- **FR-022** : Le système DOIT exposer (via un port de lecture publique
  du module identité, à consommer par le module matching) un signal
  binaire `profil.estPublic(conseillerId) → bool` qui retourne `true`
  si et seulement si le conseiller est `verified` ET son profil est en
  statut `prêt`. Ce port est la source de vérité pour l'éligibilité au
  matching (Principe III) et au rendu de la page publique.

**Aperçu public (US4)**

- **FR-013** : Le système DOIT exposer une route authentifiée
  `/conseiller/profil/apercu` qui rend la page publique exactement
  comme le voyageur la verrait (mêmes données, même mise en page), avec
  un bandeau jaune si le profil n'est pas en état d'être publié.

**Effacement & invariants Loi 25 (US5)**

- **FR-014** : Le système DOIT retirer la page publique d'un conseiller
  dans un délai ≤ 10 secondes après transition de statut conformité de
  `verified` vers `expired`, `revoked`, ou `anonymized`. Le mécanisme
  réutilise les invariants du port conformité (cf. FR-022 spec 001).
- **FR-015** : Le système DOIT marquer comme « réservé » tout slug ayant
  appartenu à un conseiller effacé Loi 25 ou révoqué de façon permanente.
  Aucun nouveau conseiller ne DOIT pouvoir réutiliser ce slug.
- **FR-016** : Le système DOIT, lors de l'effacement Loi 25 d'un
  conseiller (cas orchestré par feature 023 à venir), supprimer
  irréversiblement les champs PII du profil :
  - **biographie** (texte libre potentiellement identifiant) → effacée ;
  - **titre / accroche** (texte libre) → effacé ;
  - **photo courante + historique FIFO** → supprimées de S3
    (`DELETE` objet, pas tombstone) ;
  - **années d'expérience** → mises à `NULL` (potentiellement
    réidentifiant croisé avec d'autres signaux) ;
  - **toggle `afficherNomComplet`** → réinitialisé à `false`.
  
  Les champs non-PII en tant que tels (références à des énumérations
  fermées : `spécialités`, `langues`, `zones géographiques`) DOIVENT
  également être vidés par défaut pour éviter toute possibilité de
  ré-identification croisée, mais l'opération est une mise à `[]`
  (set vide), pas une suppression d'enregistrement énumération.
  
  Le statut profil bascule à `anonymisé` (irréversible, cf. FR-003).
  Le slug est reversé au registre `SlugReservation` (cf. FR-015), et
  l'enregistrement `ConseillerProfile` conserve uniquement : `slug`,
  `publishedAt`, `anonymizedAt`, et la référence `AuthUser` (que le
  module identité anonymise selon sa propre logique, hors scope ici).
  
  Cette opération DOIT être journalisée dans le journal d'audit
  immutable (rétention 7 ans — l'obligation comptable supplante le
  droit à l'effacement pour le journal lui-même, cf. spec 001).

**Modération éditoriale (admin)**

- **FR-023** : La console admin du module conformité (feature 001) DOIT
  être étendue d'un onglet « Profils » listant les conseillers vérifiés
  avec deux actions admin : (a) « retirer photo » qui efface la photo
  courante (et l'historique des photos précédentes) en S3 et bascule le
  profil en `incomplet` jusqu'à ré-upload ; (b) « masquer profil
  temporairement » qui retire le profil de la vue publique et du
  matching sans toucher au statut de conformité (statut profil
  `masqué_admin`, cf. enum FR-003, réversible). Chaque action DOIT être
  journalisée dans le journal d'audit immutable avec admin, raison
  (champ texte libre obligatoire), timestamp.
- **FR-024** : Le conseiller dont le profil a été masqué administrativement
  DOIT recevoir un courriel transactionnel (via feature 003) l'informant
  de la mesure et de la raison invoquée. Il conserve l'accès à son
  dashboard et peut corriger son profil ; un admin doit re-confirmer
  pour rétablir la visibilité publique.

**Sécurité et conformité (transverse)**

- **FR-017** : Toutes les actions d'édition du profil DOIVENT être
  protégées par AuthGuard (session valide Auth.js v5) + RBAC
  (`role === 'conseiller'`). Les administrateurs n'accèdent pas au
  dashboard conseiller mais peuvent consulter les profils via une
  console séparée (scope hors MVP).
- **FR-018** : Toutes les requêtes d'écriture (modification profil,
  upload photo) DOIVENT être journalisées dans le journal d'audit
  immutable du module identité (rétention 7 ans, cf. spec 002).
- **FR-019** : Le système DOIT enregistrer la version courante des CGU
  acceptée par le conseiller au moment de la sauvegarde du profil
  (consomme `LegalAcceptanceFacade` ou le port `CheckCguUpToDate`
  livrés par feature 004). Si la version est obsolète, le middleware
  redirige vers la re-acceptation avant la sauvegarde.

**SEO minimal (transverse — préfigure feature 016)**

- **FR-020** : La page publique DOIT être servie avec les balises
  meta essentielles : `<title>` (nom + spécialité principale), meta
  description (extrait de la biographie ≤ 160 chars), `<link rel="canonical">`.
  Les schemas JSON-LD avancés (Person, ProfessionalService) sont scope
  de feature 016 ; pour le MVP, un schema `Person` minimal suffit.

### Key Entities *(include if feature involves data)*

- **ConseillerProfile** : entité possédée par le module identité,
  rattachée à un `AuthUser` (1-1). Champs :
  - `titre` (string, max 80, texte libre) ;
  - `biographie` (string, 100-2000) ;
  - `spécialités` (set de `ProfileSpeciality`, 1-8) ;
  - `zonesGéographiques` (set de `ProfileGeoZone`, 1-12) ;
  - `langues` (set de `ProfileLanguage`, 1-6) ;
  - `annéesExpérience` (entier 0-60) ;
  - `photoUrl` (clé S3 ca-central-1) ;
  - `slug` (string unique, immutable post-publication, format
    `prenom-nom[-suffixe]`) ;
  - `afficherNomComplet` (booléen, défaut `false` — cf. FR-006a) ;
  - `statut` (`incomplet` | `prêt` | `masqué_admin` | `anonymisé` —
    cf. FR-003 ; `incomplet` / `prêt` sont calculés à la lecture,
    `masqué_admin` / `anonymisé` sont persistés et override le calcul) ;
  - `raisonMasquageAdmin` (string, NULL sauf si `statut = masqué_admin`) ;
  - `publishedAt`, `updatedAt`, `anonymizedAt` (timestamps).
  
  La photo elle-même vit dans S3 ca-central-1 (réutilise l'infra
  documents de feature 001). Le nom légal (prénom + nom) n'est PAS
  dupliqué ici : il est lu via le port public du module conformité.
- **ProfileSpeciality, ProfileLanguage, ProfileGeoZone** : énumérations
  fermées versionnées. Évolution gérée par migration éditoriale (pas
  par les conseillers eux-mêmes).
- **ProfilePhotoHistory** : table append-only des 5 dernières photos
  uploadées par profil. Les versions évincées sont supprimées de S3 au
  même cycle FIFO.
- **SlugReservation** : registre des slugs réservés / brûlés par
  effacement Loi 25. Index unique sur le slug.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** — *Visibilité publique fonctionnelle* : 95 % des conseillers
  vérifiés ayant complété leur profil sont accessibles sur leur page
  publique dans les 60 secondes suivant la dernière sauvegarde
  (validation par script de scan).
- **SC-002** — *Anti-marketplace strict* : revue manuelle de 100 % des
  pages publiques en pré-production confirme l'absence totale de canal
  de contact direct (email, téléphone, formulaire, lien chat externe).
  Aucun écart toléré.
- **SC-003** — *Anti-énumération* : une analyse de logs sur 7 jours en
  staging montre que toute requête à un slug inexistant ou non-publié
  renvoie la même signature HTTP (status code + content-type + taille
  approximative) — aucun signal différenciant entre slug inexistant et
  slug masqué.
- **SC-004** — *Performance & accessibilité* : sur la page publique du
  conseiller, LCP < 2,5 s, INP < 200 ms, CLS < 0,1 (mesure CrUX 75th
  percentile en staging) ; score Lighthouse Accessibilité ≥ 95 ; aucune
  violation `axe-core` de sévérité serious ou critical.
- **SC-005** — *Adoption conseiller* : 80 % des conseillers vérifiés
  ont un profil au statut `prêt` dans les 30 jours suivant leur
  vérification (mesure post-déploiement, signal d'efficacité du
  dashboard et des relances).
- **SC-006** — *Latence de retrait* : 99 % des transitions
  `verified → expired/revoked` entraînent une réponse 404 sur la page
  publique en moins de 10 secondes (cf. FR-014 + FR-022 de la spec
  001).
- **SC-007** — *Préservation de la traçabilité Loi 25* : 100 % des
  effacements Loi 25 conservent une trace dans le registre de slugs
  réservés ; aucun slug effacé n'est jamais réattribué (test
  d'invariant en CI).

---

## Assumptions

- **Slug du conseiller** : stratégie fixée — `prenom-nom` slugifié
  FR-CA (ASCII fold pour les accents, lowercase, espaces et caractères
  spéciaux remplacés par des tirets), avec désambiguïsation par suffixe
  numérique incrémenté en cas de collision (`marie-dupont`,
  `marie-dupont-2`, `marie-dupont-3`, …). Lecture immuable post-publication.
  La génération initiale se fait au premier passage en statut `verified` ;
  le conseiller ne choisit pas son slug. Slugs réservés à vie après
  effacement Loi 25 ou révocation permanente (FR-015).
- **Photo profile** : stockage S3 ca-central-1 (réutilise l'infra
  conformité). Aucune transformation côté serveur au MVP (pas de
  resize/crop automatique) — le conseiller est responsable du format.
  Une amélioration ultérieure (resize/optimisation WebP, multi-CDN)
  relèvera de feature 016 ou 025 (design system).
- **Énumérations métier** (spécialités, zones, langues) : seedées dans
  une migration initiale avec des valeurs FR-CA pertinentes (« Croisière »,
  « Famille », « Aventure », « Asie du Sud-Est », « Caraïbes »,
  « anglais », « espagnol », etc.). L'évolution se fait par PR
  éditoriale.
- **Internationalisation** : MVP en FR-CA strict. L'anglais arrive avec
  feature 024 (i18n) ; les profils n'ont pas de version EN explicite
  pour le MVP — la biographie est dans une seule langue.
- **CGU acceptance gate** : le middleware de la feature 004 protège déjà
  les routes `/(conseiller)/**`. Cette feature ne réécrit pas cette
  logique, elle s'y branche.
- **Modération éditoriale** : extension de la console conformité
  existante (feature 001) — nouvel onglet « Profils » avec actions
  « retirer photo » et « masquer profil temporairement » (cf. FR-023 +
  FR-024). Pas d'ADR séparé : extension naturelle de 001 sans nouveau
  module. Workflow de modération en équipe et outil dédié = scope d'une
  feature ultérieure (Tier 4/5) quand le volume le justifiera.
- **Champs « certifications visibles »** : lus en lecture seule depuis
  le port public du module conformité (`ConformiteQueryPort.certifications`).
  Le conseiller ne saisit pas ces données — elles sont déduites de son
  dossier de conformité approuvé.
- **Pagination et listing public** : aucune page de listing public
  `/conseillers` dans cette feature (relève de 018 — pages thématiques).
  L'arrivée sur une page conseiller se fait depuis un lien externe, un
  partage, ou plus tard depuis les pages thématiques SEO.
- **Optimisations SEO avancées** : Schema.org étendus, hreflang,
  sitemaps multi-locale, prerendering ciblé sont scope de la feature
  016. Cette feature livre le minimum suffisant pour l'indexation
  initiale.
