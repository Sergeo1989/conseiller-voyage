# Research — Tableau de bord conseiller (014)

Décisions techniques. Format : Décision · Rationale · Alternatives rejetées.

## R1 — Source des données : endpoints HTTP conseiller existants

**Décision** : le front consomme les **endpoints HTTP conseiller déjà livrés** via
`apiClient` (session cookie + Idempotency-Key auto).
- Leads (012, `api/matching/conseiller`) : `GET leads`, `GET leads/:id`,
  `POST leads/:id/{accept,refuse,quote-sent,booking-confirmed,lost}` — **complet**.
- Conversation (013, `api/matching/conseiller/conversations`) : `GET :id/messages`,
  `POST :id/messages`, `POST :id/attachments`, `POST .../finalize`, `GET .../url` — **complet**
  sauf la **liste des fils**.

**Rationale** : zéro duplication de logique ; les ports/use cases sont la source de vérité ;
le dashboard reste une couche de présentation (VIII.a routing mince).

**Alternatives rejetées** : appels Prisma directs depuis le front (viole VIII.a + Principe
V) ; ré-implémenter la machine d'état/scoring (viole Principe VI/ADR-0002).

## R2 — Seul ajout backend : `GET conversations` (liste des fils)

**Décision** : ajouter un endpoint mince `GET /api/matching/conseiller/conversations`
(pagination) qui délègue à `ConversationQueryPort.listForConseiller` (port public **déjà**
implémenté par `PrismaConversationQueryAdapter` en 013) et mappe en réponse HTTP. Garde
`AuthGuard + RoleGuard('conseiller')`.

**Rationale** : le port existe mais n'était pas exposé en HTTP ; l'exposer est du pur
interface (aucune logique nouvelle). Le détail/fil utilise déjà `GET :id/messages` (qui
renvoie `conversation` + `items` + pagination).

**Alternatives rejetées** : un nouveau use case (inutile, le port suffit) ; exposer
`ConversationQueryPort` directement au front (les ports DI ne franchissent pas le réseau).

## R3 — Stratégie de fetching : RSC initial + TanStack Query pour les mutations

**Décision** : **chargement initial en RSC** (server component appelle `apiClient` côté
serveur → HTML rapide, SC-008), puis **TanStack Query** côté client pour rafraîchir après
une action (invalidation des clés `['leads']` / `['lead', id]` / `['conversations']`).
Les **Server Actions par verbe** exécutent la mutation (POST transition / envoi) puis
`revalidatePath` ou invalidation TanStack.

**Rationale** : conforme aux *state boundaries* VIII.a (RSC + TanStack Query pour le state
serveur) ; rendu initial rapide + interactions réactives sans rechargement complet.

**Alternatives rejetées** : tout client-side fetch (LCP plus lent, pas RSC) ; tout RSC sans
TanStack (rechargements complets après chaque action, UX dégradée).

## R4 — Concurrence optimiste & conflit sur les transitions

**Décision** : les actions de transition s'appuient sur la validation **déjà** fournie par
012 : `invalid_transition` (action impossible depuis l'état) et `conflict` (état périmé).
Le front affiche un message clair (« l'état a changé, rafraîchissez ») et **réinvalide** la
query du lead pour resynchroniser. L'Idempotency-Key (exigé par 012) couvre le double-clic /
rejeu (SC-004). La passation explicite d'`expectedState` reste **optionnelle** (amélioration
future) : la machine d'état rejette déjà les transitions incohérentes.

**Rationale** : la garantie de cohérence vit dans 012 (append-only + guard optimiste DB) ;
le front se contente de surfacer le résultat. Évite de dupliquer la logique de concurrence.

**Alternatives rejetées** : verrouillage côté front (fragile) ; ETag/If-Match custom
(sur-ingénierie pour le régime de démarrage ; à reconsidérer si contention réelle mesurée).

## R5 — Réutilisation du slice `features/conversation` (013)

**Décision** : réutiliser `ConversationThread`, `MessageList`, `MessageComposer`,
`AntiTransactionNotice`, `AttachmentLink`, `sendMessageAction` (livrés par 013). Ajouter :
`ConversationList` (liste des fils), les actions `create-attachment`/`finalize-attachment`/
`get-attachment-url` (pièces jointes), et des hooks TanStack Query. La route
`(conseiller)/conversations/[id]` **monte** `ConversationThread` → **active** le test a11y
`conversation.spec.ts` (skip levé par `E2E_CONVERSATION_ROUTE`).

**Rationale** : la 013 a livré l'UI minimale précisément pour être montée ici ; éviter la
duplication ; faire passer le test a11y déjà écrit.

## R6 — Vie privée & anti-transaction au rendu

**Décision** : les vues n'affichent que ce que les ports renvoient (résumé non nominatif,
corps de message, métadonnées de pièce jointe). Un **test d'invariant** vérifie que les
types de vue / réponses consommés ne portent aucun champ transactionnel et aucune PII de
contact. Les champs neutralisés (Loi 25) sont rendus sans erreur.

**Rationale** : défense en profondeur (Principe I/II) ; cohérent avec l'invariant T038 de 013.

## R7 — Espace privé & i18n

**Décision** : pages `(conseiller)` en `noindex` (espace authentifié) ; copie FR-CA par
défaut + EN via next-intl (namespaces `leads.*`, `dashboard.*` ; `conversation.*` existant).
Pas d'objectif SEO/SSG public, mais budgets CWV respectés (RSC + pas de JS superflu).
