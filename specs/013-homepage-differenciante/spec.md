# Feature Specification: Page d'accueil publique différenciante

**Feature Branch**: `013-homepage-differenciante`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "Page d'accueil publique différenciante (feature roadmap 026, module SEO × matching). Traduire en messages explicites les différenciateurs structurels de Conseiller Voyage face aux acteurs québécois (réseaux captifs, annuaires à facettes, registre OPC) pour éviter le « clone appauvri » d'une vitrine captive. H1 neutralité + appariement ; CTA unique vers l'intake ; sections « pourquoi 3 », confiance OPC/TICO, neutralité + Loi 25 ; SSR/SSG + budgets CWV + JSON-LD ; FR-CA canonique, EN différé ; anti-marketplace ADR-0002."

## Contexte produit

La page d'accueil actuelle (`/[locale]`) est un squelette de soft-launch destiné aux
conseillers pilotes (porte d'entrée vers leur espace + switch FR/EN). Elle ne porte
aucun message de positionnement et ne s'adresse pas au **voyageur**, qui est pourtant
la cible du trafic organique (Principe XII : le trafic organique est une valeur cœur).

Trois types de concurrents québécois occupent le terrain (cf. roadmap, *Contexte
concurrentiel*) : les **réseaux captifs** (vitrine éducative d'une marque), les
**annuaires à facettes** (l'utilisateur trie lui-même une liste), et le **registre OPC**
(source de vérité de la certification, sans parcours de mise en relation). Le danger
identifié : une page d'accueil « parlez à un conseiller » serait un *clone appauvri* de
la vitrine captive. Cette feature rend **visibles en surface** les quatre différenciateurs
structurels de la plateforme — neutralité multi-réseaux, appariement algorithmique à
partir d'un brief, vérification OPC/TICO imposée en couche DB, vie privée par conception
(Loi 25) — sans jamais transgresser l'invariant *intake = unique route de mise en
relation* ni [ADR-0002](../../docs/adr/0002-pas-de-cta-contact-direct.md) (aucun contact
direct conseiller).

## Clarifications

### Session 2026-06-06

- Q: Le H1 promet « les 3 conseillers », mais le matching (011) peut en renvoyer moins (`partially_matched`) ou aucun (`unmatched`). La page risque-t-elle de sur-promettre ? → A: Le H1 d'accroche reste la formulation mandatée par la roadmap (« les 3 conseillers vérifiés faits pour vous »), mais toute copie secondaire et explicative emploie « **jusqu'à 3** » pour rester exacte. La page d'accueil est du **contenu statique de positionnement** : elle n'interroge jamais le matching en direct et ne garantit pas un résultat avant soumission du brief.
- Q: L'accès des conseillers/admins pilotes (présent dans le squelette actuel) doit-il disparaître ? → A: Non. L'accès conseiller/admin devient **secondaire et discret** (lien d'en-tête ou de pied de page « Espace conseiller »), pour ne pas concurrencer le CTA primaire voyageur tout en préservant la porte d'entrée du soft-launch.
- Q: Faut-il livrer un nouveau design system avec cette page ? → A: Non. La page réutilise les primitives existantes (`packages/ui` shadcn/Radix + Tailwind) ; la formalisation du design system reste la feature 025. Aucun blocage sur 025.
- Q: Quel traitement visuel du héro ? → A: **Héro texte centré** (texte-only, sans image). Le LCP devient le H1 (pas d'image à charger), le CLS est nul et il n'y a aucune dépendance au design system (025). Choix le plus sûr pour la porte Lighthouse (Perf ≥ 90) et le plus fidèle au positionnement sobre. Le squelette de mise en page agréé (en-tête sobre → héro → « pourquoi 3 » → neutralité → bandeau Loi 25 → mention anti-contact → CTA répété → pied de page) est détaillé dans `plan.md`.
- Q: Quel régime de trafic viser ? → A: **Plateforme « magnétique »** visant le **maximum de trafic organique** — potentiellement **plusieurs millions de visites par jour**. Conséquence directe sur la home : elle DOIT être **entièrement statique et servie par le CDN canadien**, sans aucune dépendance par requête à l'origine applicative (DB/Redis/SES), pour absorber les pics (campagnes, viralité) au bord sans dégradation. Le magnétisme repose sur un SEO/GEO maximal (contenu citable, métadonnées + balisage riches, partage social). La montée en charge du reste de la plateforme et l'arborescence SEO de masse relèvent des features SEO (016-019, 027) et infra (021), différées.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Le voyageur comprend la promesse et lance un brief (Priority: P1) 🎯 MVP

Un voyageur francophone arrive sur la page d'accueil (souvent depuis une recherche
organique). En quelques secondes, au-dessus de la ligne de flottaison, il comprend ce
que fait la plateforme — *décrire son voyage et recevoir les conseillers vérifiés faits
pour lui* — et voit **une seule action claire** : « Décrire mon voyage ». Ce CTA le mène
au formulaire d'intake (brief). Il n'y a aucun autre chemin de mise en relation, aucun
bouton « contacter », aucune liste de conseillers à appeler.

**Why this priority**: C'est l'entrée de toute la boucle économique côté voyageur et la
conversion principale de la page. Livrée seule, elle remplace déjà le squelette actuel
par une page qui convertit le trafic organique en briefs — la valeur cœur d'acquisition.

**Independent Test**: Charger la page d'accueil en FR-CA → vérifier que le H1 porte la
promesse de neutralité + appariement (pas la marque), que le sous-titre mandaté est
présent, qu'il existe **exactement un** CTA primaire « Décrire mon voyage » pointant vers
la route d'intake, et qu'un clic y conduit. Vérifier l'absence totale de coordonnée de
contact (téléphone, courriel, formulaire de contact) et de lien conseiller menant à un
contact direct.

**Acceptance Scenarios**:

1. **Given** un visiteur anonyme, **When** il ouvre `/` (FR-CA), **Then** le H1 affiche la promesse « Décrivez votre voyage. On vous présente les 3 conseillers vérifiés faits pour vous. » et le sous-titre « Indépendant de tout réseau. Aucun frais de plus qu'en ligne. ».
2. **Given** la page chargée, **When** le visiteur cherche l'action principale, **Then** il existe **un seul** CTA primaire « Décrire mon voyage » menant à la route d'intake (`/voyage/nouveau`), et aucun CTA concurrent de « soumission » ou de « contact ».
3. **Given** la page chargée, **When** on inspecte l'ensemble du contenu, **Then** aucune coordonnée de contact direct (téléphone, courriel, formulaire) ni aucun lien cliquable vers le contact d'un conseiller n'est présent (ADR-0002).
4. **Given** un visiteur au clavier uniquement, **When** il tabule, **Then** le CTA primaire est atteignable et activable au clavier, avec focus visible.
5. **Given** un visiteur sans JavaScript, **When** la page se charge, **Then** le contenu principal et le CTA (lien) restent fonctionnels (rendu serveur/statique).

---

### User Story 2 - Le voyageur comprend pourquoi le modèle est différent et digne de confiance (Priority: P2)

Au-delà de l'accroche, le voyageur veut comprendre *pourquoi 3 conseillers et pas une
liste*, *pourquoi il ne peut pas contacter directement*, et *pourquoi faire confiance*. La
page explicite l'appariement algorithmique (critères → axes de scoring → 3 choisis), la
neutralité multi-réseaux (indépendants compris), la garantie de vérification OPC/TICO, et
la protection des données (Loi 25). Ces sections transforment les différenciateurs
invisibles en arguments lisibles, ce qu'un annuaire ou une vitrine captive ne peut pas
tenir.

**Why this priority**: Réduit le rebond et construit la confiance qui mène à la
soumission du brief. Dépend de la coquille livrée par US1 mais chaque section est testable
indépendamment (présence, contenu, liens).

**Independent Test**: Charger la page → vérifier la présence et le contenu des quatre
sections de différenciation (pourquoi 3 / neutralité / confiance OPC-TICO / Loi 25), et que
le bandeau confiance et la section « pourquoi pas de contact direct » renvoient bien vers
`/comment-ca-marche`.

**Acceptance Scenarios**:

1. **Given** la page chargée, **When** le visiteur fait défiler, **Then** une section « Pourquoi 3, et pas une liste » explique l'appariement (le brief décrit le besoin → des critères pondérés → jusqu'à 3 conseillers choisis), sans jargon technique.
2. **Given** la page chargée, **When** le visiteur cherche un gage de confiance, **Then** un bandeau « Tous vérifiés OPC/TICO » est présent et renvoie vers `/comment-ca-marche`.
3. **Given** la page chargée, **When** le visiteur lit la section neutralité, **Then** elle affirme l'indépendance multi-réseaux (conseillers indépendants inclus, aucune appartenance à un réseau captif).
4. **Given** la page chargée, **When** le visiteur s'interroge sur ses données, **Then** un bandeau Loi 25 indique « Vos données restent au Canada. Aucun partage de vos coordonnées sans votre accord. ».
5. **Given** la page chargée, **When** le visiteur se demande pourquoi il ne peut pas appeler un conseiller, **Then** une mention explicative renvoie vers `/comment-ca-marche` (modèle anti-marketplace).

---

### User Story 3 - La page est trouvable, rapide et accessible (Priority: P3)

La page d'accueil est la porte d'entrée du trafic organique : elle doit être indexable,
rendue côté serveur/statique, conforme aux budgets de performance et pleinement
accessible. Les moteurs disposent de métadonnées complètes et d'un balisage structuré
(`Organization`, `WebSite`) ; les utilisateurs au lecteur d'écran ou au clavier disposent
d'un parcours complet.

**Why this priority**: Exigences non négociables (Principes XI et XII) qui conditionnent
l'acquisition organique et l'inclusion, appliquées sur le contenu livré par US1/US2.

**Independent Test**: Exécuter Lighthouse CI et axe-core sur l'URL d'accueil → vérifier
les seuils Perf/SEO/A11y et l'absence de violation a11y sérieuse ; valider le JSON-LD
auprès d'un validateur de données structurées ; vérifier le rendu sans JS et l'en-tête
HTTP indexable.

**Acceptance Scenarios**:

1. **Given** la page d'accueil, **When** Lighthouse CI s'exécute, **Then** Performance ≥ 90, SEO ≥ 95, Accessibilité ≥ 95 (porte bloquante).
2. **Given** la page d'accueil, **When** on mesure les Core Web Vitals, **Then** LCP < 2,5 s, INP < 200 ms (proxy lab TBT), CLS < 0,1.
3. **Given** la page d'accueil, **When** axe-core s'exécute, **Then** 0 violation sérieuse ou critique ; un seul `<h1>`, repères ARIA/sémantiques présents, contraste ≥ 4,5:1.
4. **Given** un robot d'indexation, **When** il récupère la page, **Then** elle renvoie 200, n'a pas de `noindex`, expose un lien canonique et un balisage JSON-LD `Organization` + `WebSite` valide.
5. **Given** un utilisateur qui préfère un mouvement réduit (`prefers-reduced-motion`), **When** la page comporte une animation décorative, **Then** celle-ci est désactivée ou atténuée.

---

### Edge Cases

- **Sur-promesse du nombre** : le H1 dit « les 3 conseillers » (accroche mandatée) mais la copie explicative dit « jusqu'à 3 » ; la page ne garantit jamais un résultat avant soumission (pas d'appel matching en direct).
- **JavaScript désactivé** : contenu principal et CTA (liens) restent fonctionnels (SSR/SSG).
- **Mouvement réduit** : toute animation décorative respecte `prefers-reduced-motion`.
- **Route d'intake indisponible** : le CTA pointe toujours vers la route d'intake canonique ; aucun chemin de mise en relation alternatif n'est offert en repli (l'invariant intake-unique-route prime sur tout mode dégradé).
- **Accès conseiller/admin** : conservé en lien secondaire discret (en-tête/pied de page), sans concurrencer le CTA voyageur, sans exposer d'information de contact.
- **Bascule de langue** : un sélecteur FR/EN reste présent ; FR-CA est la source canonique, EN est différé (catalogue i18n vide ou repli FR jusqu'à 024) — aucun fork de gabarit.
- **Copie codée en dur** : toute chaîne visible provient du catalogue i18n FR-CA (pas de texte en dur), pour permettre l'ajout d'EN sans fork.
- **Pic de trafic (campagne, viralité, saisonnalité)** : absorbé par le cache CDN ; l'origine applicative n'est pas sollicitée par requête (page statique). Aucun chemin de la home ne déclenche de travail serveur par visiteur.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La page d'accueil DOIT afficher un H1 portant la **promesse de neutralité + appariement** (« Décrivez votre voyage. On vous présente les 3 conseillers vérifiés faits pour vous. ») et le sous-titre mandaté (« Indépendant de tout réseau. Aucun frais de plus qu'en ligne. »). Le H1 NE DOIT PAS être centré sur la marque.
- **FR-002**: La page DOIT exposer **un seul CTA primaire** « Décrire mon voyage » menant à la route d'intake (brief). Elle NE DOIT PAS proposer de CTA « demander une soumission », ni aucun CTA de contact direct (ADR-0002, invariant intake = unique route de mise en relation).
- **FR-003**: La page DOIT comporter une section « **Pourquoi 3, et pas une liste** » expliquant en langage clair l'appariement algorithmique (le brief → des critères pondérés → jusqu'à 3 conseillers choisis pour ce voyageur), sans jargon technique ni détail d'implémentation.
- **FR-004**: La page DOIT comporter un **bandeau de confiance « Tous vérifiés OPC/TICO »** renvoyant vers `/comment-ca-marche`, rendant visible la garde `verified` (Principe I).
- **FR-005**: La page DOIT comporter une section « **Indépendant et neutre** » (multi-réseaux, conseillers indépendants inclus) ET un **bandeau Loi 25** (« Vos données restent au Canada. Aucun partage de vos coordonnées sans votre accord. »).
- **FR-006**: La page DOIT comporter une mention « pourquoi pas de contact direct » renvoyant vers `/comment-ca-marche` (pédagogie du modèle anti-marketplace).
- **FR-007**: La page NE DOIT contenir **aucune coordonnée de contact direct** (téléphone, courriel, formulaire de contact) ni aucun lien cliquable menant au contact d'un conseiller (ADR-0002).
- **FR-008**: Toute chaîne visible par l'utilisateur DOIT provenir du **catalogue i18n FR-CA** (aucune copie codée en dur). L'anglais est différé (feature 024) et ajouté par clés/catalogues séparés, jamais par fork de gabarit.
- **FR-009**: La page DOIT être **rendue côté serveur ou pré-générée statiquement** (page publique) ; son contenu principal et son CTA (liens) DOIVENT rester fonctionnels sans JavaScript client.
- **FR-010**: La page DOIT fournir des **métadonnées complètes** (titre, description, balises Open Graph / aperçu social) et un **balisage JSON-LD auto-contenu** `Organization` + `WebSite`. L'infrastructure SEO complète de 017 (sitemaps dynamiques, hreflang) reste hors périmètre.
- **FR-011**: La page DOIT respecter les **budgets Core Web Vitals** : LCP < 2,5 s, INP < 200 ms, CLS < 0,1, et passer la porte **Lighthouse CI** bloquante (Performance ≥ 90, SEO ≥ 95, Accessibilité ≥ 95).
- **FR-012**: La page DOIT être conforme **WCAG 2.1 AA** : un seul `<h1>`, structure sémantique et repères, navigation clavier intégrale avec focus visible, contraste ≥ 4,5:1, et passer la porte **axe-core** bloquante (0 violation sérieuse/critique).
- **FR-013**: La page DOIT être **indexable** : route canonique « / » par langue, réponse 200, sans `noindex`, avec lien canonique correct.
- **FR-014**: La copie de comptage DOIT rester exacte : le matériel explicatif emploie « **jusqu'à 3** » ; la page NE DOIT PAS garantir un nombre de conseillers ni un résultat avant soumission du brief (aucune requête matching en direct).
- **FR-015**: L'accès conseiller/admin DOIT être conservé en **lien secondaire discret** (en-tête ou pied de page) sans concurrencer le CTA primaire voyageur et sans exposer d'information de contact.
- **FR-016**: Toute animation décorative DOIT respecter `prefers-reduced-motion`.
- **FR-017**: La page DOIT être **rendue entièrement statique** (pré-générée par langue) et servie via le **CDN canadien**, **sans aucune dépendance par requête** à la DB/Redis/SES ni aux services applicatifs — afin de soutenir un trafic de l'ordre de **plusieurs millions de visites/jour** sans charge sur l'origine ni dégradation. Aucune fonction de rendu dynamique par requête (lecture de cookies/en-têtes par requête) ne doit être utilisée sur cette route.
- **FR-018**: La page DOIT émettre une **politique de cache** permettant un **taux de hit CDN élevé** (TTL long + revalidation à la demande lorsque la copie change), de sorte que la quasi-totalité des requêtes soit servie au bord (edge).
- **FR-019**: La page DOIT **maximiser la découvrabilité (magnétisme SEO + GEO)** : contenu sémantique **citable par les moteurs de recherche IA**, métadonnées + balisage structuré complets, image de partage social — pour attirer et convertir un trafic organique de masse. (Complète l'infra SEO 017 et la lecture GEO 019, différées.)

### Key Entities *(include if feature involves data)*

- **Bloc de contenu de la page d'accueil** : unité éditoriale (hero, section « pourquoi 3 », bandeau confiance, section neutralité, bandeau Loi 25, mention anti-contact). Aucune donnée persistée ; le contenu vit dans le **catalogue i18n FR-CA**.
- **Balisage structuré** : représentation `Organization` (identité de la plateforme) + `WebSite` (site), sans propriété `contactPoint` ni `telephone` (cohérent ADR-0002).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un visiteur arrivant pour la première fois identifie *ce que fait le site* et *l'unique action à entreprendre* à partir du contenu au-dessus de la ligne de flottaison (H1 + sous-titre + CTA primaire visibles sans défilement sur un viewport mobile et bureau standard).
- **SC-002**: La page contient **0** coordonnée de contact direct (téléphone, courriel, formulaire) et **0** lien menant au contact d'un conseiller, vérifié par contrôle automatisé (invariant ADR-0002).
- **SC-003**: La page contient **exactement un** CTA primaire menant à la route d'intake, et aucun CTA concurrent de soumission/contact.
- **SC-004**: Lighthouse CI sur l'URL d'accueil : Performance ≥ 90, SEO ≥ 95, Accessibilité ≥ 95 (porte bloquante en CI).
- **SC-005**: Core Web Vitals dans les budgets : LCP < 2,5 s, INP < 200 ms (proxy lab TBT), CLS < 0,1.
- **SC-006**: axe-core : 0 violation sérieuse ou critique ; CTA et liens entièrement opérables au clavier avec focus visible.
- **SC-007**: Le JSON-LD `Organization` + `WebSite` passe un validateur de données structurées avec 0 erreur, sans `contactPoint`/`telephone`.
- **SC-008**: **100 %** des chaînes visibles proviennent du catalogue i18n FR-CA (0 copie codée en dur), permettant l'ajout d'EN ultérieur sans fork de gabarit.
- **SC-009**: La page d'accueil rend son contenu principal et son CTA fonctionnels **avec JavaScript désactivé** (preuve du rendu serveur/statique).
- **SC-010**: La home soutient un trafic de l'ordre de **plusieurs millions de visites/jour** : **≥ 95 %** des requêtes servies depuis le cache CDN (edge), l'origine applicative **n'est pas sollicitée par requête** ; TTFB p95 (cache hit) **< 200 ms**. Vérifiable par la configuration (génération statique + `Cache-Control`) et un test de charge léger au bord.
- **SC-011**: La page reste **servie même si l'origine applicative (DB/Redis/SES/app) est indisponible** (servie depuis le CDN), preuve de résilience à l'échelle.

## Assumptions

- **Route d'intake** : le CTA « Décrire mon voyage » pointe vers la route d'intake voyageur livrée par 008, soit `/[locale]/voyage/nouveau` ; c'est l'unique route de mise en relation (invariant produit).
- **Page pédagogique** : `/comment-ca-marche` existe (feature 004) et porte l'explication détaillée du modèle anti-marketplace.
- **Axes d'appariement** : la section « pourquoi 3 » s'appuie conceptuellement sur les axes de scoring livrés par 011 (✅), mais la page d'accueil **n'interroge jamais** le matching en direct — c'est du contenu statique de positionnement.
- **Dépendance 017 partielle** : l'infrastructure SEO complète (sitemaps dynamiques, hreflang) de 017 est différée ; la page d'accueil porte son propre JSON-LD minimal auto-contenu et ne bloque pas sur 017.
- **Design system** : la formalisation du design system (025) est différée ; la page réutilise les primitives existantes (`packages/ui` shadcn/Radix + Tailwind). Le polish visuel pourra itérer.
- **Internationalisation** : FR-CA est la source canonique ; l'anglais est différé à 024 (catalogue EN ajouté par clés séparées, jamais par fork).
- **Public et authentification** : la page d'accueil est publique et anonyme (aucune personnalisation, aucune session requise) ; l'accès conseiller/admin reste un lien secondaire discret.
- **Remplacement du squelette** : cette feature remplace le squelette de soft-launch actuel (`/[locale]/page.tsx`) par la page de positionnement voyageur, en préservant l'accès conseiller/admin en secondaire.
- **Échelle et magnétisme** : la home est conçue pour **plusieurs millions de visites/jour**, absorbées par le **CDN canadien (CloudFront ca-central-1)** ; comme elle est statique, l'origine applicative est quasi non sollicitée. Le magnétisme (attirer ce trafic) repose sur le SEO/GEO de la home + l'arborescence SEO de masse des features 016-019/027 (différées) — la home en est l'entrée phare, pas le seul levier.
