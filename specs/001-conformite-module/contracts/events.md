# Événements de domaine — Module Conformité

Le module conformité publie des événements de domaine via le port
`ConformiteEventPublisher`. Les autres modules (identité, matching, SEO,
notifications) y souscrivent.

**Transport interne** : `@nestjs/event-emitter` (in-process) pour le MVP.
Évolution possible vers une file BullMQ dédiée si le volume dépasse 1000
événements/minute ou si on doit isoler des consommateurs lents.

**Format général** : nom canonique `domain.action.tense`, payload structuré
sérialisable JSON.

---

## `conformite.status.changed`

Émis chaque fois que le statut agrégé d'un conseiller change.

```ts
interface ConformiteStatusChangedEvent {
  type: 'conformite.status.changed';
  payload: {
    conseillerId: string;
    previousStatus: 'pending' | 'verified' | 'suspended' | 'revoked';
    newStatus:     'pending' | 'verified' | 'suspended' | 'revoked';
    transitionKind: 'positive' | 'negative';   // négative = vers revoked ou suspended
    cause: 'admin_approval' | 'admin_refusal' | 'admin_revocation' | 'certificate_expiration' | 'permit_cascade' | 'renewal';
    occurredAt: string;     // ISO 8601
    correlationId: string;
  };
}
```

**Consommateurs attendus** :
- `identité` (ou `notifications`) : envoie courriel + notif in-app au conseiller.
- `matching` : invalide son cache local du conseiller ; pour `negative`, peut annuler les leads en cours non confirmés.
- `seo` : invalide son cache de pages publiques du conseiller (déréférencement).
- `analytics` : compteur de transitions, alimente le tableau de bord du module.

**Garantie de livraison** : au moins une fois. Les consommateurs DOIVENT être idempotents.

**Latence cible** : < 1 s nominal, < 10 s pire cas pour les transitions
négatives (cf. FR-022).

---

## `conformite.dossier.submitted`

Émis quand un conseiller soumet un dossier complet.

```ts
interface DossierSubmittedEvent {
  type: 'conformite.dossier.submitted';
  payload: {
    conseillerId: string;
    submissionId: string;
    certificateCount: number;
    affiliationCount: number;
    occurredAt: string;
  };
}
```

**Consommateurs** :
- `identité` : confirme au conseiller que la soumission est reçue.
- `analytics` : alimente le SLA admin (SC-001).

---

## `conformite.dossier.decided`

Émis quand un admin approuve ou refuse un dossier.

```ts
interface DossierDecidedEvent {
  type: 'conformite.dossier.decided';
  payload: {
    conseillerId: string;
    submissionId: string;
    decision: 'approved' | 'refused';
    reason?: string;                  // si refused, le motif (≥ 20 chars)
    adminId: string;
    occurredAt: string;
  };
}
```

**Consommateurs** :
- `identité` (notifications) : notifie le conseiller du résultat (FR-005, < 5 min).
- `analytics` : SLA admin.

---

## `conformite.expiration.reminder_sent`

Émis quand un rappel d'expiration est envoyé.

```ts
interface ExpirationReminderSentEvent {
  type: 'conformite.expiration.reminder_sent';
  payload: {
    conseillerId: string;
    certificatId: string;
    horizon: '60d' | '30d' | '7d';
    expiresAt: string;
    occurredAt: string;
  };
}
```

**Consommateurs** :
- `identité` (notifications) : envoie effectivement le courriel + notif.

---

## `conformite.permit.revoked`

Émis quand un admin déclare un retrait de permis d'agence.

```ts
interface PermitRevokedEvent {
  type: 'conformite.permit.revoked';
  payload: {
    permitRevocationId: string;
    agencyPermitNumber: string;
    agencyProvince: 'QC' | 'ON';
    affectedConseillerIds: string[];
    declaredByAdminId: string;
    reason: string;
    occurredAt: string;
  };
}
```

**Consommateurs** :
- `matching`, `seo` : invalidation en masse pour les conseillers affectés.
- `identité` (notifications) : notification individuelle aux conseillers affectés.
- `analytics` : compteur de cascades.

---

## `conformite.erasure.completed`

Émis quand un effacement Loi 25 est terminé (job asynchrone).

```ts
interface ErasureCompletedEvent {
  type: 'conformite.erasure.completed';
  payload: {
    conseillerId: string;       // pseudo-id, pas la vraie identité
    occurredAt: string;
    auditEntryId: string;       // référence dans le journal d'audit (conservé 7 ans)
  };
}
```

**Consommateurs** :
- `identité` : marque le compte comme effacé.
- Modules consommateurs : invalidation finale.

---

## Garanties de livraison

Pour le MVP avec `@nestjs/event-emitter` (in-process), la livraison est
synchrone dans le même processus. Tout consommateur qui lève une exception
échoue le cas d'usage publicateur — un consommateur défaillant peut donc
bloquer une action admin.

**Mitigation** :
- Chaque consommateur **DOIT** wrapper son handler dans un try/catch et
  enqueue un job BullMQ pour le traitement effectif (ex: l'envoi de
  courriel n'est pas fait dans le handler, mais déclenché par un job BullMQ
  immédiatement enqueued).
- Le handler in-process se limite à enqueue + retourne. Pas de logique
  bloquante.

À terme (post-MVP), bascule vers une file BullMQ dédiée `conformite-events`
pour découpler complètement, si le volume ou la complexité le justifie. Cela
fera l'objet d'un ADR.
