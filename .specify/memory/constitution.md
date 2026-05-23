<!--
SYNC IMPACT REPORT
==================
Version change: TEMPLATE (placeholders only) → 1.0.0
Ratification: première adoption — la version précédente du fichier n'était qu'un
gabarit non rempli, cette version constitue donc le contrat initial du projet.

Principes ajoutés (7) :
  - I.   Conformité réglementaire par conception (NON-NÉGOCIABLE)
  - II.  Vie privée et Loi 25 (NON-NÉGOCIABLE)
  - III. Qualité de lead avant volume
  - IV.  Français d'abord
  - V.   Monolithe modulaire
  - VI.  Logique métier déterministe et testée (NON-NÉGOCIABLE)
  - VII. Observabilité de la boucle économique

Sections ajoutées :
  - Contraintes de conformité et frontière transactionnelle
  - Flux de développement et portes qualité
  - Governance

Sections supprimées : aucune (les sections précédentes n'étaient que des
placeholders [SECTION_2_NAME] / [SECTION_3_NAME]).

Templates et fichiers dépendants — état de synchronisation :
  ✅ .specify/templates/plan-template.md   — Section "Constitution Check"
       reste générique ("[Gates determined based on constitution file]") ;
       elle lit la constitution dynamiquement, aucune modification requise.
  ✅ .specify/templates/spec-template.md   — pas de référence statique à la
       constitution ; les exigences fonctionnelles seront cadrées au cas par
       cas par les portes définies ici.
  ✅ .specify/templates/tasks-template.md  — la phase « Polish » couvre déjà
       les tâches transversales (sécurité, docs) ; ajouter des tâches
       d'observabilité (Principe VII) et de conformité (Principe I) sera fait
       au cas par cas dans tasks.md, pas dans le template.
  ✅ .specify/templates/checklist-template.md — gabarit générique, aucune
       référence constitutionnelle à mettre à jour.
  ⚠  CLAUDE.md (racine du dépôt) — actuellement un stub ; à enrichir lors du
       prochain /speckit-plan pour pointer vers cette constitution et vers
       le plan courant. Suivi : non-bloquant.

TODOs reportés : aucun (toutes les valeurs sont concrètes).
-->

# Conseiller Voyage — Constitution

## Principes fondamentaux

### I. Conformité réglementaire par conception (NON-NÉGOCIABLE)

La plateforme **NE TOUCHE JAMAIS** la transaction de voyage. Aucune fonctionnalité
n'a le droit, directement ou indirectement, de :

- effectuer ou confirmer une réservation auprès d'un fournisseur (transporteur,
  hôtelier, voyagiste, croisiériste, etc.) ;
- encaisser des fonds en provenance d'un client final ;
- verser des fonds à un fournisseur de voyage ;
- détenir, séquestrer ou transmettre un acompte au nom d'un client.

L'objet du produit est exclusivement la **mise en relation qualifiée** entre un
voyageur et un conseiller en voyage déjà inscrit auprès d'une agence titulaire d'un
permis. Cette frontière maintient la plateforme **hors du périmètre** de la *Loi
sur les agents de voyages* (Office de la protection du consommateur, Québec) et
du *Travel Industry Act, 2002* (TICO, Ontario). Tout PR qui propose une
fonctionnalité franchissant cette frontière **DOIT** être rejeté à la revue, peu
importe la pression commerciale.

Tout conseiller **DOIT** avoir un statut de conformité explicitement marqué
« vérifié » dans la base — c'est-à-dire (a) certificat CCV (Québec) ou
enregistrement TICO (Ontario) déposé et contrôlé, et (b) affiliation active à une
agence titulaire de permis — **AVANT** d'être rendu visible dans toute interface
publique ou d'être éligible à un matching. Toute requête de matching ou d'affichage
**DOIT** filtrer sur ce statut au niveau de la couche de données, pas seulement de
l'UI.

**Raison** : un seul incident où la plateforme aurait encaissé un dépôt ou
diffusé un conseiller non vérifié suffit à requalifier l'entreprise en agent de
voyages — ce qui implique cautionnement, fonds d'indemnisation et licence — et à
détruire le modèle économique. Cette frontière est le produit.

### II. Vie privée et Loi 25 (NON-NÉGOCIABLE)

Les données personnelles des voyageurs et des conseillers **DOIVENT** être hébergées
et traitées en **région canadienne**. Tout sous-traitant (hébergeur, fournisseur
LLM, outil d'analyse, service de courriel transactionnel) **DOIT** offrir une
résidence canadienne contractuelle ; à défaut, il **NE PEUT PAS** recevoir de
données personnelles identifiables.

Le consentement à la collecte **DOIT** être recueilli explicitement au moment de
l'intake, avec une finalité énoncée (« mise en relation avec un conseiller
vérifié ») — pas de case précochée, pas de bundling avec d'autres consentements.

La collecte **DOIT** respecter la minimisation : ne sont stockés que les champs qui
servent directement au matching ou à la traçabilité du lead. Tout nouveau champ
ajouté à l'intake **DOIT** être justifié dans la spec par son usage de matching,
sinon il est refusé.

Le droit à l'effacement **DOIT** être implémenté de bout en bout, accessible par
une route authentifiée pour le titulaire des données, et propager la suppression
(ou l'anonymisation irréversible) aux backups, journaux de leads et caches.

### III. Qualité de lead avant volume

La valeur produit est le **dossier préqualifié**, pas la visibilité passive. Les
décisions de design et d'algorithme **DOIVENT** maximiser le taux d'acceptation
par les conseillers, pas le volume brut de leads envoyés.

Le système **DOIT** plafonner à **3 conseillers maximum** notifiés par demande de
voyageur. Tout dépassement, y compris en mode dégradé, est interdit.

Chaque lead **DOIT** être traçable jusqu'à son état final via une machine à états
explicite : `envoyé → vu → accepté → refusé → devis_envoyé → réservation_confirmée → perdu`.
Les transitions **DOIVENT** être horodatées et persistées de façon immuable
(append-only) pour permettre le calcul de la conversion lead→devis→réservation.
Toute fonctionnalité qui crée un lead **DOIT** instrumenter cette traçabilité dès
la première version, pas dans un sprint ultérieur.

### IV. Français d'abord

L'expérience par défaut **DOIT** être en français (variante FR-CA) sur tous les
parcours : intake, communications transactionnelles, espace conseiller, pages
publiques, courriels système, messages d'erreur. L'anglais (et toute autre langue)
**DOIT** être ajouté via une couche d'internationalisation propre (clé/valeur,
catalogues séparés), jamais par fork de gabarits.

Le SEO **DOIT** cibler en priorité les requêtes francophones ; les meta, schémas
structurés, sitemaps et URL canoniques en français **DOIVENT** être les
référentiels de vérité, les versions traduites étant des `alternate hreflang`.

Tout nouveau contenu utilisateur (copie, libellé, message) **DOIT** être livré en
FR-CA en premier ; livrer une version EN-seulement est un défaut de spec.

### V. Architecture : monolithe modulaire

L'application **DOIT** être un monolithe modulaire à frontières claires. Les
modules de premier niveau sont : **conformité**, **préqualification (intake)**,
**matching**, **SEO**, **facturation**, **identité**. Chaque module expose une
interface publique étroite ; les imports cross-module **DOIVENT** passer par cette
interface, pas par les internes.

Les microservices sont **interdits par défaut**. Un module n'est extrait en
service séparé que sur **preuve mesurée** d'un goulot (latence, scaling, isolation
de blast radius) — la preuve doit figurer dans le plan d'implémentation avant
l'extraction.

Le fournisseur de LLM **DOIT** être placé derrière une interface de domaine
(`LlmProvider` ou équivalent) qui n'expose que les opérations métier dont la
plateforme a besoin (résumer un brief, scorer une affinité, etc.). Aucun appel
direct à un SDK propriétaire de LLM en dehors de l'implémentation de cette
interface. Cela garantit qu'un changement de fournisseur reste local.

### VI. Logique métier déterministe et testée (NON-NÉGOCIABLE)

Le **scoring de matching** et la **validation des briefs** d'intake **DOIVENT**
être implémentés comme des **fonctions pures**, déterministes pour des entrées
données, sans appel I/O caché (pas de DB, pas de réseau, pas d'horloge, pas
d'aléa non injecté).

Les tests unitaires couvrant ces fonctions **DOIVENT** être écrits **avant**
l'implémentation (TDD, cycle Red-Green-Refactor) et **DOIVENT** échouer une fois,
puis passer. Un PR qui introduit ou modifie ces composants sans test rouge → vert
visible dans l'historique est rejeté.

Toute branche de logique métier sensible (acceptation/refus de lead, calcul de
plafond conseiller, règles de conformité) **DOIT** avoir une couverture par cas
nominal **et** par cas d'erreur. Aucun seuil de couverture en pourcentage n'est
imposé, mais l'absence de test pour un chemin métier est un défaut bloquant à la
revue.

### VII. Observabilité de la boucle économique

Les quatre métriques de premier ordre **DOIVENT** être instrumentées dès la
première mise en production de chaque module concerné, pas après coup :

1. **Taux de complétion de l'intake** (visiteur entré → brief soumis) ;
2. **Pourcentage de leads acceptés** (lead envoyé → accepté par au moins un
   conseiller) ;
3. **Conversion lead → devis → réservation confirmée** (par cohorte mensuelle) ;
4. **Churn conseiller** (taux de désactivation mensuelle, distingué entre départ
   volontaire et désactivation pour non-conformité).

Chaque feature qui touche l'un de ces parcours **DOIT** documenter dans son plan
d'implémentation comment elle alimente ces compteurs. Les tableaux de bord
correspondants **DOIVENT** être créés et liés dans le README du module avant la
mise en production.

## Contraintes de conformité et frontière transactionnelle

Ces contraintes opérationnalisent les Principes I et II et s'appliquent à toute
spec, plan et tâche.

- **Frontière de paiement** : aucun code de paiement (Stripe Checkout, terminal
  marchand, agrégateur, virement) **NE PEUT** transiter par les modules de
  matching ou de mise en relation. Le seul paiement autorisé sur la plateforme
  est l'**abonnement du conseiller** au service (B2B, modèle SaaS), géré par le
  module `facturation` et isolé.
- **Vérification conseiller** : le statut de conformité d'un conseiller est
  source de vérité dans le module `conformité`. Tout accès à ce statut par un
  autre module **DOIT** passer par l'interface publique du module, jamais par un
  JOIN direct sur la table.
- **Résidence des données** : les choix d'hébergement, de stockage objet et de
  fournisseur LLM **DOIVENT** être documentés dans le plan d'implémentation avec
  la région retenue. Toute région non canadienne est un défaut bloquant.
- **Journal d'audit** : toute opération qui change le statut de conformité d'un
  conseiller, qui crée/transitionne un lead, ou qui supprime des données
  personnelles **DOIT** produire une entrée d'audit horodatée, immuable et
  retrouvable par identifiant de sujet.
- **Mentions légales et CGU** : toute interface publique **DOIT** rappeler que
  la plateforme n'est pas un agent de voyages, ne perçoit aucun fonds client et
  agit uniquement comme service de mise en relation.

## Flux de développement et portes qualité

- **Porte 1 — Plan** : chaque fonctionnalité passe par `/speckit-specify` puis
  `/speckit-plan`. Le plan **DOIT** inclure une section *Constitution Check* qui
  liste, pour chaque principe potentiellement impacté, comment la feature s'y
  conforme (ou justifie une dérogation, qui ne peut être que mineure et jamais
  pour les principes I, II, VI).
- **Porte 2 — Tests d'abord pour la logique métier** : pour tout changement
  touchant scoring, matching ou validation de brief, les tests unitaires
  **DOIVENT** être commités avant l'implémentation, dans des commits séparés et
  ordonnés.
- **Porte 3 — Revue de code** : un PR **DOIT** être revu par au moins une autre
  personne (ou par une revue IA documentée si l'équipe est mono-développeur en
  phase d'amorçage). La revue **DOIT** explicitement vérifier les Principes I,
  II et VI.
- **Porte 4 — Observabilité avant mise en production** : aucun module qui
  alimente une métrique de Principe VII ne **PEUT** être déployé sans que les
  compteurs correspondants soient instrumentés et visibles.
- **Porte 5 — Documentation** : un changement de comportement utilisateur
  **DOIT** mettre à jour la copie FR-CA et, si une couche EN existe déjà, la
  version EN dans le même PR.

## Governance

Cette constitution **supplante** toute autre pratique informelle ou habitude
d'équipe. En cas de conflit entre cette constitution et un document de plus bas
niveau (README, commentaire, convention orale), la constitution prévaut.

**Procédure d'amendement** :

1. Un amendement est proposé via un PR dédié modifiant `.specify/memory/constitution.md`.
2. Le PR **DOIT** inclure un *Sync Impact Report* mis à jour en commentaire HTML
   en tête du fichier (version, principes touchés, templates impactés).
3. Le PR **DOIT** être approuvé explicitement par le porteur produit avant
   merge.
4. Les principes marqués **NON-NÉGOCIABLE** (I, II, VI) **NE PEUVENT** être
   affaiblis que par un amendement MAJEUR documentant la raison réglementaire
   ou stratégique du changement.

**Politique de versionnement** (semver appliqué à la constitution) :

- **MAJEUR** : retrait d'un principe, redéfinition incompatible d'un principe
  existant, ou affaiblissement d'un principe NON-NÉGOCIABLE.
- **MINEUR** : ajout d'un nouveau principe ou d'une nouvelle section,
  élargissement matériel d'une règle existante.
- **PATCH** : clarification, reformulation, correction de typo, ajustement non
  sémantique.

**Revue de conformité** : à chaque `/speckit-plan` et `/speckit-tasks`, le
contenu de la constitution **DOIT** être relu pour cadrer les portes qualité du
plan ou de la liste de tâches. La présence d'un *Constitution Check* explicite
dans le plan est obligatoire.

**Guidance d'exécution runtime** : pour les détails techniques (stack, structure
de répertoires, commandes shell), se référer au plan courant dans
`/specs/<feature>/plan.md` et au fichier `CLAUDE.md` à la racine du dépôt.

**Version**: 1.0.0 | **Ratified**: 2026-05-22 | **Last Amended**: 2026-05-22
