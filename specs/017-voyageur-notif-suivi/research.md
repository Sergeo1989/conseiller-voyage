# Research — Notifications + magic-link de suivi voyageur (017 / roadmap 010)

Phase 0. Résout les inconnues techniques. Grounding codebase confirmé (012 notifications
conseiller, 003 SES, 008 magic-link, 007 profil public, ADR-0023 cascade).

## R1 — Où vit la capacité de notification voyageur ? Module `intake`.

**Décision** : le module **intake** OWNE tout le cycle de la notification voyageur (entité
`VoyageurNotification` append-only, outbox, dispatcher/sender/worker, mailer SES, templates,
annulation Loi 25). Mirroir **exact** du pattern conseiller de 012
(`lead-notification.job.ts` : Dispatcher → Sender → Worker + `LeadNotificationOutbox` +
`SesLeadNotificationMailer`), transposé côté voyageur.

**Rationale** : la notification concerne le **brief du voyageur** (domaine intake/identité,
roadmap 010) ; réutilise l'infra magic-link + récap de 008 (même module). **Alternatives
rejetées** : la mettre dans `matching` (couplerait la notification voyageur au module
scoring) ; un module notifications transverse (sur-ingénierie pour Scope S).

## R2 — Déclencheur des notifications « matché / partiel / non matché » : port intake appelé par matching (pas de 2e abonné bus)

**Décision** : le consumer matching **existant** (`ConsumeMatchingEventUseCase`, déjà abonné
au bus `matching.events` et **dédupliqué** via `consumed_matching_events`) appelle, après son
traitement, un **port public exposé par intake** : `VoyageurMatchNotifier.onBriefOutcome({
briefId, outcome, conseillerIds, idempotencyKey })`. Intake enqueue alors **une**
`VoyageurNotification` (idempotente par la clé d'événement).

**Rationale** : la notification voyageur **piggyback** sur la déduplication déjà faite par
matching → **exactement une** notification par événement, **sans** dupliquer un abonné Redis +
table de dédup + sweep de réconciliation côté intake (Scope S, fiabilité réutilisée).
MatchingModule importe déjà IntakeModule (016) → couplage DI cohérent. **Alternatives
rejetées** : (a) **2e abonné bus dans intake** — plus découplé mais duplique dedup + sweep +
abonnement (lourd, lossy ADR-0026 à re-gérer) ; (b) matching qui crée la notification
lui-même — mettrait le domaine notification voyageur dans matching.

> L'**accusé d'activation** (US2) est déclenché **dans intake** (use case de vérification/
> activation 008) → enqueue directe, sans matching.

## R3 — Contenu « prêts » : prénoms + spécialités résolus au moment de l'envoi (007)

**Décision** : le déclencheur passe `conseillerIds`. Le **mailer intake**, au moment de
l'envoi (comme le mailer 012 re-résout l'email + re-vérifie `verified`), résout
**prénom + spécialité(s)** via un **port public** `ConseillerPublicDisplayReader.getPublicDisplay(
conseillerIds) → [{ prenom, specialites }]` (identité/profil 007), **filtré aux conseillers
publics+vérifiés** (clarification 2026-06-16, FR-009/015). Jamais de coordonnée de contact.

**Rationale** : fraîcheur + re-validation du statut public au send (un conseiller redevenu
non public est exclu) ; cohérent avec le pattern de re-check de 012. **Alternatives rejetées** :
passer prénom/spécialité figés dans le déclencheur (données périmées, et matching n'a pas le
prénom en snapshot — il vient de `authUser`).

## R4 — Magic-link de suivi : réutilise 008 (`view_brief_status`) + ResendMagicLink

**Décision** : le lien de suivi des courriels = un **jeton magic-link `purpose = view_brief_status`**
(008) frais, routant vers la page récap `/[locale]/(voyageur)/voyage/[token]`. Le renvoi
(US3) réutilise `ResendMagicLinkUseCase` (réponse uniforme anti-énumération). Distinct du jeton
`verify_email` à usage unique.

**Rationale** : zéro nouvelle infra magic-link ; la page récap existe (008). **Alternatives
rejetées** : un nouveau type de lien durable (réinvente 008 + ADR-0018 hash).

## R5 — Envoi : 003 SES ca-central-1 + outbox → BullMQ → SES + react-email

**Décision** : nouvelle file `intake.voyageur-notifications` ; pattern Dispatcher (scan outbox
pending → 1 job/notification, `jobId = notificationId`) → Sender (résout + mailer + mark
sent/failed) → Worker (`@Processor`, re-throw sur échec SES → backoff). Templates **react-email
FR-CA/EN** dans `@cv/email-templates` (mirror `lead-received.tsx`). Région **ca-central-1** (003).

**Rationale** : Principe X (1 job/destinataire, idempotent, mode dégradé via backoff + outbox
non drainée). **Alternatives rejetées** : envoi synchrone (bloquant, viole X).

## R6 — Loi 25 : annulation des notifications à l'effacement

**Décision** : `RequestBriefErasureUseCase` (intake, existant) — étendu pour **annuler** les
`VoyageurNotification` en attente du brief (`statut → annulée`) ; le dispatcher ignore les
annulées. Aucune notification ultérieure (un brief anonymisé n'a plus d'événement utile, et le
mailer re-vérifie l'état du brief au send). Données + envoi région CA (FR-008).

**Rationale** : même module → annulation directe (pas de trigger SQL nécessaire ; l'effacement
est déjà un use case applicatif). **Alternatives rejetées** : trigger SQL (l'annulation est une
transition applicative, pas une cascade de colonne).

## R7 — Anti-spam re-appariement & idempotence

**Décision** : idempotence par **clé d'événement source** (la même `idempotencyKey` que
matching) → un événement rejoué ne crée pas de doublon. Re-appariement (supersession 012) :
notifier sur **changement d'issue** (le déclencheur ne ré-enqueue que si l'issue diffère de la
dernière notifiée pour ce brief) — anti-spam (FR-014).

**Rationale** : FR-005/014. **Alternatives rejetées** : notifier chaque recalcul (spam).

## R8 — Observabilité

**Décision** : métriques OTel `cv.intake.voyageur_notification.*` (enqueued / sent / failed /
cancelled, labelées par type) + métrique de **ré-engagement** (ouvertures du lien de suivi /
visites récap post-notification — SC-009, via la page récap 008).

**Rationale** : Principe VII + SC-007/009.
