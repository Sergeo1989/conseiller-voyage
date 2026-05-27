# Spécification fonctionnelle : Mentions légales, CGU, politique de confidentialité et page « Comment ça marche »

**Branche feature** : `004-mentions-legales`

**Créé le** : 2026-05-25

**Statut** : Draft

**Input** : Description utilisateur : « Mentions légales, CGU et politique de
confidentialité de la plateforme Conseiller Voyage, plus la page Comment ça
marche (pas un agent de voyages). Quatre pages statiques Next.js sous
/[locale]/. Footer permanent. Acceptation CGU bloquante au signup conseiller.
Acceptation politique au moment de soumettre un brief intake (consentement
Loi 25 horodaté). FR-CA primary, EN différé. Aucune logique métier ni module
backend nouveau. »

---

## Contexte

Cette feature ferme le Tier 0 du `docs/roadmap.md` après le merge de 001
(conformité). Elle couvre les obligations légales d'opération d'une plateforme
de mise en relation au Québec et au Canada : Loi 25 (Loi sur la protection des
renseignements personnels dans le secteur privé du Québec, en vigueur depuis
2022), Loi sur la protection du consommateur (Québec), et les attentes des
autorités OPC (Québec) et TICO (Ontario) qui régulent les agences de voyages
— même si la plateforme **n'est pas** une agence (cf. ADR-0002).

Cinq pages statiques (mentions, CGU voyageur, CGU conseiller, politique de
confidentialité, comment ça marche) + un footer permanent + deux points de
collecte de consentement explicites suffisent à couvrir le scope. Aucun
nouveau module backend ; on étend le module `identité` existant avec une
petite entité de traçage d'acceptations légales.

---

## Scénarios utilisateurs et tests *(obligatoire)*

### User Story 1 — Voyageur comprend le modèle avant de soumettre un brief (Priorité : P1) 🎯 MVP

Avant qu'un voyageur ne soumette son brief intake (feature 002), il se pose la
question légitime « pourquoi je ne peux pas juste contacter directement un
conseiller que j'ai trouvé sympa ? ». Sans réponse claire et accessible, deux
risques : (a) il abandonne en pensant que la plateforme est étrange ;
(b) il continue mais sans comprendre que le matching est encadré
réglementairement, donc il n'est pas réceptif au plafond de 3 conseillers
maximum (Principe III).

La page `/[locale]/comment-ca-marche` explique en langage simple : la
plateforme n'est PAS une agence de voyages, elle ne touche pas à la
transaction, elle met en relation des conseillers vérifiés CCV/TICO avec des
voyageurs via un intake structuré. Le modèle est ancré dans l'ADR-0002 et
référencé depuis chaque page publique de conseiller (Tier 3) et depuis le
footer.

**Pourquoi cette priorité** : c'est l'**énoncé public du Principe I** de la
constitution. Sans cette page, n'importe quel litige ou inspection OPC peut
remettre en cause le positionnement de la plateforme. C'est aussi le pivot
narratif qui rend le reste du produit cohérent pour le voyageur (pourquoi
pas de bouton contacter, pourquoi un intake, pourquoi maximum 3 conseillers).

**Test indépendant** : on peut publier la page seule, sans flux intake ni
matching, et un voyageur de test peut la lire et résumer correctement le
modèle. Un inspecteur OPC peut la consulter pour confirmer que la plateforme
ne se présente pas comme agence.

**Scénarios d'acceptation** :

1. **Étant donné** un voyageur qui arrive sur la page d'accueil de la
   plateforme, **quand** il clique sur « Comment ça marche » dans le menu
   ou le footer, **alors** la page `/[locale]/comment-ca-marche` se charge
   en moins de 1 s et affiche : ce qu'est la plateforme, ce qu'elle n'est
   pas (énoncé explicite « ce n'est pas une agence de voyages »), le rôle
   du conseiller vérifié, le plafond de 3 conseillers par demande, l'absence
   de transaction sur la plateforme.
2. **Étant donné** un voyageur sur la page d'un conseiller (feature 016
   Tier 3), **quand** il cherche un bouton « contacter », **alors** il voit
   à la place un lien « Pourquoi je ne peux pas contacter directement ce
   conseiller ? » qui renvoie vers `/[locale]/comment-ca-marche`.
3. **Étant donné** un robot d'indexation Google, **quand** il crawle
   `/comment-ca-marche`, **alors** la page est indexable, contient le titre
   `<h1>` adéquat, des métadonnées OpenGraph en FR-CA, et un schéma JSON-LD
   `WebPage` cohérent.

---

### User Story 2 — Tout utilisateur accède aux 4 pages légales depuis n'importe où (Priorité : P1) 🎯 MVP

Les obligations légales québécoises et canadiennes exigent que les mentions
légales, les CGU et la politique de confidentialité soient accessibles
**en permanence** depuis toutes les pages publiques. Un footer permanent
avec quatre liens identifiés clairement remplit cette exigence et constitue
la défense de la plateforme en cas d'inspection.

**Pourquoi cette priorité** : sans cet accès permanent, la plateforme est en
infraction dès la mise en ligne publique. Aucun déploiement public n'est
possible avant que cette US soit livrée.

**Test indépendant** : un crawler automatisé visite 10 pages publiques au
hasard et vérifie que chacune contient les 4 liens vers les pages légales
dans le footer, et que chaque lien retourne 200 OK.

**Scénarios d'acceptation** :

1. **Étant donné** n'importe quelle page publique de la plateforme
   (accueil, page conseiller, page thématique, page d'erreur 404),
   **quand** un utilisateur la consulte, **alors** le footer contient
   visiblement et de manière accessible (lecteur d'écran) les liens vers
   `/mentions-legales`, `/cgu`, `/confidentialite`, `/comment-ca-marche`.
2. **Étant donné** un utilisateur sur un appareil mobile (≤ 375 px),
   **quand** il défile jusqu'au bas de page, **alors** les 4 liens
   restent lisibles et cliquables (touch target ≥ 44 px conformément à
   WCAG 2.1 AA).
3. **Étant donné** un utilisateur en navigation clavier,
   **quand** il tabule à travers le footer, **alors** chaque lien reçoit
   un focus visible (contraste ≥ 4.5:1).

---

### User Story 3 — Conseiller accepte les CGU conseiller (B2B) explicitement au signup (Priorité : P2)

Au moment où un conseiller crée son compte (signup module identité), il
doit accepter explicitement les CGU conseiller (`/cgu-conseiller`, B2B)
avant que le compte ne soit créé. L'acceptation est horodatée, versionnée,
et stockée en audit (obligation Loi 25 + protection contractuelle en cas
de litige). Si les CGU conseiller sont modifiées ultérieurement (nouvelle
version), le conseiller doit ré-accepter à sa prochaine connexion avant
de pouvoir continuer.

**Pourquoi cette priorité** : indispensable mais ne bloque pas la mise en
ligne publique en soi — la mise en ligne sans signup conseiller actif
(phase pré-recrutement) est possible. Devient bloquant dès que le premier
conseiller s'inscrit.

**Test indépendant** : on simule un signup conseiller, on vérifie que le
checkbox CGU est obligatoire (formulaire bloqué sans coche), que
l'acceptation est tracée avec la version exacte des CGU, et qu'une mise à
jour de version déclenche une demande de ré-acceptation à la connexion
suivante.

**Scénarios d'acceptation** :

1. **Étant donné** un conseiller au signup, **quand** il tente de soumettre
   le formulaire sans cocher la case d'acceptation des CGU, **alors** le
   formulaire est rejeté côté client ET côté serveur avec un message FR-CA
   clair indiquant que l'acceptation est obligatoire.
2. **Étant donné** un conseiller au signup, **quand** il coche la case et
   soumet, **alors** une entrée `LegalAcceptance` est créée en BD avec
   `userId`, `documentType: 'cgu_b2b'`, `documentVersion`, `acceptedAt`,
   et `ipAddress` (Loi 25 traçabilité technique).
3. **Étant donné** un conseiller déjà inscrit dont la version des CGU
   acceptée est obsolète, **quand** il se connecte, **alors** il est
   redirigé vers une page de ré-acceptation avant de pouvoir accéder à
   son tableau de bord.

---

### User Story 4 — Voyageur consent à la politique de confidentialité et aux CGU voyageur au moment du brief intake (Priorité : P2)

Au moment de soumettre son brief intake (feature 002), le voyageur doit
explicitement consentir à **deux** documents distincts : (a) la politique
de confidentialité avec finalité clairement énoncée (« nous transmettrons
vos coordonnées à jusqu'à 3 conseillers vérifiés pour qu'ils vous
répondent »), et (b) les CGU voyageur (`/cgu-voyageur`) qui posent les
règles d'utilisation côté B2C. La Loi 25 (article 8) exige un
consentement granulaire : deux cases à cocher distinctes plutôt qu'une
case unique groupée. Les deux consentements sont horodatés et stockés
en audit.

**Pourquoi cette priorité** : indispensable mais dépend de la livraison de
la feature 002-voyageur-intake. La présente spec définit le contrat
(l'entité `LegalAcceptance` et l'API), 002 livre l'intégration dans le
formulaire intake.

**Test indépendant** : on simule un POST sur l'endpoint intake sans l'un
ou l'autre des consentements → rejet 400. On simule avec les deux
consentements → deux entrées `LegalAcceptance` créées
(`documentType: 'confidentialite'` et `documentType: 'cgu_b2c'`) avec
le même `briefId`.

**Scénarios d'acceptation** :

1. **Étant donné** un voyageur au dernier écran du formulaire intake,
   **quand** il tente de soumettre sans cocher l'une des deux cases
   (politique de confidentialité OU CGU voyageur), **alors** la
   soumission est rejetée avec un message FR-CA clair indiquant
   laquelle des deux acceptations manque.
2. **Étant donné** un voyageur qui coche les deux cases et soumet,
   **alors** **deux** `LegalAcceptance` sont créées avec le même
   `briefId` (une pour `confidentialite`, une pour `cgu_b2c`),
   permettant la traçabilité en cas de demande d'effacement Loi 25.

---

### User Story 5 — Inspecteur OPC consulte mentions légales pour vérifier identité de l'éditeur (Priorité : P3)

Un inspecteur de l'Office de la protection du consommateur du Québec ou son
équivalent TICO ontarien peut, à tout moment, consulter publiquement
`/mentions-legales` pour vérifier l'identité de l'éditeur, son adresse, son
numéro d'entreprise (NEQ ou équivalent fédéral) et la juridiction
applicable. Cette page est sa première porte d'entrée pour identifier
l'opérateur de la plateforme.

**Pourquoi cette priorité** : moins fréquent mais important pour la défense
réglementaire. Une page mentions légales lacunaire est un mauvais signal.

**Test indépendant** : un auditeur tiers consulte la page et confirme par
écrit que les 4 informations requises (raison sociale, adresse, NEQ,
juridiction) sont présentes, exactes, et à jour.

**Scénarios d'acceptation** :

1. **Étant donné** un inspecteur qui consulte `/mentions-legales`,
   **quand** la page se charge, **alors** elle affiche : raison sociale
   complète, adresse postale au Canada, NEQ (ou équivalent), juridiction
   de litige, contact courriel responsable, date de dernière mise à jour.

---

### Cas limites

- **Changement de version d'un document légal après publication** : le
  système doit tracer la version pour chaque acceptation passée ; les
  utilisateurs actifs sont invités à ré-accepter la nouvelle version à
  leur prochaine connexion (US3). Les acceptations passées restent valides
  comme preuve historique de l'engagement de l'utilisateur sur la version
  qu'il a vue.
- **Conseiller refuse les CGU au signup** : compte non créé, message FR-CA
  invitant à contacter le support s'il a des questions sur les conditions.
- **Voyageur refuse la politique au moment du brief** : brief non créé,
  message FR-CA expliquant pourquoi le consentement est nécessaire ; pas
  de données personnelles persistées (Principe II minimisation).
- **Utilisateur change de locale en cours de session** : les versions
  FR-CA et EN d'un document doivent être considérées équivalentes au sens
  légal — l'acceptation d'une version vaut pour les deux (au lancement,
  seul FR-CA existe ; EN sera ajouté plus tard).
- **JS désactivé** : les 4 pages restent intégralement consultables (pages
  SSG pures, pas de dépendance JS pour le contenu). Le footer reste
  fonctionnel (HTML + CSS uniquement).
- **Robot d'indexation** : les 4 pages doivent être crawlables, indexables,
  référencées dans `sitemap.xml`, et marquées `Last-Modified` cohérent.
- **Page mise à jour entre deux acceptations** : l'utilisateur qui a
  accepté la version N voit la version N+1 à sa prochaine visite ; il est
  prompté à ré-accepter avant d'accéder aux actions sensibles.
- **Demande d'effacement Loi 25** (FR-017 de 001) : les `LegalAcceptance`
  d'un utilisateur supprimé sont anonymisées (`userId` haché) mais
  conservées comme preuve d'engagement contractuel, conformément à
  l'arbitrage déjà fait pour le journal d'audit conformité.

---

## Exigences *(obligatoire)*

### Exigences fonctionnelles

- **FR-001** : Le système **DOIT** publier une page publique
  `/[locale]/mentions-legales` accessible sans authentification, contenant
  au minimum : raison sociale de l'éditeur, adresse postale, NEQ ou
  équivalent, juridiction applicable, courriel de contact, date de
  dernière mise à jour.
- **FR-002** : Le système **DOIT** publier **deux** pages CGU publiques
  séparées, accessibles sans authentification :
  `/[locale]/cgu-voyageur` (B2C, conditions d'utilisation pour les
  voyageurs soumettant un brief intake) et `/[locale]/cgu-conseiller`
  (B2B, conditions d'utilisation pour les conseillers s'abonnant à la
  plateforme). Chaque document est versionné indépendamment et chaque
  acceptation est tracée distinctement (`cgu_b2c` côté voyageur,
  `cgu_b2b` côté conseiller).
- **FR-003** : Le système **DOIT** publier une page publique
  `/[locale]/confidentialite` accessible sans authentification, contenant
  la politique de confidentialité Loi 25 incluant : finalités de
  collecte, catégories de données collectées, durées de conservation
  reflétant le tableau de rétention de la constitution (audit 7 ans,
  briefs 24 mois, profils désactivés 6 mois après désactivation), droits
  de la personne concernée (accès, rectification, effacement, plainte à
  la Commission d'accès à l'information du Québec), coordonnées du
  responsable de la protection des renseignements personnels.
- **FR-004** : Le système **DOIT** publier une page publique
  `/[locale]/comment-ca-marche` accessible sans authentification,
  contenant un énoncé explicite que la plateforme n'est PAS une agence
  de voyages, le rôle du conseiller vérifié, le plafond de 3 conseillers
  par demande, l'absence de transaction sur la plateforme.
- **FR-005** : Le système **DOIT** afficher dans le pied de page de
  toute page publique des liens vers les **5** pages légales
  (`/mentions-legales`, `/cgu-voyageur`, `/cgu-conseiller`,
  `/confidentialite`, `/comment-ca-marche`), visibles, accessibles au
  clavier, touch target ≥ 44 px sur mobile.
- **FR-006** : La page `/mentions-legales` **DOIT** afficher l'identité
  légale précise de l'éditeur, constitué en **personne morale enregistrée
  au Registraire des entreprises du Québec** : raison sociale officielle,
  **NEQ à 10 chiffres**, adresse du siège social au Québec, courriel de
  contact, date de dernière mise à jour. Les valeurs exactes (raison
  sociale, NEQ, adresse postale) sont fournies par le porteur du projet
  au moment du `/speckit.tasks`, avant tout déploiement public.
- **FR-007** : La page `/mentions-legales` **DOIT** spécifier comme
  juridiction applicable les **tribunaux compétents du district
  judiciaire de Montréal, province de Québec**. Le droit applicable
  est le droit québécois (Code civil du Québec, Loi 25, Loi sur la
  protection du consommateur du Québec). Cette clause est répliquée
  dans les CGU voyageur et CGU conseiller pour cohérence
  contractuelle.
- **FR-008** : La page `/comment-ca-marche` **DOIT** comporter une
  affirmation explicite et visible que la plateforme n'est pas une
  agence de voyages au sens de la Loi sur les agents de voyages du
  Québec ni de la *Travel Industry Act* de l'Ontario, et qu'elle ne
  participe à aucune transaction de voyage.
- **FR-009** : Le système **DOIT** collecter une acceptation explicite
  des **CGU conseiller (B2B)** lors de la création de compte conseiller
  (case à cocher bloquant la soumission du formulaire si non cochée).
  Une `LegalAcceptance` de type `cgu_b2b` est créée.
- **FR-010** : Le système **DOIT** collecter, au moment de la
  soumission d'un brief intake voyageur (intégration livrée par module
  002), **deux** acceptations explicites : (a) la politique de
  confidentialité Loi 25 et (b) les CGU voyageur (B2C). Deux entrées
  `LegalAcceptance` distinctes sont créées (`confidentialite` et
  `cgu_b2c`), idéalement via deux cases à cocher séparées pour respecter
  la granularité du consentement (Loi 25 art. 8).
- **FR-011** : Le système **DOIT** persister chaque acceptation comme
  une entité `LegalAcceptance` incluant : identifiant utilisateur
  (pour conseiller/admin) ou identifiant brief (pour voyageur anonyme),
  type de document (`mentions_legales`, `cgu_b2c`, `cgu_b2b`,
  `confidentialite`, `comment_ca_marche` — seuls les types collectant
  un consentement sont matérialisés en `LegalAcceptance`, donc en
  pratique `cgu_b2c`, `cgu_b2b`, `confidentialite`), version du
  document acceptée, horodatage UTC, adresse IP (Loi 25 traçabilité
  technique), user-agent.
- **FR-012** : Le système **DOIT** maintenir un identifiant de version
  pour chaque document légal. Tout changement de fond entraîne une
  nouvelle version.
- **FR-013** : Lorsqu'un conseiller authentifié dont la version CGU
  conseiller (`cgu_b2b`) acceptée est obsolète tente d'accéder à son
  tableau de bord, le système **DOIT** le rediriger vers une page de
  ré-acceptation. L'accès aux actions métier reste bloqué tant que la
  nouvelle version n'est pas acceptée. Pour le voyageur, l'acceptation
  se fait à chaque brief intake — pas de ré-acceptation rétroactive
  nécessaire entre deux briefs, mais la version acceptée est toujours
  tracée par `briefId`.
- **FR-014** : Toutes les pages **DOIVENT** être livrées en FR-CA au
  lancement, avec la structure i18n prête à accueillir EN (clés
  next-intl déjà en place dans `packages/shared`, catalogues EN
  placeholder créés vides).
- **FR-015** : Toutes les pages **DOIVENT** passer un audit axe-core
  WCAG 2.1 AA sans violation en CI (bloquant).
- **FR-016** : Toutes les pages **DOIVENT** respecter les budgets Core
  Web Vitals de la constitution : LCP < 2,5 s, INP < 200 ms, CLS < 0,1.
  Lighthouse CI bloquant en pipeline.
- **FR-017** : Toutes les pages **DOIVENT** être rendues statiquement
  (SSG) pour la performance et l'indexabilité ; elles **DOIVENT** être
  référencées dans `sitemap.xml` et marquées `Last-Modified` cohérent
  avec la version publiée.
- **FR-018** : Les 4 pages **DOIVENT** être indexables par les moteurs
  de recherche (aucun `noindex`, présence dans `sitemap.xml`,
  métadonnées OpenGraph + JSON-LD `WebPage` complètes).
- **FR-019** : Une demande d'effacement Loi 25 (FR-017 de 001) sur un
  utilisateur **DOIT** anonymiser ses `LegalAcceptance` (hash du
  `userId`) tout en les conservant comme preuve historique
  d'engagement, cohérent avec l'arbitrage du journal d'audit
  conformité (l'obligation de preuve supplante le droit à
  l'effacement).
- **FR-020** : Le contenu textuel des 4 pages **DOIT** être maintenable
  par un éditeur non technique (à terme via CMS ou fichiers Markdown
  versionnés ; au MVP, fichiers Markdown dans le repo avec procédure
  de mise à jour documentée).

### Entités clés

- **`LegalDocument`** : document légal versionné. Caractéristiques :
  type (énuméré, valeurs au MVP : `mentions_legales`, `cgu_b2c`,
  `cgu_b2b`, `confidentialite`, `comment_ca_marche`), version
  (incrément monotone), contenu (par locale, FR-CA obligatoire, EN
  différé), checksum, date de publication, date de prise d'effet.
  Note : `mentions_legales` et `comment_ca_marche` sont versionnés pour
  traçabilité éditoriale mais ne collectent pas de consentement explicite
  (pas d'entité `LegalAcceptance` associée).
- **`LegalAcceptance`** : acceptation horodatée par un utilisateur ou
  un brief anonyme. Caractéristiques : identifiant du sujet (`userId`
  pour conseiller/admin, `briefId` pour voyageur anonyme), type de
  document accepté, version acceptée, horodatage UTC, adresse IP,
  user-agent. Immutable une fois créée.

---

## Critères de succès *(obligatoire)*

### Résultats mesurables

- **SC-001** : 100 % des pages publiques (vérifié par crawl automatisé
  hebdomadaire) contiennent dans leur pied de page les **5** liens vers
  les pages légales et chaque lien retourne 200 OK.
- **SC-002** : 100 % des créations de compte conseiller produisent une
  `LegalAcceptance` de type `cgu_b2b` enregistrée en BD, mesuré par
  réconciliation `count(comptes créés)` vs `count(LegalAcceptance type='cgu_b2b')`.
- **SC-003** : 100 % des soumissions de brief intake (feature 002)
  produisent **deux** `LegalAcceptance` (`confidentialite` ET
  `cgu_b2c`), mesuré par réconciliation `count(briefs soumis) × 2`
  vs `count(LegalAcceptance type IN ('confidentialite','cgu_b2c'))`.
- **SC-004** : 0 conseiller ni voyageur ne soumet un compte ou un brief
  sans consentement valide, mesuré par test d'intégration bloquant en
  CI (tentative de POST sans le champ de consentement → rejet 400).
- **SC-005** : Les 4 pages passent l'audit `axe-core` WCAG 2.1 AA sans
  aucune violation `critical` ni `serious` en CI.
- **SC-006** : Les 4 pages atteignent Lighthouse Performance ≥ 90,
  SEO ≥ 95, Accessibilité ≥ 95 (mesuré par Lighthouse CI sur chaque
  build) — conforme à la constitution Principe XII.
- **SC-007** : 95 % des chargements des 4 pages atteignent un LCP
  < 1,5 s (sous le budget de 2,5 s) sur l'infrastructure cible
  (mesure CrUX ou OTel sur production).
- **SC-008** : Lors d'une mise à jour de version d'un document légal,
  100 % des utilisateurs actifs ayant l'ancienne version sont prompts à
  ré-accepter dans les 7 jours suivant leur prochaine connexion.
- **SC-009** : Le temps moyen pour qu'un utilisateur trouve l'une des
  5 pages depuis n'importe quelle page publique est de < 2 clics
  (vérifié par cartographie UX du footer).
- **SC-010** : 100 % des `LegalAcceptance` sont retrouvables par
  `userId` ou `briefId` pour une demande Loi 25 (test d'intégration de
  réconciliation).

---

## Hypothèses

- **Rédaction du texte légal hors scope code** : le contenu littéral
  des 5 pages (texte juridique) est produit en parallèle par un
  juriste externe ou par adaptation de templates Loi 25/CCQ ; cette
  spec couvre la structure technique, le rendu Next.js, et la
  traçabilité des acceptations. Le texte sera intégré dans des fichiers
  Markdown ou composants React au moment du `/speckit.tasks`. Une
  révision juridique finale est requise avant le lancement public mais
  ne bloque pas le développement.
- **Identité légale de l'éditeur fixée au `/speckit.tasks`** : la spec
  verrouille la **structure** (personne morale Québec, NEQ à 10
  chiffres, juridiction Montréal). Les **valeurs exactes** (raison
  sociale officielle, NEQ, adresse postale précise, courriel
  responsable de la protection des renseignements personnels) sont
  fournies par le porteur du projet au moment du `/speckit.tasks` et
  intégrées dans les pages avant tout déploiement public. Aucune
  publication publique de `/mentions-legales` n'est possible avec des
  valeurs placeholder.
- **Aucun bandeau de consentement cookies au MVP** : la plateforme au
  lancement n'utilise que des cookies strictement essentiels (session
  Auth.js, CSRF, locale next-intl, idempotency BullMQ). Aucun tracking
  analytics tiers (Google Analytics, Meta Pixel, etc.). Si un outil de
  ce type est ajouté ultérieurement, un bandeau de consentement sera
  livré via une feature séparée. Mentionné explicitement dans
  `/confidentialite`.
- **`next-intl` déjà configuré** dans 001 — la structure i18n FR-CA est
  en place et les pages de cette feature ajoutent leurs propres clés
  sans refonte.
- **Footer comme composant partagé** : créé dans cette feature et
  réutilisé par toutes les pages publiques actuelles et futures
  (Tier 1+). Sa structure doit être stable.
- **Module identité étendu** : la table `LegalAcceptance` et la
  vérification de version sont logées dans le module identité existant
  (ports d'application + adaptateur Prisma + middleware d'élévation).
  Pas de nouveau module.
- **Intégration côté intake** : la collecte de consentement Loi 25 au
  moment du brief (US4) est livrée par la feature 002-voyageur-intake.
  Cette spec définit le contrat `LegalAcceptance` ; 002 consomme le
  port de création.
- **i18n EN différée** : les catalogues EN sont créés vides
  (placeholder) pour matérialiser la structure ; le texte EN sera
  ajouté dans une feature ultérieure quand le marché anglophone sera
  ouvert.

---

## Dépendances

- **Module `identité`** : extension avec table `LegalAcceptance`, port
  d'écriture côté application, vérification de version dans le
  middleware Auth.js / NestJS.
- **Module `002-voyageur-intake` (en cours)** : consomme le port public
  d'écriture `LegalAcceptance` pour son consentement Loi 25 au moment
  du brief. Doit attendre le merge de cette spec **ou** mocker le port
  côté intake en attendant.
- **`next-intl`** (déjà en place) — clés FR-CA primary, structure EN
  prête.
- **Sitemap dynamique** (sera couvert par feature 017 Tier 3) — au MVP,
  un `sitemap.xml` minimal référençant ces 4 pages suffit ; il sera
  enrichi par 017 plus tard.

---

## Hors scope

- **Rédaction du texte légal lui-même** (juriste ou template adapté) —
  livré en parallèle, intégré au moment du `/speckit.tasks`.
- **Internationalisation au-delà de FR-CA et EN** (catalogues espagnol,
  etc. — différé).
- **Bandeau de consentement cookies avancé** — différé jusqu'à ajout
  d'analytics tiers.
- **Pages presse, à propos, blog, FAQ produit** — hors scope.
- **CMS pour édition des pages par un non-développeur** — au MVP,
  fichiers Markdown versionnés dans le repo ; un CMS pourra être ajouté
  en Tier 5 si la fréquence de mise à jour le justifie.
- **Procédure complète de gestion des plaintes Loi 25** — couverte par
  la page `/confidentialite` qui pointe vers la CAI Québec ; un flow
  applicatif dédié de gestion des plaintes côté admin est une feature
  séparée future.
- **Workflow d'archivage automatique des anciennes versions de
  documents** — au MVP, les anciennes versions restent accessibles en
  lecture pour les utilisateurs qui ont accepté cette version
  historique (preuve), mais pas indexées publiquement.
