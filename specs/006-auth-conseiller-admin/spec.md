# Spécification — Auth conseiller + admin (feature 002 / dossier `006-auth-conseiller-admin`)

**Branche** : `006-auth-conseiller-admin`

**Créée** : 2026-05-26

**Statut** : Brouillon

**Input utilisateur** : Auth conseiller + admin + RBAC — feature 002 du Tier 0. Bloque tout consommateur authentifié au-delà des magic-links voyageur (gérés plus tard dans 010 intake).

> **Note de numérotation** : cette feature porte l'ID **002** dans la roadmap stratégique (`docs/roadmap.md`). Le dossier de spec utilise `006-auth-conseiller-admin` car les dossiers `specs/<NNN>-…` suivent leur propre séquence Spec Kit, indépendante de la roadmap. Le mapping est explicite dans la roadmap.

---

## Clarifications

### Session 2026-05-26

- Q: UX page de confirmation post-signup / post-reset quand le courriel tarde à arriver → A: Message statique « vérifiez vos spams » + bouton « Renvoyer » désactivé 60 s (countdown visible) puis réactivé sous rate limit ; lien « contacter le support » exposé après le 2ᵉ renvoi infructueux.
- Q: Durée de vie de la session post-login → A: Session DB **30 jours glissants** — chaque requête authentifiée rafraîchit l'expiration. Le re-MFA toutes les 30 min pour actions sensibles (héritage step-up 002a) reste le rempart sur les actions critiques. Standard B2B SaaS (Stripe, Notion, Vercel).
- Q: Métriques d'observabilité (signup conversion, login success rate, lockout rate, password reset rate) instrumentées dès 002 OU déférées à 021 ? → A: **Déférées à 021**. Source de vérité = événements d'audit immuables (FR-033). La feature 021 dérivera les compteurs par sourcing d'événements (pattern déjà appliqué à 002a pour `cv_active_admins_total`). Pas de double instrumentation, scope 002 strictement auth.

---

## Contexte produit

La plateforme a déjà livré (mergé sur `main`) :

- **Feature 001** — module conformité (statut « vérifié » CCV/TICO, source de vérité).
- **Feature 002a** (dossier `specs/005-mfa-conseiller/`) — MFA conseiller (TOTP + step-up + reset admin + auto-service device change + admin MFA J1). Cette feature a posé toute l'infrastructure de session (Auth.js v5 + sessions DB) et de gardes (AuthGuard, RoleGuard, StepUpGuard) côté plateforme **mais tourne sur un vérificateur de mot de passe-stub** qui refuse de démarrer en production.

La présente feature **002** comble ce vide en livrant :

1. L'inscription d'un conseiller (self-service).
2. La connexion conseiller + admin par mot de passe.
3. La vérification d'email.
4. La réinitialisation et le changement de mot de passe.
5. La création d'admins (premier admin par bootstrap CLI ; admins suivants par un admin existant).
6. La déconnexion.

Ces capacités débloquent toutes les features authentifiées en aval : profil conseiller, facturation, dashboards, matching.

---

## Acteurs

- **Visiteur anonyme** — n'a pas encore de compte. Peut soumettre le formulaire d'inscription pour devenir conseiller.
- **Conseiller** — titulaire CCV/TICO en devenir ou actif. Crée son compte lui-même, vérifie son email, complète plus tard son dossier de conformité (feature 001) pour passer au statut « vérifié ».
- **Admin de plateforme** — équipe interne. **Aucune inscription publique.** Créé soit par bootstrap CLI (premier admin), soit par un autre admin via une console interne.
- **Voyageur** — **hors scope** de cette feature. Le voyageur reste anonyme jusqu'à soumettre un brief d'intake (feature 010), qui le fait basculer en suivi par magic-link.

---

## Scénarios utilisateur et tests *(obligatoire)*

### User Story 1 — Inscription conseiller self-service (Priorité : P1)

Maxime, futur conseiller en voyage qui termine sa certification CCV, découvre la plateforme. Il veut créer un compte pour commencer à préparer son profil avant la fin de sa certification. Il saisit son courriel, choisit un mot de passe robuste, accepte les CGU et la politique Loi 25, et reçoit un courriel de vérification.

**Pourquoi cette priorité** : sans inscription self-service, aucun nouveau conseiller ne peut entrer dans le système. C'est le tout premier moment de la boucle économique B2B.

**Test indépendant** : créer un compte depuis la page publique d'inscription, recevoir le courriel de vérification, et constater l'existence d'un utilisateur en base avec `emailVerifiedAt = null` et `role = conseiller`.

**Scénarios d'acceptation** :

1. **Étant donné** un visiteur anonyme sur la page d'inscription conseiller, **quand** il saisit un courriel valide jamais utilisé, un mot de passe ≥ 12 caractères mixtes (lettres/chiffres/symboles), son prénom + nom, et coche l'acceptation CGU + Loi 25, **alors** son compte est créé en statut « en attente de vérification d'email », un courriel de vérification est envoyé, et la page de confirmation explique qu'il doit cliquer le lien reçu.
2. **Étant donné** un visiteur qui tente l'inscription avec un courriel déjà utilisé, **quand** il soumet le formulaire, **alors** le système retourne un message générique sans confirmer ni infirmer l'existence du compte (« Si ce courriel existe, vous recevrez un courriel. ») et n'envoie aucun courriel — protection contre l'énumération.
3. **Étant donné** un visiteur qui choisit un mot de passe trop faible (< 12 caractères, ou uniquement des lettres minuscules), **quand** il soumet, **alors** le système refuse en affichant les règles précises de complexité et ne crée aucun compte.
4. **Étant donné** un visiteur qui ne coche pas la case CGU + Loi 25, **quand** il soumet, **alors** le système refuse avec un message d'accessibilité (`aria-describedby` pointant sur l'erreur).
5. **Étant donné** un visiteur qui soumet 11 fois la page d'inscription en moins d'une heure depuis la même origine, **quand** il tente la 11e soumission, **alors** le système refuse avec un message générique (rate limit anti-DoS).

---

### User Story 2 — Connexion conseiller + admin (Priorité : P1)

Maxime a vérifié son courriel. Il retourne sur la page de connexion, saisit son courriel et son mot de passe, et accède à son tableau de bord. Si Maxime a déjà activé MFA (parce qu'il est passé « vérifié »), le système lui demande aussi son code TOTP avant d'ouvrir la session complète. Si Maxime se trompe 5 fois consécutivement, son compte est temporairement bloqué.

**Pourquoi cette priorité** : sans connexion fiable, aucune session ne s'ouvre. C'est le second pilier de la feature après l'inscription.

**Test indépendant** : se connecter avec des identifiants valides depuis la page de connexion et atterrir sur le tableau de bord conseiller. Tester ensuite 5 mauvais mots de passe → vérifier qu'un 6e essai même avec le bon mot de passe est refusé pendant 15 minutes.

**Scénarios d'acceptation** :

1. **Étant donné** un conseiller avec un compte vérifié et sans MFA actif, **quand** il saisit son courriel + mot de passe corrects, **alors** une session est ouverte et il est redirigé vers son tableau de bord conseiller (`/conseiller`).
2. **Étant donné** un conseiller passé au statut « vérifié » mais sans MFA actif, **quand** il se connecte, **alors** il est redirigé vers `/mfa/enroll` pour activer MFA avant tout accès à un lead.
3. **Étant donné** un conseiller avec MFA actif, **quand** il se connecte avec courriel + mot de passe valides, **alors** il est redirigé vers `/mfa/verify` pour saisir son code TOTP avant d'ouvrir la session complète.
4. **Étant donné** un admin sans MFA actif au J1, **quand** il se connecte, **alors** il est redirigé vers `/admin/mfa/enroll` (la première chose qu'un admin fait).
5. **Étant donné** un compte avec 5 tentatives de connexion échouées consécutives en moins de 15 minutes, **quand** une 6e tentative arrive même avec le bon mot de passe, **alors** le système refuse pendant 15 minutes et journalise un événement d'audit `login_locked` (raison `account_threshold_reached`).
6. **Étant donné** une même IP source qui cumule 20 tentatives de connexion échouées en moins d'une heure (potentiellement réparties sur plusieurs comptes — credential stuffing distribué), **quand** une 21e tentative arrive depuis cette IP, **alors** le système refuse pendant 1 heure et journalise `login_locked` (raison `ip_threshold_reached`), indépendamment du compte ciblé.
7. **Étant donné** un compte verrouillé depuis plus de 15 minutes (ou une IP bloquée depuis plus d'une heure), **quand** une nouvelle tentative arrive, **alors** le compteur correspondant est réinitialisé et la connexion peut reprendre.
8. **Étant donné** un compte dont le courriel n'est pas encore vérifié, **quand** il tente de se connecter, **alors** le système accepte les identifiants mais redirige vers une page « vérifiez d'abord votre courriel » avec option de renvoyer le courriel de vérification.
9. **Étant donné** un courriel inexistant ou un mauvais mot de passe, **quand** un attaquant tente de deviner, **alors** le système retourne un message identique dans les deux cas (« Courriel ou mot de passe incorrect ») et incrémente un compteur d'échec côté serveur sans révéler la cause exacte.

---

### User Story 3 — Vérification de courriel (Priorité : P1)

Maxime a reçu le courriel de vérification dans sa boîte. Il clique le lien. Son courriel est marqué comme vérifié et il peut désormais se connecter. Si le lien a expiré (au-delà de 24 heures), une page lui propose de renvoyer un nouveau courriel.

**Pourquoi cette priorité** : la vérification de courriel est l'unique mécanisme de preuve de propriété du courriel. Sans elle, aucun courriel transactionnel ne peut être envoyé en toute sécurité (la réinitialisation de mot de passe en dépend).

**Test indépendant** : recevoir un lien après l'inscription, cliquer dessus, et constater que le statut `emailVerifiedAt` est désormais renseigné dans le compte.

**Scénarios d'acceptation** :

1. **Étant donné** un conseiller qui vient de s'inscrire et reçoit un courriel de vérification, **quand** il clique le lien dans les 24 heures, **alors** son statut `emailVerifiedAt` est posé à l'instant de la vérification et un événement d'audit `email_verified` est enregistré.
2. **Étant donné** un lien de vérification expiré (> 24 h depuis l'envoi), **quand** l'utilisateur clique, **alors** le système affiche une page « lien expiré » avec un bouton « renvoyer un nouveau courriel ».
3. **Étant donné** un lien de vérification déjà utilisé (one-shot), **quand** un attaquant tente de le rejouer, **alors** le système refuse et affiche un message générique.
4. **Étant donné** un utilisateur qui n'a pas reçu le courriel (filtre spam), **quand** il arrive sur la page de confirmation post-inscription, **alors** le système affiche un message statique « le courriel peut prendre quelques minutes, pensez à vérifier vos spams », un bouton « Renvoyer » initialement **désactivé** avec un countdown visible de 60 secondes (réactivation auto), et le bouton se soumet sous rate limit (max 3 renvois / heure / compte, FR-015). Après le 2ᵉ renvoi sans succès rapporté par l'utilisateur, un lien « contacter le support » s'affiche en complément.

---

### User Story 4 — Déconnexion (Priorité : P1)

Maxime termine sa session. Il clique sur « Se déconnecter » dans le menu utilisateur. Sa session est fermée immédiatement et il est redirigé vers la page de connexion.

**Pourquoi cette priorité** : sans déconnexion explicite, un utilisateur ne peut pas fermer sa session sur un poste partagé. Critique pour la confidentialité.

**Test indépendant** : depuis une session active, cliquer le bouton de déconnexion, et constater que les pages protégées (e.g., `/conseiller`) renvoient une redirection vers `/connexion`.

**Scénarios d'acceptation** :

1. **Étant donné** un utilisateur connecté, **quand** il clique « Se déconnecter », **alors** sa session côté serveur est invalidée, le cookie de session est effacé côté client, et il est redirigé vers `/connexion`.
2. **Étant donné** un utilisateur déjà déconnecté qui tente d'accéder à une page protégée, **quand** le serveur reçoit la requête, **alors** il redirige vers `/connexion` avec un paramètre `?returnTo=<chemin>` pour retour après authentification.
3. **Étant donné** un utilisateur avec plusieurs sessions ouvertes (poste maison + téléphone), **quand** il se déconnecte d'un seul appareil, **alors** seule cette session est fermée, les autres restent actives.

---

### User Story 5 — Réinitialisation de mot de passe oublié (Priorité : P2)

Maxime a oublié son mot de passe. Il clique « Mot de passe oublié » sur la page de connexion, saisit son courriel, et reçoit un lien sécurisé. En cliquant le lien, il choisit un nouveau mot de passe. Toutes ses autres sessions actives sont alors fermées pour des raisons de sécurité, et il doit se reconnecter partout.

**Pourquoi cette priorité** : critique pour la continuité de service. Au MVP strict, un admin peut réinitialiser manuellement à la demande, mais ce chemin doit exister rapidement pour ne pas saturer le support.

**Test indépendant** : demander un lien de reset depuis un courriel valide, vérifier la réception, suivre le lien, poser un nouveau mot de passe, puis se connecter avec ce nouveau mot de passe.

**Scénarios d'acceptation** :

1. **Étant donné** un utilisateur qui saisit son courriel sur `/mot-de-passe-oublie`, **quand** le courriel existe, **alors** un lien de réinitialisation à usage unique est envoyé, valide pendant **1 heure** (défaut OWASP — balance entre fenêtre d'exploitation et tolérance à la latence du filtre anti-spam), et un événement d'audit `password_reset_requested` est enregistré (sans révéler que le courriel existe au caller).
2. **Étant donné** un courriel inexistant saisi par un visiteur, **quand** il soumet, **alors** le système répond le même message générique (« Si ce courriel existe, vous recevrez un courriel ») et **n'envoie aucun courriel** — protection contre l'énumération.
3. **Étant donné** un lien de reset valide, **quand** l'utilisateur clique et saisit un nouveau mot de passe conforme à la politique de complexité, **alors** le mot de passe est mis à jour, **toutes les sessions de cet utilisateur sont invalidées** (sauf celle qui vient d'authentifier le reset, si applicable), un événement d'audit `password_reset_completed` est enregistré, et un courriel de confirmation est envoyé à l'utilisateur (FR-CA : « Votre mot de passe a été changé. Si ce n'est pas vous, contactez-nous immédiatement. »).
4. **Étant donné** un lien de reset expiré ou déjà utilisé, **quand** un attaquant tente de l'utiliser, **alors** le système refuse avec un message générique et propose de redemander un nouveau lien.
5. **Étant donné** un utilisateur qui demande 4 liens de reset en moins d'une heure pour le même courriel, **quand** il soumet la 4e demande, **alors** le système ignore silencieusement (max 3 liens actifs simultanés par compte).

---

### User Story 6 — Changement de mot de passe authentifié (Priorité : P2)

Maxime se rend dans `Paramètres > Sécurité > Changer mon mot de passe`. Il saisit son ancien mot de passe, puis son nouveau (deux fois pour confirmation). S'il a MFA actif, le système lui redemande un code TOTP frais (élévation de session — step-up). Le mot de passe est mis à jour et toutes ses autres sessions sont fermées.

**Pourquoi cette priorité** : permet la rotation proactive du mot de passe sans passer par le flow « oublié ». Cas d'usage attendu en sécurité d'entreprise.

**Test indépendant** : authentifié, soumettre un nouveau mot de passe différent de l'ancien, et constater que la connexion avec l'ancien échoue désormais et que la connexion avec le nouveau réussit.

**Scénarios d'acceptation** :

1. **Étant donné** un utilisateur authentifié saisissant son ancien mot de passe correct et un nouveau mot de passe conforme, **quand** il soumet, **alors** le mot de passe est mis à jour, toutes ses autres sessions sont fermées (sauf la courante), un événement d'audit `password_changed_self` est enregistré, et un courriel de confirmation est envoyé.
2. **Étant donné** un utilisateur authentifié avec MFA actif, **quand** il tente de changer son mot de passe, **alors** une étape d'élévation de session lui demande un code TOTP frais avant d'accepter le changement.
3. **Étant donné** un utilisateur qui saisit un mauvais ancien mot de passe, **quand** il soumet, **alors** le changement est refusé, un événement d'audit `password_change_failed` est enregistré, et après 5 tentatives consécutives échouées sur ce flow le verrouillage de compte standard s'applique.
4. **Étant donné** un utilisateur qui choisit un nouveau mot de passe identique à l'ancien, **quand** il soumet, **alors** le système refuse avec un message « le nouveau mot de passe doit être différent du précédent ».

---

### User Story 7 — Création d'un admin (Priorité : P2)

L'équipe interne provisionne un premier admin lors du déploiement initial (bootstrap). Par la suite, tout nouvel admin est créé par un admin existant depuis une console interne. Tout admin créé est obligé d'enrôler MFA avant son premier accès au tableau de bord admin (politique J1 héritée de la feature 002a).

**Pourquoi cette priorité** : pas critique pour la mise en ligne publique du produit, mais bloque l'opération de la plateforme dès que plus d'une personne est dans l'équipe. Le « bootstrap » du tout premier admin est un événement unique.

**Test indépendant** : (a) exécuter la commande de bootstrap CLI sur une base vide, vérifier qu'un admin est créé en base ; (b) depuis une session admin, créer un second admin via la console interne et vérifier qu'il reçoit son courriel d'invitation.

**Scénarios d'acceptation** :

1. **Étant donné** une base de données sans aucun admin existant, **quand** un opérateur infrastructure exécute la commande de bootstrap d'admin (avec un courriel et un mot de passe initial fournis par une source sécurisée — variable d'env, prompt local), **alors** un compte admin est créé avec `role = admin`, `emailVerifiedAt = NOW` (bootstrap = email considéré pré-vérifié), `mfaEnrolledAt = null` (force `/admin/mfa/enroll` au premier login), et un événement d'audit `admin_bootstrap` est enregistré avec une mention explicite « pas d'acteur — bootstrap initial ».
2. **Étant donné** un admin authentifié et MFA actif sur la console interne `/admin/utilisateurs/nouveau`, **quand** il crée un nouvel admin en saisissant le courriel cible, **alors** un nouveau compte admin est créé avec un mot de passe temporaire d'usage unique, un courriel d'invitation est envoyé au nouvel admin (lien d'activation avec choix de mot de passe + obligation MFA J1 héritée), et un événement d'audit `admin_created_by_admin` est enregistré (avec acteur identifié).
3. **Étant donné** une base de données sans aucun admin existant, **quand** la commande de bootstrap est exécutée, **alors** l'admin est créé avec `mfaEnrolledAt = null` et l'audit enregistre `admin_bootstrap` ; au tout premier login, le système redirige obligatoirement vers `/admin/mfa/enroll` (héritage US5 de 002a — politique J1 unifiée pour TOUS les admins, y compris le bootstrap initial). Aucun chemin alternatif d'enrôlement MFA n'est exposé par la CLI ; la fenêtre de non-MFA est strictement bornée à l'intervalle « création CLI → première connexion » sur un déploiement encore non-public.

---

### Cas limites

- **Inscription avec un courriel non confirmé qui tente de re-s'inscrire** : le système ne crée pas un doublon. Il renvoie un nouveau courriel de vérification au même compte non vérifié (avec rate limit) et un message générique sans révéler l'existence préalable.
- **Connexion avec un compte « banni » ou supprimé** : le compte est traité comme inexistant côté login. Aucun message ne révèle l'état banni. Audit `login_failed_account_disabled`.
- **Lien de réinitialisation utilisé en navigation privée puis fermé sans avoir soumis le nouveau mot de passe** : le lien reste actif (one-shot consommé seulement à la soumission). Expire selon le TTL.
- **Tentative de réinitialisation pendant un verrouillage de compte** : la demande de reset par lien email est autorisée (elle ne révèle pas le verrouillage) ; la soumission effective du nouveau mot de passe réinitialise le compteur de verrouillage et l'événement d'audit l'indique.
- **Conseiller `verified` qui révoque sa propre conformité** (feature 001) : la session reste ouverte mais le middleware MFA peut désactiver les gardes d'accès aux leads. Hors scope de cette feature, mais à valider en revue avec 001 que la cascade de statut ne casse pas la session active.
- **Admin qui tente de se créer lui-même** (auto-création) : interdit côté endpoint console (héritage US4 de 002a — `SELF_ACTION_FORBIDDEN`).
- **Renvoi d'un courriel de vérification à un compte déjà vérifié** : le système répond OK mais n'envoie rien.
- **Mot de passe contenant le courriel ou le prénom de l'utilisateur** : refusé par la politique de complexité, message d'erreur clair.

---

## Exigences fonctionnelles *(obligatoire)*

### Compte et inscription

- **FR-001** : Le système DOIT permettre à un visiteur anonyme de créer un compte conseiller en fournissant un courriel, un mot de passe conforme à la politique de complexité, un prénom, un nom, et une acceptation explicite des CGU + politique Loi 25 (feature 004).
- **FR-002** : Le système DOIT refuser silencieusement (réponse identique au cas succès) une inscription dont le courriel correspond à un compte existant — protection anti-énumération.
- **FR-003** : Le système DOIT appliquer une politique de mot de passe avec un minimum de 12 caractères, présence d'au moins un caractère minuscule + majuscule + chiffre + symbole, et refus si le mot de passe contient le courriel ou le prénom.
- **FR-004** : Le système DOIT hacher tout mot de passe en stockage par un algorithme adaptatif moderne reconnu (bcrypt, Argon2id ou équivalent), avec un facteur de coût aligné avec le matériel cible (cible : > 250 ms par hash).
- **FR-005** : Le système DOIT créer le compte avec un statut « email non vérifié » et envoyer un courriel de vérification contenant un lien à usage unique valide 24 heures.
- **FR-006** : Le système DOIT empêcher tout accès aux fonctionnalités authentifiées tant que l'email n'est pas vérifié, sauf la fonction « renvoyer un courriel de vérification ».

### Connexion

- **FR-007** : Le système DOIT authentifier un utilisateur par courriel + mot de passe.
- **FR-008** : Le système DOIT retourner un message d'erreur identique pour les cas « courriel inexistant » et « mauvais mot de passe » — protection anti-énumération.
- **FR-009** : Le système DOIT verrouiller selon un double bucket :
  - **Bucket par compte** : 5 échecs de connexion dans une fenêtre glissante de 15 minutes → verrouillage du compte 15 minutes (alignement avec la policy MFA verify de la feature 002a — cohérence opérationnelle pour le support).
  - **Bucket par IP** : 20 échecs de connexion dans une fenêtre glissante de 1 heure depuis la même IP source → blocage de toutes les nouvelles tentatives depuis cette IP pendant 1 heure (double rempart contre credential stuffing distribué qui cycle entre comptes connus pour contourner un lockout strictement par-compte).
  - Les deux buckets s'évaluent indépendamment ; un échec incrémente les deux. Le déclenchement de l'un ou l'autre suffit à refuser la tentative.
  - Un événement d'audit `login_locked` est enregistré au moment du verrouillage, avec la métadonnée indiquant lequel des deux buckets a déclenché (account ou ip ou both).
- **FR-010** : Le système DOIT, après une connexion réussie d'un conseiller statut « vérifié » sans MFA actif, rediriger vers l'enrôlement MFA avant tout autre accès (héritage feature 002a).
- **FR-011** : Le système DOIT, après une connexion réussie d'un admin sans MFA actif, rediriger vers l'enrôlement MFA admin J1 (héritage feature 002a).
- **FR-012** : Le système DOIT, après une connexion réussie d'un utilisateur avec MFA actif, exiger la saisie d'un code TOTP valide avant d'ouvrir la session complète (héritage feature 002a).
- **FR-013** : Le système DOIT enregistrer un événement d'audit immuable pour chaque tentative de connexion (réussie ou échouée), avec horodatage, identifiant utilisateur si connu, IP abrégée, et raison d'échec normalisée.
- **FR-013a** : Le système DOIT établir une session d'une durée de **30 jours glissants** à la connexion réussie (le délai d'expiration est repoussé à chaque requête authentifiée portant un cookie de session valide). Le step-up MFA exigé toutes les 30 minutes pour les actions sensibles (héritage feature 002a) reste le rempart de sécurité sur les opérations critiques.
- **FR-013b** : Le système DOIT, en cas d'inactivité dépassant 30 jours, considérer la session expirée et la traiter comme inexistante côté serveur (refus de toute requête authentifiée, redirection vers `/connexion`).

### Vérification de courriel

- **FR-014** : Le système DOIT envoyer un lien de vérification de courriel à usage unique d'une durée de validité de 24 heures.
- **FR-015** : Le système DOIT permettre à l'utilisateur de demander un renvoi du courriel de vérification, avec une limite de 3 renvois maximum par heure et par compte.
- **FR-016** : Le système DOIT marquer un lien comme consommé dès sa première utilisation valide, empêchant tout rejeu.

### Réinitialisation de mot de passe

- **FR-017** : Le système DOIT permettre à un utilisateur d'initier une réinitialisation de mot de passe par courriel depuis la page de connexion.
- **FR-018** : Le système DOIT retourner le même message générique que le courriel existe ou non — protection anti-énumération.
- **FR-019** : Le système DOIT envoyer un lien de réinitialisation à usage unique d'une durée de validité de **1 heure** (alignement défaut OWASP — cf. US5 scénario 1).
- **FR-020** : Le système DOIT, à la consommation d'un lien de réinitialisation valide, mettre à jour le hash du mot de passe et invalider toutes les sessions de cet utilisateur (sauf celle qui vient d'effectuer le reset).
- **FR-021** : Le système DOIT envoyer un courriel de confirmation à l'utilisateur après tout changement effectif de mot de passe (par reset ou par changement authentifié), avec une formulation FR-CA qui invite à signaler une activité suspecte.
- **FR-022** : Le système DOIT limiter à 3 le nombre de liens de réinitialisation actifs simultanément pour un même compte ; au-delà, ignorer silencieusement les nouvelles demandes.

### Changement de mot de passe authentifié

- **FR-023** : Le système DOIT permettre à un utilisateur authentifié de changer son mot de passe en fournissant son mot de passe actuel et un nouveau mot de passe (saisi deux fois).
- **FR-024** : Le système DOIT, si l'utilisateur a MFA actif, exiger une élévation de session (re-MFA) avant d'accepter le changement (héritage feature 002a).
- **FR-025** : Le système DOIT, après un changement de mot de passe authentifié réussi, invalider toutes les autres sessions du même utilisateur (sauf la session courante).
- **FR-026** : Le système DOIT refuser un nouveau mot de passe identique au précédent.

### Déconnexion

- **FR-027** : Le système DOIT permettre à un utilisateur authentifié de fermer la session courante uniquement, sans toucher aux autres sessions du même utilisateur sur d'autres appareils.
- **FR-028** : Le système DOIT, à la déconnexion, invalider immédiatement la session côté serveur et effacer le cookie de session côté client.

### Création d'admin

- **FR-029** : Le système DOIT fournir un mécanisme de provisionnement du premier admin via une commande d'infrastructure exécutée par un opérateur autorisé (CLI ou script).
- **FR-030** : Le système DOIT permettre à un admin authentifié d'inviter un nouvel admin depuis une console interne, en fournissant un courriel ; le nouvel admin reçoit un courriel d'invitation avec un lien d'activation permettant de choisir son mot de passe initial.
- **FR-031** : Le système DOIT exiger que tout admin nouvellement créé enrôle MFA avant son premier accès au tableau de bord admin (héritage US5 de 002a).
- **FR-032** : Le système DOIT enregistrer un événement d'audit immuable pour toute création d'admin, en distinguant `admin_bootstrap` (premier admin, pas d'acteur) de `admin_created_by_admin` (acteur identifié).

### Audit et journalisation

- **FR-033** : Le système DOIT enregistrer chaque événement de sécurité (`signup`, `email_verified`, `login_success`, `login_failed`, `login_locked`, `logout`, `password_reset_requested`, `password_reset_completed`, `password_changed_self`, `password_change_failed`, `admin_bootstrap`, `admin_created_by_admin`) dans un journal immuable (rejette UPDATE, DELETE, TRUNCATE — héritage pattern features 001 et 002a).
- **FR-034** : Le système DOIT abréger toute adresse IP enregistrée pour les besoins d'audit conformément à ADR-0008 (IPv4 /24, IPv6 /48) — héritage feature 002a.
- **FR-035** : Le système NE DOIT JAMAIS journaliser, transmettre ou afficher un mot de passe en clair, ni un hash de mot de passe en dehors de son emplacement de stockage.

### Vie privée et conformité

- **FR-036** : Le système DOIT stocker toutes les données personnelles (courriel, nom, prénom, hash du mot de passe, audit logs) en région canadienne, chiffrées au repos — Principe II constitution.
- **FR-037** : Le système DOIT permettre à la procédure d'effacement Loi 25 cross-module (feature 023) de cascader la suppression d'un compte vers les sessions, les codes de vérification et les liens de réinitialisation. Les journaux d'audit sont conservés 7 ans par obligation légale (arbitrage déjà acté dans la feature 001).
- **FR-038** : Le système DOIT exiger une acceptation explicite et horodatée des CGU + politique Loi 25 (feature 004) à l'inscription, et conserver l'horodatage comme preuve.

### Accessibilité

- **FR-039** : Les pages d'inscription, de connexion, de réinitialisation et de changement de mot de passe DOIVENT être navigables au clavier intégralement, avec un contraste ≥ 4.5:1 et des messages d'erreur exposés via `aria-describedby` aux lecteurs d'écran — Principe XI constitution.

---

## Entités clés *(le cas échéant)*

- **Compte utilisateur** — représente une personne dans le système. Attributs essentiels : identifiant interne, courriel, prénom, nom, rôle (`conseiller` ou `admin`), horodatage de vérification d'email, horodatage de création, statut éventuel de désactivation, référence à un compte MFA (féature 002a) le cas échéant. Sous-jacent à toute session.
- **Justificatif de mot de passe** — empreinte cryptographique non réversible du mot de passe d'un compte (algorithme adaptatif). N'est jamais transmise hors du système ni journalisée.
- **Lien de vérification de courriel** — token à usage unique, lié à un compte, expirant après 24 heures. Trace de consommation horodatée.
- **Lien de réinitialisation de mot de passe** — token à usage unique, lié à un compte, expirant selon la politique TTL (cf. FR-019). Au maximum 3 actifs simultanément par compte.
- **Compteur de verrouillage de connexion** — pour chaque compte (et éventuellement pour chaque IP, selon la politique retenue dans FR-009) : nombre d'échecs récents, horodatage du dernier échec, fenêtre de verrouillage.
- **Événement d'audit d'authentification** — entrée immuable horodatée. Attributs : type d'événement, identifiant utilisateur (si connu), IP abrégée, métadonnées contextuelles (raison d'échec, identifiant de session, etc.).

---

## Critères de succès *(obligatoire)*

### Résultats mesurables

- **SC-001** — Un visiteur peut compléter l'inscription d'un nouveau compte conseiller (depuis la page publique jusqu'à la confirmation de réception du courriel de vérification) en moins de 90 secondes en flux nominal.
- **SC-002** — Un utilisateur qui a oublié son mot de passe peut récupérer l'accès à son compte (demande du lien, réception, ouverture, choix du nouveau mot de passe, reconnexion) en moins de 5 minutes en flux nominal (hors latence de boîte de courriel).
- **SC-003** — 99 % des tentatives de connexion légitimes (mot de passe correct, compte sain) aboutissent à l'ouverture d'une session en moins de 2 secondes côté utilisateur final.
- **SC-004** — Une tentative de connexion par force brute (10 000 mots de passe candidats par minute) est efficacement empêchée par le verrouillage : moins de 0,01 % de chance qu'un mot de passe conforme à la politique soit deviné avant verrouillage.
- **SC-005** — Aucun mot de passe en clair, aucun hash de mot de passe, et aucune réponse de login ne fuite via les journaux applicatifs, les en-têtes HTTP de réponse ni les pages d'erreur (vérification axe-core de tracabilité + audit pré-merge OWASP A09).
- **SC-006** — Le taux de conversion inscription → première connexion vérifiée (email cliqué + login) atteint au moins 80 % dans les 48 heures suivant l'inscription, mesurable sur la cohorte des 30 derniers jours.
- **SC-007** — Aucun incident de sécurité de la classe « énumération de compte » n'est détectable par un attaquant externe (vérification par audit pré-merge : tester `/inscription`, `/connexion`, `/mot-de-passe-oublie`, `/api/auth/*` avec un courriel inexistant et un courriel existant → réponses indistinguables côté chronologie et corps).
- **SC-008** — Un événement d'audit d'authentification est enregistré pour 100 % des tentatives de login, signup, vérification, reset et changement de mot de passe, vérifiable par échantillonnage post-déploiement.
- **SC-009** — Le bootstrap initial d'un admin sur une base vide peut être exécuté en moins de 2 minutes par un opérateur infrastructure documenté (runbook ≤ 1 page).
- **SC-010** — Toutes les pages utilisateur de cette feature passent un audit axe-core sans aucune violation de la norme WCAG 2.1 AA — Principe XI bloquant en CI.

---

## Hypothèses

- Auth.js v5 + sessions DB partagée (ADR-0004) reste l'infrastructure de session ; cette feature ne réintroduit pas un système d'authentification parallèle.
- Le hashing de mot de passe utilisera la même approche que les codes de récupération MFA de la feature 002a (bcrypt à un coût aligné `>= 250 ms` par opération côté machine cible production).
- Le sender de courriel transactionnel reste un *stub* d'outbox pour cette feature (cohérent avec 002a) ; la vraie livraison via SES sera branchée par la feature 003 (notifications). Les courriels de vérification, de reset et de confirmation atterrissent dans la table d'outbox déjà posée et seront drainés par 003.
- Le helper d'IP abrégée (`actor-ip.util.ts`) livré par 002a est réutilisé tel quel.
- Le rate limiting bucket Postgres (`mfa_rate_limit_buckets`) livré par 002a est réutilisé pour tous les buckets de cette feature (signup, login, reset, renvoi de vérification), avec de nouveaux types de bucket (`signup`, `login`, `password_reset`, `email_verification_resend`).
- La politique de complexité du mot de passe (12 caractères + classes mixtes) suit l'esprit du NIST SP 800-63B révisé tout en restant compatible avec une UX FR-CA expliquant clairement les règles.
- L'invitation d'admin (FR-030) réutilise le mécanisme de lien à usage unique (équivalent reset), avec un TTL distinct potentiellement plus long (72 h) pour absorber les délais de coordination interne — réglable au plan.
- Toutes les pages publiques de cette feature (`/inscription`, `/connexion`, `/mot-de-passe-oublie`, `/verifier-email`) sont rendues côté serveur mais marquées `noindex` — Principe XII (SEO) reste neutre.
- Cette feature ne traite **pas** le voyageur ; le voyageur reste anonyme et le magic-link sera livré par la feature 010 (intake).

---

## Dépendances

- **Bloque** : feature 005 (profil conseiller), feature 006 (facturation onboarding Stripe), feature 007 (facturation récurrence), tout dashboard authentifié des Tiers 1+.
- **Dépend de** : feature 001 (le statut conformité d'un conseiller est consommé par les redirections post-login pour décider de la prochaine étape), feature 002a (AuthGuard + RoleGuard + StepUpGuard + helper IP + outbox + audit immuable + bucket de rate limit), feature 004 (texte des CGU + politique Loi 25 à accepter au signup).
- **Co-livraison utile mais non bloquante** : feature 003 (sender SES réel ; le stub d'outbox fonctionne sans), feature 023 (effacement Loi 25 ; cette feature crée les tables que 023 viendra cascader).

---

## Hors scope explicite

- OAuth tiers (Google, Microsoft, Apple) — différé Tier 5.
- Magic-link voyageur — feature 010 (intake).
- Passkey / WebAuthn d'enrôlement — différé Tier 5 (la garde côté guard est déjà en place mais l'enrôlement utilisateur passkey est différé).
- Multi-tenancy / organisations / SSO entreprise — hors V1.
- Federated identity (login social) — hors V1.
- Suppression auto-service du compte par l'utilisateur — feature 023 (effacement Loi 25 cross-module).
- Vrai sender de courriel SES — feature 003.
- Instrumentation de métriques Prometheus / OTel (signup conversion, login success rate, lockout rate, password reset rate) — feature 021 (observabilité centrale). Les événements d'audit immuables de FR-033 sont la source de vérité dérivée par 021.

---

## Mise à jour de la roadmap après merge

Après merge de cette feature, le tableau Tier 0 de `docs/roadmap.md` doit être mis à jour : ligne `002` passe de ⏳ à ✅ mergé, et la note « stub `PasswordVerifier` à remplacer quand 002 livre » de la ligne `002a` doit être barrée comme résolue.
