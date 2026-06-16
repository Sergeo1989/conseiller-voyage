# Contracts — Ports (017 / roadmap 010)

## Port PUBLIC `VoyageurMatchNotifier` (exposé par intake, appelé par matching)

Surface inter-module (Principe V) : vit dans `@cv/shared/intake`. Matching le consomme après
avoir traité (et dédupliqué) un événement de matching.

```
onBriefOutcome(input: {
  briefId: string;
  outcome: 'matched' | 'partially_matched' | 'unmatched';
  conseillerIds: string[];          // IDs techniques uniquement (pas de PII)
  idempotencyKey: string;           // = clé de l'événement source (anti-doublon)
}): Promise<void>
```

- **Idempotent** : un même `idempotencyKey` n'enqueue jamais 2 notifications.
- **Anti-spam** (FR-014) : pas d'enqueue si l'issue est identique à la dernière notifiée du brief.
- **Best-effort / non bloquant** : ne throw jamais côté appelant matching (un échec d'enqueue
  ne doit pas casser le traitement de matching). Le filet = le drain outbox + l'idempotence.

## Port `ConseillerPublicDisplayReader` (lu par le mailer intake)

Résout les infos **publiques non-contact** des conseillers appariés, au moment de l'envoi.
Vit dans `@cv/shared/profil-public` (surface publique 007).

```
getPublicDisplay(conseillerIds: string[]): Promise<Array<{
  conseillerId: string;
  prenom: string;
  specialites: string[];
}>>
// Retourne UNIQUEMENT les conseillers publics + vérifiés (re-check au send, FR-009/015).
// Jamais de courriel/téléphone/adresse. Un conseiller non public est omis.
```

## Port interne `VoyageurNotificationOutbox` (intake)

Mirroir de `LeadNotificationOutbox` (012).

```
enqueue(entry): Promise<void>                 // idempotent par idempotencyKey
scanPending(limit): Promise<Notification[]>
markSent(id): Promise<void>
markFailed(id, error): Promise<void>
cancelPendingForBrief(briefId): Promise<void> // Loi 25 (FR-010)
```

## Mailer `VoyageurNotificationMailer` (intake)

Au send : résout prénom/spécialité (`ConseillerPublicDisplayReader`), génère un magic-link de
suivi (`view_brief_status`, 008), rend le template react-email FR-CA/EN, envoie via SES
ca-central-1 (003). **Re-vérifie** que le brief n'est pas anonymisé (sinon skip). **Jamais** de
coordonnée de contact ni de montant dans le rendu (invariant anti-marketplace).

## Modes dégradés (Principe X)

| Panne | Comportement |
|---|---|
| SES HS | Worker re-throw → backoff BullMQ ; outbox reste `en_attente`, réessayée ; jamais bloquant |
| Bus matching lossy (event manqué) | la réconciliation de leads (012) existe ; la notification voyageur suit le re-traitement |
| Brief anonymisé entre enqueue et send | mailer skip + outbox `annulee` (FR-010) |
| Conseiller redevenu non public | omis du courriel (re-check `getPublicDisplay`) |
| Lien de suivi expiré (côté voyageur) | renvoi via ResendMagicLink (US3) |
