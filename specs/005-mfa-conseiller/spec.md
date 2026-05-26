# Spécification fonctionnelle : MFA conseiller et élévation de session

**Branche feature** : `005-mfa-conseiller`

**Créé le** : 2026-05-25

**Statut** : Draft

**Entrée** : Description utilisateur : `MFA conseiller (Multi-Factor
Authentication) — extraction du scope résiduel de l'ancien roadmap-002
(Identité avec MFA). Exigence Principe IX NON-NÉGOCIABLE de la
constitution v2.2.0.`

---

## Clarifications

### Session 2026-05-25

- Q : MFA bloquant dès la création du compte conseiller, OU optionnel jusqu'au
  premier accès à un lead voyageur réel ?
  → A : **Bloquant dès l'obtention du statut `verified`** côté Conformité
  (feature 001). Le conseiller peut créer son compte et soumettre son
  dossier de conformité sans MFA, mais l'enrôlement TOTP devient bloquant
  à la transition `pending → verified` (impossible d'accéder au tableau
  de bord conseiller ni à un lead tant que TOTP n'est pas activé). Raison :
  un conseiller `pending` n'a accès à aucune donnée sensible ; un
  conseiller `verified` peut potentiellement voir les briefs voyageurs.
- Q : Backup codes — combien, et regenerable à vie ou affichés une seule fois ?
  → A : **10 codes one-time-use générés à l'enrôlement TOTP, affichés
  une seule fois** (texte téléchargeable .txt + bouton « copier dans le
  presse-papier »). Le conseiller peut **régénérer un nouveau lot à
  tout moment** depuis son tableau de bord ; régénération invalide
  immédiatement l'ancien lot (hash bcrypt remplacés). Chaque code est
  consommé à usage unique, marqué `used_at` en BD au moment de la
  consommation.
- Q : Récupération si perte device + backup codes — admin seul ou support
  automatisé ?
  → A : **Exclusivement admin avec vérification hors-bande**. Le
  conseiller contacte le support ; un admin valide l'identité (appel
  téléphonique au numéro déclaré dans le dossier de conformité +
  document d'identité avec photo). L'admin déclenche un reset MFA depuis
  une console dédiée, ce qui révoque le secret TOTP et tous les backup
  codes. Le conseiller doit alors refaire l'enrôlement. Pas de reset par
  courriel ou SMS automatisé — trop risqué pour un usage SaaS B2B
  professionnel.
- Q : Step-up modal interruptible (cancel possible) ou bloquant total ?
  → A : **Bloquant pour l'action sensible, interruptible pour la
  session**. Le modal demande le code TOTP avant d'autoriser l'action
  ciblée ; l'utilisateur peut fermer le modal et revenir à l'écran
  précédent (lecture seule), mais l'action sensible reste verrouillée
  jusqu'au step-up réussi. Pas de redirect vers la page de login.
- Q : Admin MFA — obligatoire dès J1 ou warning gradué ?
  → A : **Obligatoire dès J1**. Tout admin doit activer TOTP avant son
  premier accès à la console d'administration. Aligne sur le Principe
  IX NON-NÉGOCIABLE et évite la dette d'enrôlement.
- Q : Récupération MFA pour un admin qui a perdu son device + ses backup
  codes ?
  → A : **Un admin peut réinitialiser le MFA d'un autre admin** selon le
  même flow que US4 (vérification hors-bande + justification ≥ 20
  caractères + audit log immuable). **Politique opérationnelle** : au
  moins **2 admins actifs en permanence** sur la plateforme — contrainte
  organisationnelle (runbook ops), pas une contrainte logicielle. Pas de
  rôle « super-admin » distinct au MVP : le RBAC reste à 2 niveaux
  (admin / conseiller), tout admin peut réinitialiser le MFA de tout
  autre admin. Le break-glass DB direct reste documenté en runbook infra
  comme procédure de dernier recours si jamais l'unique admin restant
  perd son MFA.
- Q : Auto-service pour un utilisateur qui change volontairement de
  device TOTP (nouveau téléphone, migration de gestionnaire de mots de
  passe, etc.) ?
  → A : **Auto-service avec re-authentification forte**. L'utilisateur
  (conseiller OU admin) accède à ses paramètres, clique « Changer de
  device TOTP », saisit son mot de passe courant ET un code TOTP de
  l'ancien device **OU** un backup code valide. Le système invalide
  alors l'ancien secret et démarre un nouveau flow d'enrôlement (QR code
  + 10 nouveaux backup codes). Pattern Google/GitHub/Microsoft. Réservé
  aux utilisateurs qui ont **au moins un facteur encore valide** ; en
  cas de perte totale (ni device ni backup codes), seul le flow admin
  US4 s'applique. Audit log immuable systématique.
- Q : Step-up TOTP requis pour les opérations de gestion MFA
  (régénération de backup codes, lecture des paramètres MFA personnels) ?
  → A : **Oui, step-up requis pour toute opération de gestion MFA**
  (régénération de backup codes ; lecture/édition des paramètres MFA
  personnels ; consultation de l'historique d'audit MFA personnel s'il
  est exposé côté utilisateur dans une feature ultérieure). L'auto-
  service de changement de device (FR-015a) reste exempté car il intègre
  déjà sa propre re-authentification forte sur deux facteurs (mot de
  passe + TOTP ou backup code), et empiler un step-up au-dessus
  produirait une double saisie redondante. Cohérent avec FR-017 qui
  classe déjà « modifier ses paramètres de notification » comme sensible
  — les paramètres MFA sont strictement plus sensibles.
- Q : Notification suite à un échec de step-up qui invalide la session
  (FR-020) ?
  → A : **Courriel transactionnel immédiat à la cible** avec timestamp,
  IP source abrégée, type d'action sensible tentée, et CTA explicite
  « changer mot de passe + révoquer toutes les sessions » si l'opération
  n'est pas reconnue. Symétrique de FR-013 (courriel après verrouillage
  temporaire suite à 5 échecs au login) mais plus critique : un échec
  step-up signale une session déjà authentifiée qui ne peut pas prouver
  le second facteur — typiquement signe d'un détournement de session ou
  d'un accès physique non autorisé à un poste déverrouillé. Pas d'alerte
  admin séparée au MVP (signal déjà présent dans le journal d'audit
  FR-030 consultable par les admins).
- Q : Impact sur les sessions actives lors d'un reset MFA admin ou d'un
  changement de device self-service ?
  → A : **Invalidation immédiate de toutes les sessions actives** de la
  cible sur tous ses devices, déclenchée par le reset MFA admin (FR-024)
  ET par le changement de device self-service (FR-015b). Cohérent avec
  Google/GitHub/Microsoft 365 et l'intuition utilisateur (« on repart de
  zéro »). Critique pour la sécurité : si la raison du reset est
  précisément un détournement de session, ne pas invalider les sessions
  laisse l'attaquant connecté. **Exception** : la régénération de backup
  codes seule (FR-014/FR-015) n'invalide PAS les sessions, car le secret
  TOTP reste inchangé — seuls les codes de secours sont rotés.

---

## Scénarios utilisateurs et tests *(obligatoire)*

> Toutes les *user stories* sont priorisées (P1 = critique MVP). Chacune est
> conçue pour être indépendamment testable et indépendamment livrable. Si on
> n'implémente que la US1, le conseiller peut déjà s'enrôler en TOTP et
> protéger son compte.

### User Story 1 — Enrôlement TOTP au passage en `verified` (Priorité : P1) 🎯 MVP

Un conseiller dont le dossier de conformité vient d'être approuvé par un admin
(transition `pending → verified` de la feature 001) tente de se connecter à
son tableau de bord. Le système détecte qu'il n'a pas encore activé TOTP et
lui présente un écran d'enrôlement bloquant : QR code à scanner avec une
application TOTP (Google Authenticator, 1Password, Authy, etc.), secret texte
copiable en dessous, champ de vérification du premier code à 6 chiffres,
puis affichage one-shot des 10 codes de récupération (téléchargeables et
copiables). Le conseiller confirme avoir sauvegardé ses codes, et seulement
là le système active TOTP et lui ouvre l'accès au tableau de bord.

**Pourquoi cette priorité** : sans cette US, aucun conseiller `verified` ne
peut accéder à son tableau de bord — c'est le bouchon bloquant qui rend tout
le reste de la plateforme exploitable côté professionnel. Constitue à elle
seule le MVP MFA.

**Test indépendant** : créer un compte conseiller, faire approuver son
dossier de conformité par un admin de test, se reconnecter et vérifier que
le tableau de bord est inaccessible tant que l'enrôlement TOTP n'est pas
complété ; après enrôlement, vérifier que la deuxième connexion demande
uniquement le code TOTP (pas le QR à nouveau).

**Scénarios d'acceptation** :

1. **Soit** un conseiller dont le dossier vient d'être approuvé (`verified`),
   **quand** il se connecte avec son courriel et mot de passe corrects,
   **alors** il est redirigé vers `/mfa/enroll` au lieu du tableau de bord.
2. **Soit** un conseiller sur l'écran d'enrôlement TOTP, **quand** il scanne
   le QR code et saisit le code à 6 chiffres correspondant, **alors** le
   système affiche les 10 codes de récupération une seule fois et active
   TOTP sur son compte.
3. **Soit** un conseiller qui vient d'enrôler TOTP, **quand** il tente
   d'avancer sans confirmer la sauvegarde des codes de récupération
   (case à cocher), **alors** le bouton « Accéder à mon tableau de bord »
   reste désactivé.
4. **Soit** un conseiller déjà enrôlé, **quand** il se reconnecte avec
   courriel + mot de passe, **alors** le système lui demande uniquement le
   code TOTP à 6 chiffres (pas de QR ni de codes de récupération).
5. **Soit** un conseiller qui saisit un code TOTP invalide, **quand** il
   tente 5 fois consécutives en moins de 5 minutes, **alors** son compte
   est temporairement verrouillé pour 15 minutes avec courriel de
   notification.

---

### User Story 2 — Step-up modal pour actions sensibles conseiller (Priorité : P1) 🎯 MVP

Un conseiller déjà connecté depuis plus de 30 minutes (son `mfa_verified_at`
de session dépasse 30 min) tente d'accepter un lead voyageur ou de consulter
le brief détaillé d'un voyageur. Le système intercepte l'action, affiche un
modal « Pour des raisons de sécurité, veuillez confirmer votre identité »
avec un champ de code TOTP à 6 chiffres. Le conseiller saisit son code, le
système rafraîchit `mfa_verified_at` de la session courante, et l'action
sensible se poursuit comme s'il venait de se reconnecter. Si le conseiller
ferme le modal sans valider, l'action reste verrouillée mais le reste de
l'interface en lecture seule demeure accessible.

**Pourquoi cette priorité** : sans step-up, un attaquant qui détourne une
session active (vol de cookie, accès physique à un poste non verrouillé)
pourrait lire des briefs voyageurs ou accepter des leads pour détourner du
business. C'est l'extension naturelle de US1 vers la protection continue de
la session.

**Test indépendant** : se connecter en TOTP, attendre 31 minutes (ou
manipuler le timestamp de session côté test), cliquer sur « Accepter le
lead » → vérifier que le modal step-up apparaît ; saisir le code TOTP →
vérifier que l'acceptation va à son terme ; refaire la même action 2
minutes plus tard → vérifier qu'aucun modal n'apparaît.

**Scénarios d'acceptation** :

1. **Soit** un conseiller connecté depuis moins de 30 minutes, **quand** il
   accepte un lead, **alors** l'action s'exécute sans modal step-up.
2. **Soit** un conseiller connecté depuis plus de 30 minutes, **quand** il
   accepte un lead, **alors** un modal step-up TOTP apparaît avant
   l'exécution de l'action.
3. **Soit** un conseiller face au modal step-up, **quand** il ferme le modal
   sans valider, **alors** il revient à l'écran précédent en lecture seule
   et l'action sensible n'est pas exécutée.
4. **Soit** un conseiller qui valide un step-up réussi, **quand** il
   refait une action sensible dans les 30 minutes suivantes, **alors**
   aucun modal n'apparaît (compteur `mfa_verified_at` rafraîchi).
5. **Soit** un conseiller qui saisit un code TOTP invalide dans le modal,
   **quand** il échoue 3 fois consécutives, **alors** le modal se ferme,
   sa session est invalidée, et il est redirigé vers l'écran de login.

---

### User Story 3 — Connexion par code de récupération (Priorité : P1) 🎯 MVP

Un conseiller a perdu temporairement l'accès à son application TOTP
(téléphone à plat, en voyage sans son device, etc.) mais a conservé ses
codes de récupération imprimés ou stockés dans un gestionnaire de mots de
passe. Il choisit « Utiliser un code de récupération » sur l'écran de
demande TOTP, saisit l'un des 10 codes, et accède à son tableau de bord. Le
code utilisé est marqué consommé et ne peut plus servir. Si moins de 3 codes
restent, le système l'avertit visuellement et l'incite à régénérer un nouveau
lot depuis ses paramètres.

**Pourquoi cette priorité** : sans cette US, toute panne de device entraîne
un blocage complet et un appel au support — la friction quotidienne
deviendrait dissuasive. P1 parce que c'est le pendant fonctionnel de
l'enrôlement et qu'on ne peut livrer US1 sans cette voie de secours
auto-service.

**Test indépendant** : enrôler un conseiller en TOTP, récupérer ses 10
codes, se reconnecter en choisissant « code de récupération » au lieu de
TOTP, vérifier que le code est marqué consommé et qu'une seconde tentative
avec le même code échoue ; vérifier le warning quand on descend à 2 codes
restants.

**Scénarios d'acceptation** :

1. **Soit** un conseiller à l'écran de demande TOTP, **quand** il clique
   « Utiliser un code de récupération » et saisit un code valide non
   consommé, **alors** il accède à son tableau de bord.
2. **Soit** un conseiller qui réutilise un code de récupération déjà
   consommé, **quand** il tente de l'utiliser à nouveau, **alors** le
   système refuse et indique « Ce code a déjà été utilisé ».
3. **Soit** un conseiller qui se connecte par code de récupération et qu'il
   ne lui en reste que 2, **alors** une bannière persistante l'invite à
   régénérer un nouveau lot.
4. **Soit** un conseiller qui régénère un nouveau lot depuis ses
   paramètres, **alors** les 10 nouveaux codes sont affichés une seule
   fois et tous les anciens codes (consommés ou non) sont invalidés
   immédiatement.

---

### User Story 4 — Reset MFA par un admin (conseiller OU autre admin) (Priorité : P2)

Un utilisateur enrôlé en TOTP (conseiller OU admin) a perdu à la fois son
device et tous ses codes de récupération. Il contacte le support. Un admin
**actif** de la plateforme l'authentifie hors-bande (appel téléphonique +
document d'identité avec photo, ou pour un autre admin, validation directe
par échange courriel professionnel + appel sur le numéro déclaré à
l'embauche). L'admin ouvre la fiche de l'utilisateur cible dans la console
d'administration, clique « Réinitialiser MFA », saisit une justification
obligatoire (≥ 20 caractères, archivée dans le journal d'audit), et
confirme. Le secret TOTP et tous les backup codes de la cible sont
révoqués ; à sa prochaine connexion, elle est redirigée vers le flow
d'enrôlement TOTP de US1 (ou son équivalent admin de US5) comme s'il était
neuf.

**Politique opérationnelle complémentaire** : il doit toujours y avoir au
moins **2 admins actifs (TOTP enrôlé, compte non révoqué)** sur la
plateforme. C'est une contrainte organisationnelle documentée en runbook
ops, vérifiée par un job d'observabilité qui alerte si le compteur tombe
à 1. Si malgré tout l'unique admin restant perd son MFA, un break-glass
DB direct documenté en runbook infra (accès restreint, double validation)
permet la récupération de dernier recours.

**Pourquoi cette priorité** : P2 parce que le cas est rare (perte de device
ET de codes), mais critique quand il survient — sans cette US, un conseiller
verrouillé reste verrouillé à vie. Implémenté juste après l'US3 qui couvre
le cas plus fréquent du device perdu uniquement.

**Test indépendant** : créer un conseiller enrôlé en TOTP, simuler la perte
en supprimant son secret côté admin, vérifier que le conseiller est
redirigé vers l'enrôlement à sa prochaine connexion ; vérifier que l'action
admin laisse une trace immuable dans le journal d'audit avec la
justification saisie.

**Scénarios d'acceptation** :

1. **Soit** un admin sur la fiche d'un utilisateur enrôlé (conseiller OU
   autre admin), **quand** il clique « Réinitialiser MFA » sans saisir de
   justification (ou < 20 caractères), **alors** le bouton « Confirmer »
   reste désactivé.
2. **Soit** un admin qui confirme un reset MFA avec justification valide,
   **alors** le secret TOTP et les backup codes de la cible sont révoqués,
   et une entrée immuable est ajoutée au journal d'audit (acteur admin,
   cible utilisateur, type de cible conseiller/admin, timestamp,
   justification, IP source).
3. **Soit** un utilisateur dont le MFA vient d'être réinitialisé,
   **quand** il se reconnecte, **alors** il est redirigé vers le flow
   d'enrôlement TOTP comme s'il était neuf.
4. **Soit** un utilisateur dont le MFA vient d'être réinitialisé, **alors**
   un courriel transactionnel l'informe de l'opération (date, justification
   abrégée) et lui demande de contacter le support si l'opération ne lui
   semble pas légitime.
5. **Soit** un admin qui tente de réinitialiser son propre MFA depuis sa
   propre fiche, **alors** le bouton « Réinitialiser MFA » est désactivé
   (auto-reset interdit, doit passer par un autre admin).
6. **Soit** un admin qui tente de réinitialiser le MFA du dernier autre
   admin actif (compteur d'admins actifs = 2 avant l'action), **alors** le
   système affiche un avertissement visible « Vous êtes sur le point de
   verrouiller temporairement l'autre admin de la plateforme. Confirmer
   uniquement après accord hors-bande. » mais autorise l'action.

---

### User Story 5 — Enrôlement TOTP admin obligatoire dès J1 (Priorité : P2)

Un nouvel admin de la plateforme se connecte pour la première fois après
qu'un super-admin lui a créé un compte. Le système détecte qu'il n'a pas
encore activé TOTP et lui présente le même flow d'enrôlement bloquant que
US1 (QR code + codes de récupération + confirmation), mais avec une page
dédiée admin qui rappelle que MFA est obligatoire pour tout accès à la
console d'administration. Aucune action admin (approuver un dossier
conformité, révoquer un conseiller, lire un journal d'audit) n'est
accessible avant l'enrôlement.

**Pourquoi cette priorité** : P2 parce que la population admin est petite
(2 à 5 personnes au MVP) et déjà sensibilisée au risque ; le flow est
techniquement quasi identique à US1, donc la dette de ne pas le faire est
faible, mais l'impact d'un admin compromis est élevé. À livrer rapidement
après US1.

**Test indépendant** : créer un compte admin de test, se connecter, vérifier
que la console d'administration est inaccessible tant que TOTP n'est pas
activé ; vérifier que les actions sensibles admin (US4, par exemple)
déclenchent step-up après 30 minutes comme pour le conseiller.

**Scénarios d'acceptation** :

1. **Soit** un nouvel admin créé par un super-admin, **quand** il se
   connecte pour la première fois, **alors** il est redirigé vers
   `/admin/mfa/enroll` au lieu de la console d'administration.
2. **Soit** un admin enrôlé en TOTP, **quand** il tente une action
   sensible (approuver dossier, révoquer conseiller, déclarer retrait de
   permis) plus de 30 minutes après sa connexion, **alors** un modal
   step-up TOTP apparaît.
3. **Soit** un admin face au modal step-up, **quand** il échoue 3 fois,
   **alors** sa session est invalidée et l'incident est consigné au
   journal d'audit avec une alerte hautement prioritaire.

---

### User Story 6 — Auto-service changement de device TOTP (Priorité : P2)

Un conseiller ou un admin a acheté un nouveau téléphone, ou migre depuis
Google Authenticator vers 1Password. Plutôt que de contacter le support
pour un reset admin, il ouvre ses paramètres MFA, clique « Changer de
device TOTP », saisit son mot de passe courant et soit un code TOTP de
l'ancien device, soit un backup code valide. Le système l'authentifie
sur ces deux facteurs, invalide immédiatement l'ancien secret TOTP et
les anciens backup codes, puis le redirige vers un nouveau flow
d'enrôlement (QR code + 10 nouveaux backup codes). Tant que le nouvel
enrôlement n'est pas terminé, l'utilisateur conserve son accès courant
mais ne peut pas se reconnecter (l'ancien secret est déjà invalidé).

**Pourquoi cette priorité** : P2 parce que le cas est récurrent (nouveau
téléphone tous les 2-3 ans en moyenne) et l'absence d'auto-service génère
une charge support disproportionnée. Implémentation peu coûteuse car
réutilise le flow d'enrôlement de US1 et les mécanismes de validation
existants. Réduit la friction sans dégrader la sécurité, puisque
l'utilisateur doit prouver la possession d'au moins un facteur valide
(TOTP courant OU backup code).

**Test indépendant** : enrôler un utilisateur, ouvrir ses paramètres,
déclencher un changement de device avec mot de passe + code TOTP valide,
vérifier que le nouveau secret est généré et que l'ancien ne fonctionne
plus pour une connexion ; refaire l'opération avec backup code à la
place du TOTP courant ; vérifier qu'une tentative avec mot de passe seul
(sans second facteur) est refusée.

**Scénarios d'acceptation** :

1. **Soit** un utilisateur enrôlé qui démarre un changement de device,
   **quand** il saisit son mot de passe correct et un code TOTP valide
   de l'ancien device, **alors** l'ancien secret est invalidé et il est
   redirigé vers un nouveau flow d'enrôlement (QR + 10 nouveaux backup
   codes).
2. **Soit** un utilisateur enrôlé qui démarre un changement de device,
   **quand** il saisit son mot de passe correct et un backup code valide
   non consommé, **alors** le résultat est identique au scénario 1, le
   backup code utilisé est marqué consommé, et les **9 autres backup
   codes restants sont également invalidés** (cohérence : ancien lot
   intégralement révoqué avec l'ancien secret).
3. **Soit** un utilisateur qui démarre un changement de device, **quand**
   il saisit son mot de passe correct mais aucun second facteur (ou un
   second facteur invalide), **alors** le système refuse et l'invite
   soit à contacter le support (US4), soit à utiliser un backup code.
4. **Soit** un changement de device en cours (ancien secret invalidé,
   nouveau pas encore activé), **quand** l'utilisateur ferme son
   navigateur sans terminer, **alors** sa session courante reste valide
   jusqu'à expiration mais une nouvelle connexion exige de compléter
   l'enrôlement ; un courriel transactionnel lui rappelle l'opération
   inachevée.
5. **Soit** un changement de device réussi, **alors** une entrée immuable
   est ajoutée au journal d'audit (type `mfa_device_changed_self`,
   acteur = cible, timestamp, IP source) et un courriel transactionnel
   informe l'utilisateur du changement avec instruction de contacter le
   support si l'opération n'est pas légitime.

---

### Edge cases

- **Conseiller `pending` qui tente d'enrôler TOTP volontairement** : le
  flow d'enrôlement est accessible depuis ses paramètres dès la création
  de compte (option proactive), mais aucun blocage tant qu'il n'est pas
  `verified`. Si le conseiller enrôle TOTP en `pending` puis passe
  `verified`, aucun nouvel enrôlement n'est demandé.
- **Conseiller `revoked` ou `suspended`** : ne peut pas se connecter du
  tout (filtré en couche conformité, feature 001) ; question MFA non
  pertinente.
- **Voyageur** : pas de MFA, jamais. Le modèle voyageur reste magic-link
  par courriel. Toute tentative de connexion voyageur n'invoque jamais le
  flow TOTP.
- **Décalage d'horloge entre device TOTP et serveur** : tolérance d'une
  fenêtre de ±1 pas TOTP (±30 secondes) côté validation pour absorber les
  petits drifts ; au-delà, l'utilisateur doit synchroniser son device.
- **Tentative de force brute sur step-up** : compteur d'échecs par session
  (3 tentatives max), pas par compte ; au-delà, invalidation de session
  uniquement (n'affecte pas la possibilité de se reconnecter par courriel +
  mot de passe + TOTP frais).
- **Tentative de force brute sur login TOTP initial** : compteur d'échecs
  par compte (5 tentatives max en 5 min), verrouillage temporaire 15 min
  avec courriel de notification.
- **Reset admin sur un compte conseiller suspendu** : autorisé — un
  conseiller peut être suspendu temporairement (litige conformité) puis
  réhabilité ; son MFA reste sa propriété et peut être réinitialisé
  indépendamment.
- **Régénération de codes de récupération pendant qu'une session step-up
  est active** : autorisé ; les nouveaux codes invalident les anciens
  immédiatement, mais la session step-up courante reste valide.
- **Suppression de compte conseiller (Loi 25, effacement)** : secret TOTP
  et hash de backup codes sont supprimés en cascade ; pas d'anonymisation
  applicable (un secret TOTP n'est pas une donnée d'identité au sens de la
  Loi 25, c'est un secret cryptographique).
- **Conseiller qui change de courriel principal après enrôlement** :
  TOTP reste lié à l'identifiant interne (`user_id`), pas au courriel. Le
  changement de courriel n'invalide pas le secret TOTP.

---

## Exigences *(obligatoire)*

### Exigences fonctionnelles

#### Enrôlement TOTP

- **FR-001** : Le système DOIT permettre à un utilisateur conseiller dont le
  statut conformité passe à `verified` (feature 001) de s'enrôler en TOTP
  via un écran dédié `/mfa/enroll` bloquant tout accès au tableau de bord
  conseiller.
- **FR-002** : Le système DOIT générer un secret TOTP cryptographiquement
  fort (160 bits minimum) au démarrage du flow d'enrôlement, encoder ce
  secret en Base32 pour affichage, et le présenter sous deux formes : QR
  code (compatible Google Authenticator, 1Password, Authy, Microsoft
  Authenticator) ET texte copiable.
- **FR-003** : Le système DOIT exiger une vérification réussie d'un premier
  code TOTP à 6 chiffres avant d'activer définitivement le secret côté
  serveur.
- **FR-004** : Le système DOIT, immédiatement après l'activation du secret
  TOTP, générer 10 codes de récupération uniques (alphanumériques, 10
  caractères, formatés en blocs lisibles, par exemple `XXXX-XXXX-XX`), les
  hasher (algorithme à coût ajustable destiné aux mots de passe, p. ex.
  bcrypt/argon2) et stocker uniquement les hashes en base.
- **FR-005** : Le système DOIT afficher les 10 codes de récupération en
  clair une seule fois, avec deux actions : « Télécharger en .txt » et
  « Copier dans le presse-papier ».
- **FR-006** : Le système DOIT exiger une case à cocher explicite « J'ai
  sauvegardé mes codes de récupération en lieu sûr » avant de débloquer
  l'accès au tableau de bord après l'enrôlement.
- **FR-007** : Le système NE DOIT JAMAIS exposer le secret TOTP en clair
  après la phase d'enrôlement (ni en BD, ni en logs, ni dans l'interface).

#### Connexion en deux facteurs

- **FR-008** : Le système DOIT, après une vérification réussie du courriel
  et du mot de passe d'un compte enrôlé en TOTP, présenter un écran de
  saisie du code TOTP à 6 chiffres avant d'ouvrir la session.
- **FR-009** : Le système DOIT accepter un code TOTP avec une tolérance de
  ±1 pas (±30 secondes) pour absorber les décalages d'horloge mineurs.
- **FR-010** : Le système DOIT proposer un lien « Utiliser un code de
  récupération » sur l'écran de demande TOTP.
- **FR-011** : Le système DOIT, lors de la consommation d'un code de
  récupération, marquer ce code comme consommé (`used_at` horodaté) et le
  rendre définitivement inutilisable.
- **FR-012** : Le système DOIT afficher une bannière persistante invitant
  à régénérer un nouveau lot si moins de 3 codes de récupération non
  consommés restent.
- **FR-013** : Le système DOIT limiter les tentatives échouées de code TOTP
  à 5 en 5 minutes par compte ; au-delà, verrouillage temporaire de 15
  minutes avec courriel de notification au conseiller.

#### Régénération de codes

- **FR-014** : Le système DOIT permettre à tout utilisateur enrôlé en TOTP
  de régénérer un nouveau lot de 10 codes de récupération à tout moment
  depuis ses paramètres.
- **FR-015** : Toute régénération DOIT invalider immédiatement l'intégralité
  de l'ancien lot (consommés ET non consommés). La régénération NE DOIT
  PAS invalider les sessions actives de l'utilisateur, car le secret
  TOTP demeure inchangé — seuls les codes de secours sont rotés.

#### Auto-service changement de device TOTP

- **FR-015a** : Le système DOIT offrir, depuis les paramètres MFA d'un
  utilisateur enrôlé (conseiller ou admin), une action « Changer de
  device TOTP » qui ré-authentifie l'utilisateur sur **deux facteurs** :
  son mot de passe courant ET un second facteur, soit un code TOTP
  valide de l'ancien device, soit un backup code valide non consommé.
- **FR-015b** : Un changement de device réussi DOIT invalider
  immédiatement l'ancien secret TOTP ET la totalité du lot de backup
  codes associé (consommés ET non consommés), puis rediriger
  l'utilisateur vers un nouveau flow d'enrôlement identique à FR-001
  à FR-007. Le changement de device DOIT également invalider
  **toutes les sessions actives** de l'utilisateur sur les autres
  devices ; seule la session courante (celle qui exécute le changement
  de device) reste valide pour permettre à l'utilisateur de finaliser
  l'enrôlement immédiatement.
- **FR-015c** : Le système DOIT refuser un changement de device si
  l'utilisateur ne fournit pas les deux facteurs valides (mot de passe
  seul, ou mot de passe + code/backup invalide).
- **FR-015d** : Tout changement de device auto-service DOIT générer une
  entrée immuable dans le journal d'audit (type
  `mfa_device_changed_self`, acteur = cible, timestamp UTC, IP source,
  méthode de second facteur utilisée — TOTP ou backup code).
- **FR-015e** : Le système DOIT envoyer un courriel transactionnel à
  l'utilisateur après tout changement de device réussi (date, IP source
  abrégée, instruction de contacter le support si l'opération paraît
  illégitime).
- **FR-015f** : Si l'utilisateur abandonne le changement de device après
  invalidation de l'ancien secret mais avant activation du nouveau, le
  système DOIT lui envoyer un courriel transactionnel de rappel (« vous
  avez démarré un changement de device mais ne l'avez pas terminé ; vos
  prochaines connexions exigeront de compléter l'enrôlement ») au-delà
  d'un délai de 24 heures.

#### Élévation de session (step-up)

- **FR-016** : Le système DOIT considérer une session comme « MFA frais »
  pendant 30 minutes après le dernier code TOTP validé (initial ou step-up).
- **FR-017** : Le système DOIT intercepter les actions sensibles côté
  conseiller suivantes et exiger un step-up TOTP si la session n'est pas
  « MFA frais » : accepter un lead voyageur, refuser un lead, lire un
  brief voyageur détaillé, exporter des données voyageur, modifier ses
  paramètres de notification, supprimer son compte, **régénérer ses
  backup codes (FR-014), accéder à la page de gestion MFA personnelle
  (lecture ou édition des paramètres MFA, y compris consultation des
  codes restants et historique d'audit MFA personnel s'il est exposé)**.
  **Note** : l'action « Changer de device TOTP » (FR-015a) n'exige pas
  un step-up supplémentaire car elle effectue déjà sa propre
  re-authentification forte sur deux facteurs (mot de passe + TOTP ou
  backup code) ; ajouter un step-up au-dessus créerait une double saisie
  redondante.
- **FR-018** : Le système DOIT intercepter les actions sensibles côté
  admin suivantes et exiger un step-up TOTP si la session n'est pas « MFA
  frais » : approuver un dossier conformité, refuser un dossier
  conformité, suspendre un conseiller, révoquer un conseiller, déclarer un
  retrait de permis (cascade FR-015 de feature 001), réinitialiser le MFA
  d'un utilisateur (conseiller ou autre admin), consulter un journal
  d'audit complet, **régénérer ses propres backup codes (FR-014), accéder
  à sa propre page de gestion MFA personnelle**.
- **FR-019** : Le modal step-up DOIT être interruptible par l'utilisateur
  (bouton de fermeture visible, touche Escape fonctionnelle) ; à la
  fermeture, l'écran précédent reste accessible en lecture seule et
  l'action sensible reste verrouillée.
- **FR-020** : Le système DOIT, après 3 échecs consécutifs de code TOTP
  dans un même modal step-up, fermer le modal, invalider la session, et
  rediriger vers l'écran de login avec un message explicite.
- **FR-020a** : Le système DOIT envoyer un courriel transactionnel à
  l'utilisateur dont la session vient d'être invalidée pour échec
  step-up (FR-020), comportant : timestamp UTC, adresse IP source
  abrégée (format `203.0.113.X` côté IPv4, `2001:db8::` côté IPv6), type
  d'action sensible tentée (label fonctionnel, p. ex. « Accepter un
  lead »), et un CTA explicite « Si ce n'est pas vous, changez
  immédiatement votre mot de passe et révoquez toutes vos sessions
  actives ». Le courriel DOIT être envoyé même si l'utilisateur est en
  cours de session active sur un autre device (la session compromise
  n'est pas la seule potentiellement valide).
- **FR-021** : Le système DOIT rafraîchir le timestamp « MFA frais » après
  chaque step-up réussi, étendant la fenêtre de 30 minutes à partir de la
  validation.

#### Reset MFA admin

- **FR-022** : Le système DOIT offrir aux admins, depuis la fiche d'un
  utilisateur enrôlé en TOTP (**conseiller OU autre admin**) en console
  d'administration, un bouton « Réinitialiser MFA ».
- **FR-022a** : Le bouton « Réinitialiser MFA » DOIT être désactivé
  lorsque l'admin courant consulte sa propre fiche (auto-reset interdit).
- **FR-023** : Le système DOIT exiger une justification texte libre
  (minimum 20 caractères) avant d'autoriser le reset.
- **FR-024** : Le reset MFA DOIT révoquer le secret TOTP courant ET
  l'intégralité des codes de récupération de l'utilisateur cible, et
  marquer cet utilisateur comme « doit ré-enrôler à la prochaine
  connexion ».
- **FR-024a** : Le reset MFA DOIT invalider **immédiatement toutes les
  sessions actives** de l'utilisateur cible sur tous ses devices ; ces
  sessions DOIVENT être déconnectées de force au prochain appel
  HTTP/RSC, avec redirection vers l'écran de login.
- **FR-025** : Tout reset MFA DOIT générer une entrée immuable dans le
  journal d'audit comportant au minimum : identifiant admin acteur,
  identifiant utilisateur cible, **type de cible** (`conseiller` /
  `admin`), timestamp UTC, justification, adresse IP source de l'admin.
- **FR-026** : Le système DOIT envoyer un courriel transactionnel à
  l'utilisateur cible (conseiller ou admin) dont le MFA vient d'être
  réinitialisé, comportant la date, la justification (texte intégral),
  l'identité de l'admin acteur (prénom + nom visible côté admin
  uniquement ; côté conseiller affiché « équipe support », côté admin
  cible affiché « <prénom> <nom> » de l'admin acteur pour traçabilité
  pair-à-pair), et une instruction pour contacter le support si
  l'opération paraît illégitime.
- **FR-026a** : Le système DOIT exposer un compteur observable
  « nombre d'admins actifs (TOTP enrôlé, compte non révoqué) » consulté
  par un job d'observabilité qui émet une alerte hautement prioritaire
  si le compteur descend à 1 ou moins, conformément à la politique
  opérationnelle « ≥ 2 admins actifs en permanence ».
- **FR-026b** : Le système DOIT afficher un avertissement visible dans
  l'UI de confirmation de reset MFA lorsque l'action ciblerait le dernier
  autre admin actif (compteur d'admins actifs égal à 2 avant l'action),
  texte : « Vous êtes sur le point de verrouiller temporairement l'autre
  admin de la plateforme. Confirmer uniquement après accord hors-bande. »

#### MFA admin obligatoire

- **FR-027** : Le système DOIT exiger l'enrôlement TOTP de tout admin avant
  le premier accès à la console d'administration. Le flow d'enrôlement
  admin DOIT être identique à FR-001..FR-007 mais accessible à
  `/admin/mfa/enroll`.
- **FR-028** : Tout admin non enrôlé tentant d'accéder à `/admin/*` DOIT
  être redirigé vers `/admin/mfa/enroll`.

#### Authentification multi-facteur — voyageur

- **FR-029** : Le système NE DOIT JAMAIS exiger TOTP ou code de récupération
  d'un utilisateur voyageur. Le modèle voyageur reste magic-link courriel
  exclusivement.

#### Verrouillage et journal d'audit

- **FR-030** : Tout verrouillage temporaire (FR-013), toute invalidation de
  session pour échec step-up (FR-020), tout reset MFA admin (FR-025), toute
  régénération de codes (FR-015) DOIT générer une entrée datée dans le
  journal d'audit consultable par les admins.
- **FR-031** : Le journal d'audit MFA DOIT être en append-only au niveau
  base de données (aucune mise à jour ni suppression possible côté
  application).
- **FR-032** : Le système DOIT permettre à un admin de consulter le journal
  d'audit MFA filtré par utilisateur, par type d'événement et par fenêtre
  temporelle, sous step-up MFA (cf. FR-018).

#### Accessibilité

- **FR-033** : L'écran d'enrôlement TOTP DOIT être pleinement utilisable au
  clavier seul (Tab, Shift+Tab, Enter, Escape).
- **FR-034** : Le QR code DOIT être systématiquement accompagné du secret
  texte copiable visible et annoncé par lecteur d'écran.
- **FR-035** : Les codes de récupération DOIVENT être affichés dans un bloc
  monospace avec contraste ≥ 7:1 (WCAG AAA pour la lecture critique) et
  être annoncés un par un par les lecteurs d'écran.
- **FR-036** : Le modal step-up DOIT respecter les attentes ARIA pour les
  modales (focus piégé, `aria-labelledby`, `role="dialog"`,
  `aria-modal="true"`, restauration du focus au déclencheur à la fermeture).

#### Internationalisation

- **FR-037** : Tous les libellés, messages d'erreur et courriels
  transactionnels DOIVENT être disponibles en FR-CA au minimum. Les
  chaînes EN sont organisées en catalogue séparé pour livraison ultérieure
  (non bloquant pour le MVP).

#### Conservation des secrets

- **FR-038** : Le secret TOTP DOIT être stocké chiffré au repos (chiffrement
  symétrique avec clé en gestionnaire de secrets) en région canadienne
  (`ca-central-1`).
- **FR-039** : Les codes de récupération DOIVENT être stockés uniquement
  sous forme de hash à coût ajustable (bcrypt cost ≥ 12 ou argon2id avec
  paramètres équivalents) ; jamais en clair.
- **FR-040** : Le secret TOTP et les hashes de codes de récupération
  DOIVENT être supprimés en cascade lors d'un effacement de compte
  conforme Loi 25 (feature 004 et au-delà).

### Entités clés

- **Méthode MFA d'un utilisateur** : type (TOTP, futur passkey), statut
  (enrôlé / en attente d'enrôlement / désactivé), secret chiffré, date
  d'enrôlement, date de dernière utilisation. Un utilisateur peut avoir
  zéro ou une méthode TOTP active.
- **Code de récupération** : valeur hashée, date de génération, date de
  consommation (nullable), lien vers le lot d'origine (pour invalidation
  groupée à la régénération). Un utilisateur enrôlé a toujours un seul
  lot actif de 10 codes.
- **Session avec niveau d'élévation MFA** : timestamp de dernière
  validation TOTP, identifiant de l'utilisateur, expiration de la fenêtre
  « MFA frais » (30 min après dernière validation).
- **Événement d'audit MFA** : type (enrôlement réussi, échec TOTP,
  verrouillage temporaire, step-up réussi, step-up échoué, reset admin,
  régénération codes), acteur, cible (utilisateur affecté), timestamp UTC,
  IP source, métadonnées libres (justification pour reset admin, fenêtre
  de tentatives, etc.).

---

## Critères de succès *(obligatoire)*

### Résultats mesurables

- **SC-001** : 100 % des conseillers `verified` ont une méthode TOTP active
  avant tout accès à un lead voyageur (mesure : ratio
  `conseillers_verified_avec_totp / conseillers_verified` = 1,0 en
  permanence après go-live).
- **SC-002** : 100 % des admins en activité ont une méthode TOTP active
  avant tout accès à la console (mesure équivalente).
- **SC-003** : Le flow d'enrôlement TOTP se complète en moins de 3 minutes
  pour 95 % des utilisateurs (mesure par instrumentation produit du temps
  écoulé entre arrivée sur `/mfa/enroll` et activation effective).
- **SC-004** : Aucune session conseiller ou admin ne reste « MFA frais »
  plus de 30 minutes sans validation explicite (mesure : audit
  hebdomadaire des entrées de session, taux de fuite = 0).
- **SC-005** : Toute action sensible cataloguée (FR-017, FR-018) est
  protégée par un step-up MFA à 100 % en environnement de production
  (mesure : tests d'intrusion trimestriels qui tentent de contourner
  l'élévation et échouent).
- **SC-006** : Le temps de support nécessaire pour un reset MFA admin ne
  dépasse pas 24 heures ouvrables entre la demande conseiller et la
  réinitialisation effective dans 95 % des cas (mesure : journal de
  support).
- **SC-007** : Le taux de conseillers qui réussissent à se reconnecter par
  code de récupération à la première tentative est ≥ 90 % (mesure :
  ratio entrées « step-up via backup réussi » / entrées « tentative
  step-up via backup »).
- **SC-008** : Aucun secret TOTP en clair dans les logs applicatifs,
  d'erreur ou d'audit (mesure : scan automatisé hebdomadaire sur les
  archives de logs).
- **SC-009** : Aucun incident de sécurité lié à un compte conseiller ou
  admin compromis sans MFA dans les 12 mois suivant le go-live (mesure :
  registre incidents de sécurité).
- **SC-010** : Tous les écrans MFA (enrôlement, demande TOTP, step-up,
  reset admin) passent axe-core sans violation sérieuse ou critique
  (mesure : CI bloquant, rapport zéro warning).
- **SC-011** : Le verrouillage temporaire après 5 échecs en 5 minutes
  produit moins de 0,5 % de faux positifs (mesure : ratio des
  verrouillages où le conseiller légitime contacte le support pour
  débloquer, sur l'ensemble des verrouillages).

---

## Hypothèses

- Auth.js v5 (déjà adopté par la feature 001) supporte nativement TOTP via
  un fournisseur dédié et expose des hooks de session permettant de stocker
  et lire `mfa_verified_at` ; aucune nouvelle dépendance de runtime n'est
  introduite par cette feature au-delà des helpers TOTP standard (génération
  de secret, validation HOTP/TOTP RFC 6238).
- La feature 001 (Module Conformité) est en place et expose un statut
  conseiller fiable (`pending`, `verified`, `suspended`, `revoked`) lisible
  par le module Identité au démarrage de toute session conseiller.
- Le tableau de bord conseiller (au-delà de la simple page de redirection
  post-login) sera livré dans une feature ultérieure ; pour cette feature
  005, l'accès débloqué post-enrôlement TOTP est une page provisoire de
  type « Bienvenue, votre profil est protégé ».
- La console d'administration sera étendue avec la fiche conseiller +
  bouton « Réinitialiser MFA » dans cette feature ou en parallèle ; si la
  feature 001 a déjà livré une console basique, on l'enrichit ; sinon, on
  livre une console minimale spécifique au reset MFA.
- Le projet utilise déjà un gestionnaire de secrets pour la production
  (AWS Secrets Manager d'après la constitution) et un dev local
  équivalent ; le chiffrement symétrique du secret TOTP s'appuie dessus,
  pas de gestion de clé custom au niveau application.
- L'envoi de courriels transactionnels (notification verrouillage,
  notification reset admin) s'appuie sur l'infrastructure courriel
  existante (AWS SES `ca-central-1` d'après la constitution).
- Les utilisateurs cibles (conseillers professionnels CCV/TICO, admins
  internes) sont supposés capables d'installer une application TOTP sur
  smartphone ou un gestionnaire de mots de passe avec support TOTP. Pas
  d'alternative SMS prévue au MVP (jugée moins sécurisée).
- Le passkey/WebAuthn est explicitement reporté à une feature ultérieure ;
  l'architecture des données (entité « Méthode MFA ») laisse la place pour
  l'ajouter sans migration cassante.

---

## Hors-périmètre

- **Passkey / WebAuthn** : reporté. L'architecture le permet, mais le MVP
  livre exclusivement TOTP + codes de récupération.
- **Authentification par SMS ou appel vocal** : refusée par décision de
  sécurité (Principe IX). Pas d'option SMS prévue, même en fallback.
- **MFA voyageur** : hors-périmètre permanent. Le modèle magic-link
  voyageur n'évolue pas.
- **MFA biométrique (Touch ID / Face ID natif)** : reporté ; couvert par
  passkey en pratique.
- **Single Sign-On (SSO entreprise)** : hors-périmètre. Aucun conseiller
  ne s'authentifie via un IdP tiers au MVP.
- **Politique de rotation forcée du secret TOTP** : hors-périmètre. Le
  secret TOTP n'expire pas automatiquement ; la régénération est volontaire
  (codes de récupération) ou administrative (reset admin).
- **Gestion de plusieurs devices TOTP par utilisateur** : hors-périmètre.
  Un utilisateur a au plus un secret TOTP actif à la fois. La pratique
  recommandée (sauvegarder le QR dans un gestionnaire de mots de passe
  multi-device) couvre ce besoin sans complexité supplémentaire.
- **Notifications push pour validation MFA** (modèle Microsoft
  Authenticator « approve push ») : hors-périmètre. Saisie manuelle du
  code à 6 chiffres uniquement.
- **Audit trail consultable côté conseiller** : hors-périmètre. Le journal
  d'audit reste réservé aux admins au MVP.

---

## Dépendances

- **Feature 001 (Module Conformité)** : fournit le statut conseiller
  (`pending`, `verified`, `suspended`, `revoked`) qui conditionne la
  bascule en enrôlement MFA obligatoire. Doit être déployée et stable.
- **Feature 004 (Mentions légales)** : fournit le module Identité de base
  (`apps/api/src/modules/identite/`) et la session Auth.js v5 partagée
  Next.js/NestJS via ADR-0004. La feature 005 enrichit le même module et
  doit donc être planifiée après le merge de la 004 (ou rebasée
  régulièrement).
- **Infrastructure courriel (AWS SES `ca-central-1`)** : déployée et
  testée pour les notifications transactionnelles.
- **Gestionnaire de secrets (AWS Secrets Manager prod, 1Password CLI
  dev)** : disponible pour stocker la clé de chiffrement du secret TOTP.
