# ADR-0015 — Conservation du slug réservé après effacement Loi 25

* **Statut** : Ratifié par plan 007-profil-conseiller (2026-05-27)
* **Date** : 2026-05-27
* **Auteur** : Plan feature 007 — section *Constitution Check Principe II*

## Contexte

La feature 007 (profil conseiller) introduit un slug public immuable
(`prenom-nom[-suffixe]`) qui sert d'URL canonique de la page conseiller
(`/[locale]/conseiller/marie-dupont`). Cet identifiant SEO doit rester
unique dans le temps pour éviter tout détournement (« hijack ») d'un
ancien profil vers un nouveau conseiller homonyme — cf. **SC-007**
(*slug effacé jamais réattribué*).

Quand un conseiller demande l'effacement de ses données personnelles
(Loi 25 québécoise — droit à l'effacement, art. 28), la feature 023
(future) orchestre la propagation cross-module. Côté profil :

- toutes les PII sont supprimées (biographie, photo S3, années
  d'expérience, sets spécialités/langues/zones) ;
- la photo S3 et son historique FIFO sont supprimés irréversiblement
  (DeleteObject) ;
- le statut profil bascule à `anonymise` (terminal, trigger Postgres) ;
- **le slug est conservé dans `profile_slug_reservations`** pour
  empêcher sa réutilisation par un futur conseiller.

Le slug est dérivé du nom légal (`marie-dupont`) → il s'agit d'une
**conservation de PII** post-effacement. Cette ADR explicite pourquoi
cette conservation est justifiée et bornée.

## Décision

Le slug du conseiller anonymisé Loi 25 **est conservé à vie** dans la
table `profile_slug_reservations` (append-only via trigger Postgres),
mais :

1. La colonne `conseillerIdOrigine` (UUID interne) **DOIT être mise à
   `NULL`** au moment de l'anonymisation. Aucun chemin technique ne
   permet de remonter du slug réservé vers l'`AuthUser` originel.
2. L'enregistrement `ConseillerProfile` conserve uniquement les
   métadonnées techniques (`slug`, `publishedAt`, `anonymizedAt`,
   `authUserId` non-anonymisé côté identité par le module orchestrateur
   023). Tous les champs PII sont effacés (NULL ou sets vides).
3. La table `profile_slug_reservations` est append-only — aucune
   `UPDATE`/`DELETE` possible (triggers Postgres
   `profile_slug_reservations_no_update/delete/truncate`).

## Justification (analyse Loi 25)

- **Article 23** (« droit à l'effacement ») admet une exception de
  conservation **pour obligation légale ou intérêt légitime
  prépondérant**. Ici l'**intérêt légitime** est documenté :
    - **Sécurité technique** : un slug réutilisé permettrait à un nouveau
      conseiller de bénéficier des liens externes existants pointant vers
      l'ancien profil (réputation indue, hijack SEO).
    - **Intégrité éditoriale** : un lecteur qui revient sur un lien
      partagé doit recevoir un `404 Not Found` cohérent, pas un nouveau
      conseiller homonyme.
- **Minimisation** : seul le slug est conservé. Pas d'email, pas de
  téléphone, pas de nom complet (le slug agrège `prenom + nom` avec
  ASCII fold — pas le nom légal exact mais une forme dérivée).
- **Re-identification croisée** : le slug seul est ambigu à l'échelle
  d'une population (combien de « Marie Dupont » au Québec ?). Sans index
  externe, aucun chemin technique ne permet de remonter du slug à la
  personne identifiée. Le risque résiduel est jugé acceptable face à
  l'intérêt SEO/sécurité.

## Conséquences

- **Implémentation** :
    - `AnonymiserProfilLoi25UseCase` (T129) appelle
      `SlugReservationRepository.reserve({slug, raison: 'loi25',
      conseillerIdOrigine: null})` dans la transaction Postgres
      principale.
    - `genererSlugUnique` (domaine pur) check les slugs réservés AVANT
      d'attribuer un nouveau slug → SC-007 garanti par construction.
- **Auditabilité** : la table `profile_slug_reservations` permet à un
  inspecteur (CAI, audit interne) de vérifier que la mécanique
  anti-réutilisation fonctionne.
- **Limite communiquée** : un conseiller dont le slug `marie-dupont` est
  réservé doit savoir que cette URL « brûlée » reste référencée dans
  les caches de moteurs de recherche pendant plusieurs semaines, malgré
  l'anonymisation. Cette limite est documentée dans le toggle FR-006b
  (cf. composant `AfficherNomCompletSwitch`).

## Alternatives considérées

- **Effacement complet du slug** : viole SC-007 et expose au hijack SEO.
  Rejeté.
- **Hash SHA-256 du slug en réservation** : impossible — le check de
  réutilisation requiert une comparaison en clair (`slugify(prenom, nom)
  === slugReserve`).
- **Conservation 7 ans seulement** (rétention audit) : insuffisant — un
  conseiller anonymisé en 2026 doit garder son slug à vie sinon hijack
  possible en 2034.

## Statut & révision

Ratifié par plan 007 (2026-05-27). À reconsidérer si :

- Une décision CAI sur un cas similaire restreint la rétention.
- Une refonte SEO permet de découpler URL stable et nom légal (ex.
  slugs opaques type UUID court).

## Références

- `specs/007-profil-conseiller/plan.md` — Constitution Check Principe II
- `specs/007-profil-conseiller/data-model.md` — `SlugReservation` table
- `specs/007-profil-conseiller/contracts/profil-moderation.port.md` —
  `AnonymiserProfilLoi25UseCase`
- ADR-0012 (audit no-FK Loi 25) — pattern similaire pour
  `auth_audit_events`
