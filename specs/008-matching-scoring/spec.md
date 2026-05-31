# Feature Specification: Matching scoring conseiller × brief (top 3)

**Feature Branch**: `008-matching-scoring`

**Created**: 2026-05-31

**Status**: Draft

**Input**: User description: "Matching scoring conseiller × brief : fonction pure dans la couche domaine (Principe VI TDD obligatoire), plafond strict de 3 conseillers par brief, filtrage du statut `verified` via ConformiteQueryPort, consommation de l'outbox `voyageur.brief.activated` posée par 008. Signal optionnel : boost ≤ +10 % pour un conseiller consulté publiquement par le voyageur dans les 24 h précédant le brief (cookie `cv_suggested` HMAC déjà posé par 007). Sortie : top 3 conseillers triés par score, persisté append-only."

> **Cartographie roadmap** : feature 011 (Tier 2 — boucle économique cœur). Première brique de monétisation : sans matching exploitable, l'intake ne génère aucune valeur conseiller. Dépend de 001 (statut verified), 007 (cookie `cv_suggested`), 008 (outbox `voyageur.brief.activated`). Débloque 012 (notifications + machine d'état), 013, 014, 015.

## Clarifications

### Session 2026-05-31

- Q1 : Quels axes alimentent le scoring brut ? → B : **5 axes MVP standard** (destination match, proximité géographique, langue, spécialité, familiarité voyageur). Note : suite à Q3, la langue est devenue un **filtre dur** appliqué AVANT scoring — le scoring effectif porte donc sur 4 axes (destination, géo, spécialité, familiarité). Familiarité = mapping novice↔mentor, experimenté↔pair. Pondération relative exacte fixée en `/speckit-plan` via ADR (re-pondérable sans changer la signature de la fonction pure : `scoreComponents` séparés en sortie).
- Q2 : Source canonique de l'adresse conseiller pour le calcul de proximité ? → A : **Hiérarchie profil 007 → siège social 001** — préfère l'adresse de profil conseiller (feature 007) si saisie, sinon fallback sur l'adresse de siège social du dossier conformité (feature 001, garantie de présence). Pas de migration de schéma nécessaire au MVP. Le `/speckit-plan` valide la présence des champs et trace toute hiérarchie alternative dans un ADR si besoin.
- Q3 : Langue — filtre dur ou axe pondéré ? → A : **Filtre dur** — si la langue demandée par le voyageur (`VoyageurBrief.conseillerLanguage`, feature 008) n'est pas dans la liste des langues parlées du conseiller (feature 007), le conseiller est **exclu du candidate set AVANT scoring**. Cohérent avec FR-CA prioritaire (constitution, Loi 25). Conséquence : un brief peut tomber en `partial` ou `empty` (FR-014) si aucun conseiller vérifié ne parle la langue demandée — comportement déjà couvert.
- Q4 : Trigger de re-matching après révocation cascade ? → B : **Manuel admin uniquement** — pas d'auto-trigger en MVP. Quand les 3 conseillers d'un `MatchingResult` perdent leur statut `verified`, le système émet `voyageur.brief.all_matches_revoked` (consommé par l'extension US5 du dashboard admin de 008). L'admin clique « re-matcher » manuellement, ce qui crée un NOUVEAU `MatchingResult` (l'ancien est `superseded_at` mais préservé append-only). Évite les boucles d'auto-recompute. Une graduation vers semi-auto sera un ADR ultérieur si la fréquence le justifie.
- Q5 : Taxonomie des événements outbox matching ? → A : **4 événements distincts** — `voyageur.brief.matched` (top 3 complet, status `ok`), `voyageur.brief.partially_matched` (1 ou 2 entrées, status `partial`), `voyageur.brief.unmatched` (0 entrée, status `empty`), `voyageur.brief.all_matches_revoked` (cas Q4). Sémantique explicite, routing topic-based simple côté 012 (notifications + machine d'état lead). Chaque événement persiste `briefId`, `matchedCount`, `algorithmVersion` dans son payload.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Voyageur reçoit ses 3 conseillers vérifiés (Priority: P1)

Le voyageur a soumis un brief de voyage qualifié (feature 008), il a cliqué sur le magic link, son brief est passé à l'état `active`. Dans les secondes qui suivent, le système calcule et persiste de manière irrévocable les **trois conseillers vérifiés** les plus pertinents pour son brief. Le voyageur peut consulter ce top 3 dans son espace personnel et entrera ensuite en relation avec ces conseillers (features ultérieures 012-013-015).

**Why this priority** : c'est la transformation principale du modèle. Sans ce calcul, le brief reste un formulaire mort. C'est aussi le verrou Principe I (OPC/TICO) — seuls les conseillers vérifiés sont exposés, le plafond 3 protège chaque lead d'une dilution commerciale.

**Independent Test** : on peut soumettre un brief activé en staging, vérifier qu'un résultat `MatchingResult` apparaît en base avec exactement 3 entrées triées par score décroissant, et que chacune des 3 lignes pointe vers un conseiller dont le statut `verified` est attesté par `ConformiteQueryPort` au moment du calcul.

**Acceptance Scenarios** :

1. **Given** un brief actif et au moins 10 conseillers vérifiés couvrant la destination, **When** l'outbox émet `voyageur.brief.activated`, **Then** un `MatchingResult` est persisté avec exactement 3 entrées triées par score décroissant, chacune référençant un conseiller `verified` au moment du calcul.
2. **Given** un `MatchingResult` déjà calculé pour un briefId, **When** l'outbox ré-émet `voyageur.brief.activated` pour le même briefId (replay), **Then** aucun nouveau résultat n'est créé (idempotence stricte par briefId).
3. **Given** un brief actif et **seulement 2 conseillers vérifiés** éligibles, **When** le matching tourne, **Then** le résultat contient 2 entrées (jamais zapper ni inventer un 3e) et est marqué `partial=true`.
4. **Given** un brief actif et **0 conseiller vérifié** éligible, **When** le matching tourne, **Then** un `MatchingResult` `empty=true` est persisté ET un événement outbox `voyageur.brief.unmatched` est émis (consommé par US5 de 008 — file admin).

---

### User Story 2 — Boost soft pour conseiller consulté récemment (Priority: P2)

Si le voyageur, dans les 24 heures précédant la soumission de son brief, a consulté la page publique d'un conseiller (feature 007 a posé un cookie `cv_suggested` HMAC contenant l'identifiant du conseiller consulté), ce conseiller bénéficie d'un **boost soft** au scoring : son score est multiplié par un facteur ≤ 1,10 (≤ +10 %). Le boost ne garantit pas la sélection, mais améliore la probabilité du conseiller d'apparaître dans le top 3 si son score brut est déjà compétitif.

**Why this priority** : signal explicite documenté dans la roadmap Tier 2. Aligne l'intention voyageur découverte avant le formulaire avec le résultat post-formulaire. Désactivable proprement (si le cookie est absent, invalide, expiré, ou si la signature HMAC ne valide pas, on retombe sur le scoring brut).

**Independent Test** : soumettre deux briefs identiques, l'un avec cookie `cv_suggested` pointant vers un conseiller B classé 4e en brut, l'autre sans cookie. Vérifier que dans le premier cas, B peut entrer dans le top 3 alors qu'il en restait exclu dans le second.

**Acceptance Scenarios** :

1. **Given** un brief actif et un cookie `cv_suggested` valide HMAC pointant vers un conseiller B vérifié, **When** B est éligible mais classé entre la 4e et la 6e position en scoring brut, **Then** B est promu dans le top 3 si son score boosté (×1,10) le dépasse au-dessus du 3e brut.
2. **Given** un cookie `cv_suggested` avec signature HMAC invalide, **When** le matching tourne, **Then** le cookie est ignoré silencieusement (pas d'erreur, pas d'audit anormal), scoring brut appliqué.
3. **Given** un cookie `cv_suggested` valide mais pointant vers un conseiller **non vérifié au moment du calcul**, **When** le matching tourne, **Then** le boost n'est PAS appliqué (filtre verified prioritaire) et le conseiller n'apparaît pas dans le top 3.
4. **Given** un cookie `cv_suggested` valide pointant vers un conseiller B déjà 1er en scoring brut, **When** le matching tourne, **Then** le résultat est identique au cas sans boost (B reste 1er, le boost ne déplace rien d'utile).

---

### User Story 3 — Mode dégradé statut verified évolue après calcul (Priority: P3)

Entre le moment où le matching calcule le top 3 et le moment où le voyageur entre en contact avec ses conseillers (features 012/013), un conseiller du top 3 peut perdre son statut `verified` (révocation OPC/TICO, expiration de permis, suspension administrative — events publiés par feature 001). Le système doit gérer cette évolution sans réécrire le résultat (append-only) tout en garantissant qu'aucun conseiller non-vérifié n'est exposé au voyageur.

**Why this priority** : verrou Loi 25 + Principe I. Le résultat persisté est l'audit, l'exposition au voyageur est filtrée dynamiquement à chaque lecture.

**Independent Test** : créer un `MatchingResult` avec 3 conseillers vérifiés. Révoquer l'un d'eux via feature 001. Lire le résultat depuis l'API voyageur — le conseiller révoqué doit être absent de la réponse exposée.

**Acceptance Scenarios** :

1. **Given** un `MatchingResult` avec top 3 [A, B, C], **When** B perd son statut `verified` après calcul, **Then** la lecture exposée au voyageur retourne uniquement [A, C] et le `MatchingResult` original reste intact en base (audit).
2. **Given** un `MatchingResult` avec top 3, **When** les 3 conseillers perdent leur statut `verified`, **Then** la lecture retourne une liste vide ET un événement `voyageur.brief.all_matches_revoked` est émis pour l'admin (file de retry manuel).
3. **Given** un `MatchingResult` invalidé partiellement, **When** un admin re-trigger un re-matching, **Then** un NOUVEAU `MatchingResult` est créé (jamais un update — append-only) et le précédent est marqué `superseded_at`.

---

### Edge Cases

- **Aucun conseiller vérifié** n'existe en base au moment du calcul (jour 1 plateforme) → `MatchingResult` `empty=true` + alerte admin.
- **Tous les conseillers vérifiés sont déjà saturés** (notion de capacité hors scope de 011 — pas de filtre charge) → le matching ignore la capacité, c'est à la feature 012 de gérer.
- **Brief avec destination très niche** (pays peu couvert) où aucun conseiller n'a déclaré la spécialité → le matching score quand même les conseillers vérifiés (axe destination = 0 pour eux, mais 3 autres axes restent). Si aucun ne franchit un seuil de pertinence défini en `/speckit-plan` (ex. score minimum), tombe en `partial` ou `empty` (FR-014).
- **Cookie `cv_suggested` expiré** (> 24 h entre dernière visite et soumission) → ignoré silencieusement, scoring brut.
- **Cookie `cv_suggested` pointant vers un conseiller anonymisé Loi 25** (feature 007 SC-007) → ignoré, scoring brut.
- **Concurrence** : deux triggers `voyageur.brief.activated` pour le même briefId arrivent en parallèle (BullMQ retry) → idempotence stricte par briefId (verrou Redis ou contrainte unique DB).
- **Brief avec dates dans le passé** (cas pathologique passé à travers validation 008) → matching skip + audit error.
- **Recompute après changement de profil conseiller** (le conseiller modifie sa spécialité via 007) → résultats existants intacts (audit append-only), nouveaux briefs bénéficient du nouveau profil.

## Requirements *(mandatory)*

### Functional Requirements

**Calcul et persistence**

- **FR-001** : Le système MUST consommer l'événement outbox `voyageur.brief.activated` (émis par feature 008) comme unique trigger de calcul de matching pour un brief.
- **FR-002** : Le système MUST calculer un score pour chaque conseiller `verified` éligible vs le brief via une fonction pure dans la couche domaine (zéro framework, zéro I/O), conformément au Principe VI (tests écrits AVANT implémentation, commits TDD séparés visibles).
- **FR-003** : Le système MUST persister le résultat dans une entité `MatchingResult` append-only (aucun UPDATE/DELETE autorisé après création, trigger Postgres comme pour les autres tables d'audit du projet).
- **FR-004** : Le système MUST garantir l'idempotence stricte par `briefId` : un re-trigger de `voyageur.brief.activated` pour le même brief NE crée PAS de nouveau résultat.
- **FR-005** : Le système MUST retourner **exactement** entre 0 et 3 entrées par `MatchingResult` (jamais 4+, le plafond 3 est un invariant testé).

**Filtrage et validation**

- **FR-006** : Le système MUST filtrer les conseillers via `ConformiteQueryPort.getVerificationStatus` (feature 001) AVANT le calcul de score — les conseillers non-vérifiés ne sont jamais scorés.
- **FR-007** : Le système MUST vérifier la fraîcheur du statut `verified` au moment du calcul (latence acceptable < 10 s entre changement de statut et prise en compte, conformément à 001 FR-022).
- **FR-008** : Le système MUST tracer dans l'audit append-only (table `matching_audit_entries` ou existante) chaque calcul de matching avec : briefId, nombre de candidats évalués, nombre de candidats verified, score final du 1er, durée du calcul, statut (`ok` / `empty` / `partial`).

**Critères de scoring**

- **FR-009** : Le système MUST scorer chaque conseiller selon **exactement les 5 axes suivants** (Q1 clarify) :
  - **Destination match** : alignement entre les pays/régions du brief (`VoyageurBrief.destinations`, feature 008) et les destinations déclarées par le conseiller (feature 007).
  - **Proximité géographique** : distance FSA entre l'adresse du conseiller et le code postal du voyageur (`VoyageurContact.postalCode`, feature 008 FR-006). Préférence locale Québec/Canada pour la relation client.
  - **Langue** : **filtre dur AVANT scoring** (Q3 clarify) — si la langue demandée par le voyageur (`VoyageurBrief.conseillerLanguage`, feature 008) n'est pas dans la liste des langues parlées par le conseiller (feature 007), le conseiller est exclu d'office du candidate set. La langue ne participe donc pas au score brut (elle filtre en amont, pas en pondération).
  - **Spécialité** : alignement entre `VoyageurBrief.speciality` (feature 008 enum : lune_de_miel, aventure, etc.) et les spécialités déclarées par le conseiller (feature 007).
  - **Familiarité voyageur** : mapping entre `VoyageurBrief.familiarity` (feature 008 enum : novice / experimented_traveler / expert) et l'expérience/séniorité du conseiller (feature 007). Logique de mapping : novice ↔ mentor expérimenté, experimented ↔ pair, expert ↔ pair expert.
  - Pondération relative fixée en `/speckit-plan` via ADR ; la fonction pure expose `scoreComponents` séparés pour permettre re-pondération sans changer sa signature.
- **FR-009a** : Le système MUST calculer la distance géographique conseiller × voyageur via les codes postaux (résolution centroïde de FSA canadien — 3 premiers caractères du code postal, ex. `H7N`). La distance brute alimente une fonction de décroissance documentée (linéaire, logarithmique, par paliers — à fixer en plan + ADR). Aucun appel à un service de géocodage externe en MVP ; un fichier statique de centroïdes FSA canadien est embarqué.
- **FR-009b** : Si le code postal voyageur est invalide ou hors Canada (cas extrême — l'intake est CA-only), le scoring géographique applique un score neutre (médian) sans rejeter le conseiller.
- **FR-009c** : Si l'adresse du conseiller est absente, partielle, ou avec code postal invalide (cas anormal — la conformité 001 devrait l'avoir rejetée), le conseiller MUST être exclu du matching ET un événement audit `matching.conseiller_address_missing` MUST être émis pour remédiation admin.

**Boost signal cookie**

- **FR-010** : Le système MUST lire le cookie `cv_suggested` (HMAC SHA-256 posé par feature 007) attaché à la requête de soumission du brief, le valider via la même clé secrète (`PROFIL_SUGGESTED_COOKIE_SECRET` ou équivalent), et persister l'identifiant du conseiller suggéré dans le brief AU MOMENT de la soumission (jamais au moment du matching — la donnée doit être fixée à l'intent voyageur d'origine).
- **FR-011** : Si un `suggestedConseillerId` valide est attaché au brief, le système MUST appliquer un multiplicateur de score ≤ **1,10** (≤ +10 %) au conseiller correspondant, à condition qu'il soit `verified` au moment du calcul.
- **FR-012** : Le boost MUST être strictement plafonné à +10 % et ne MUST jamais permettre à un conseiller non éligible de devenir éligible (le boost est un facteur multiplicatif sur un score brut existant).
- **FR-013** : Le système MUST tracer dans l'audit chaque application de boost (oui/non, conseiller cible, score brut, score boosté, position pré-boost, position finale).

**Modes dégradés et invariants exposés**

- **FR-014** : Si moins de 3 conseillers vérifiés sont éligibles, le système MUST persister un `MatchingResult` avec 0, 1 ou 2 entrées (jamais 4+, jamais d'invention) et MUST émettre l'un des événements outbox suivants selon le `matchedCount` (Q5 clarify) :
  - `voyageur.brief.partially_matched` si `matchedCount ∈ {1, 2}`, status `partial`
  - `voyageur.brief.unmatched` si `matchedCount = 0`, status `empty`

  Les deux événements sont consommés par l'extension US5 du dashboard admin de feature 008 (file briefs non-matchés) ET par feature 012 (notifications dégradées). Le routing topic-based est trivial — un event = une action métier.
- **FR-015** : Toute lecture de `MatchingResult` exposée au voyageur (API, vue web) MUST filtrer dynamiquement les conseillers dont le statut `verified` est tombé après le calcul. Le `MatchingResult` original reste intact en base (audit).
- **FR-016** : Si tous les conseillers du top 3 perdent leur statut `verified` après calcul, le système MUST émettre un événement outbox `voyageur.brief.all_matches_revoked` (consommé par l'extension US5 du dashboard admin de feature 008) et MUST permettre un re-matching **manuel** via une action admin (Q4 clarify — pas d'auto-trigger MVP). Cette action crée un NOUVEAU `MatchingResult` (le précédent est marqué `superseded_at` mais non détruit, append-only Loi 25).

**Observabilité et SLO**

- **FR-017** : Le système MUST mesurer la durée de chaque calcul de matching et MUST émettre une métrique p95 vers OpenTelemetry / Grafana (cible : < 800 ms cohérente avec SLO Principe X pour les endpoints synchrones, hors LLM).
- **FR-018** : Le système MUST émettre un log structuré (Pino) à niveau `info` pour chaque matching `ok`, `warn` pour `partial`, `error` pour `empty` ou échec technique.
- **FR-019** : Le système MUST produire un événement outbox `voyageur.brief.matched` (top 3 calculé, `matchedCount = 3`, status `ok`) consommé par feature 012 (notifications conseillers + machine d'état lead). Note Q5 : c'est l'un des 4 événements taxonomiques du matching, avec `voyageur.brief.partially_matched` (FR-014), `voyageur.brief.unmatched` (FR-014), et `voyageur.brief.all_matches_revoked` (FR-016).

**Sécurité et conformité**

- **FR-020** : Le système MUST garantir qu'aucune donnée personnelle voyageur n'est journalisée dans l'audit de matching (anonymisation Loi 25 — pas d'email, pas de téléphone, juste `briefId` + `voyageurContactId` en référence).
- **FR-021** : Le calcul de matching MUST être totalement asynchrone vis-à-vis de la requête voyageur (l'activation du brief renvoie immédiatement, le matching tourne en background via BullMQ — pas de blocage UI).

### Key Entities

- **MatchingResult** : Représente le calcul du top 3 pour un brief à un instant donné. Attributs clés : `id` UUID, `briefId` (FK), `computedAt` timestamp, `entries` (0-3 références conseiller + score + composantes), `status` (`ok` | `partial` | `empty`), `boostApplied` boolean, `suggestedConseillerId` nullable, `algorithmVersion` (pour ADR futur sur évolution scoring), `supersededAt` nullable, `supersededByMatchingResultId` nullable.
- **MatchingResultEntry** : Une ligne du top 3. Attributs clés : `matchingResultId` (FK), `position` (1 | 2 | 3), `conseillerId` (FK), `scoreBrut` decimal, `scoreFinal` decimal (post-boost), `scoreComponents` JSON (décomposition par axe pour audit/debug), `boosted` boolean.
- **MatchingAuditEntry** : Trace append-only de chaque calcul, séparée de `MatchingResult` pour ne pas surcharger la table principale. Attributs : `id` UUID, `briefId`, `eventType` (`matching.computed` | `matching.empty` | `matching.partial` | `matching.replay_ignored` | `matching.recomputed`), `occurredAt`, `payload` JSON (candidatesCount, verifiedCount, durationMs, etc.), `idempotencyKey`, `correlationId`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** : Pour 95 % des briefs activés, le `MatchingResult` est persisté en moins de **2 secondes** end-to-end (depuis la publication de `voyageur.brief.activated` dans `intake_outbox_entries` jusqu'à la persistance du `MatchingResult`, **délai BullMQ inclus**). Mesurable via métrique OTel p95 `matching.e2e_duration_ms`. Décomposition cible : ≤ 1,2 s délai BullMQ (file consumer) + ≤ 800 ms calcul + persistance (cohérent avec SLO Principe X — cf. `plan.md` Performance Goals).
- **SC-002** : Le scoring est **strictement déterministe** : pour un même brief et un même ensemble de conseillers (snapshot statuts verified + profils), deux exécutions consécutives produisent le même score à 10⁻⁶ près (vérifié par test de propriété).
- **SC-003** : Le plafond 3 est respecté à **100 %** : sur 1000 matchings simulés en CI, aucun ne produit > 3 entrées (test d'invariant).
- **SC-004** : Quand le cookie `cv_suggested` est présent et valide, le boost est appliqué correctement à 100 % (test d'invariant : score boosté = score brut × facteur ≤ 1,10).
- **SC-005** : Aucun conseiller `non-verified` n'apparaît dans 100 % des `MatchingResult` produits (test d'invariant croisé avec snapshot `ConformiteQueryPort`).
- **SC-006** : Aucun `MatchingResult` n'est créé en doublon pour un même `briefId` sur 10 000 triggers de replay simulés (test d'idempotence).
- **SC-007** : Le taux de briefs `empty` (0 conseiller éligible) en production est mesurable et reste sous **5 %** sur les 90 premiers jours (sinon, ré-évaluer les critères de scoring ou la couverture des conseillers).
- **SC-008** : Le taux de briefs `partial` (1 ou 2 conseillers) reste sous **15 %** sur les 90 premiers jours (idem).
- **SC-009** : Aucune donnée personnelle (email, téléphone, prénom voyageur) n'apparaît dans les logs ni dans `matching_audit_entries` (vérifié par CLI scan SC-005 hebdomadaire, cohérent avec l'invariant Loi 25 du projet).

## Assumptions

- **Source des conseillers éligibles** : le matching consulte la base des `ConseillerProfile` (feature 007) filtrée sur `statut = 'pret'` ET `ConformiteQueryPort.getVerificationStatus = verified`. Les conseillers en statut `incomplet`, `masque_admin`, `anonymise` sont exclus d'office.
- **Source de l'adresse conseiller** : hiérarchie clarifiée Q2 — préfère `ConseillerProfile.address` (feature 007) si saisi, fallback sur l'adresse de siège social du dossier conformité 001 (garantie de présence par la conformité OPC/TICO). Si une migration mineure est nécessaire pour exposer l'adresse 001 au matching, un ADR sera créé au plan.
- **Géocodage** : MVP utilise les centroïdes FSA canadiens (Forward Sortation Area — 3 premiers caractères du code postal, ex. `H7N` couvre Laval-Ouest, environ 3-5 km de rayon). Un fichier statique embarqué (~1 600 entrées FSA + lat/lng) suffit pour le calcul de distance Haversine. Aucun appel d'API externe (Google Maps, OSM Nominatim) en MVP — décision conforme à Loi 25 (pas de fuite de PII voyageur vers tiers).
- **Trigger unique** : seul `voyageur.brief.activated` (post magic-link) déclenche le matching. Un brief en `pending_verification` n'est jamais matché (économie : voyageurs jetables filtrés par le verify).
- **Pas de notion de capacité conseiller dans 011** : si un conseiller est saturé (déjà 50 leads ouverts), il est quand même scoré. La gestion de charge appartient à feature 012 (machine d'état lead).
- **Pas de re-matching automatique sur changement de profil conseiller** : si un conseiller modifie sa spécialité, les briefs déjà matchés ne sont pas recalculés. Le re-matching admin de FR-016 est manuel.
- **Pas de feedback loop dans 011** : le scoring est statique (pas d'apprentissage des préférences voyageur ni des taux de conversion conseiller). Une évolution future via LLM (feature 009) ou ML supervisé sera un ADR ultérieur.
- **Fonction pure testable** : la fonction de scoring prend en entrée un `BriefSnapshot` + une liste de `ConseillerSnapshot` immuables, retourne une liste de `MatchingScoreComponent`. Aucun appel I/O, aucun side-effect, totalement déterministe. Les snapshots sont assemblés par l'adapter infrastructure AVANT l'appel de la fonction pure.
- **Versioning algorithme** : chaque évolution du scoring (pondération, nouvel axe, etc.) bump `algorithmVersion` dans `MatchingResult` pour traçabilité historique. Un ADR documente chaque changement.
- **Cookie `cv_suggested`** : fonctionnel uniquement si le voyageur a visité une page conseiller publique dans les 24h précédant la soumission, sans bloquer ses cookies, et tant que le secret HMAC n'a pas tourné (cf. runbook rotation 007). Sinon scoring brut.
- **Conformité Loi 25 héritée** : les triggers d'anonymisation Postgres sur `VoyageurBrief` (feature 008) propagent l'anonymisation : un brief anonymisé entraîne anonymisation cascade de ses `MatchingResult` (briefId nulled, scoreComponents redacted) — à spécifier en plan + migration.
- **Pas d'exposition LLM dans 011** : le scoring est purement déterministe. Toute reformulation ou enrichissement LLM appartient à feature 009 et alimentera 011 via le `BriefSnapshot` enrichi sans changer la signature de la fonction pure.
