# Contrat — Port public `ConversationQueryPort` (lecture)

Exposé par le module `matching` via `@cv/shared/matching`, consommé par **014** (dashboard
conseiller) et **015** (espace voyageur). Lecture seule — n'envoie pas de message, ne
déclenche aucune transition. Token DI : `Symbol.for('ConversationQueryPort')`.

## Vues (sans PII superflue ; aucun champ transactionnel)

```ts
export type ConversationParticipant = 'CONSEILLER' | 'VOYAGEUR';

export interface AttachmentView {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly available: boolean;   // false si supprimée (Loi 25) ou upload non finalisé
  // PAS d'URL ici : l'URL signée est obtenue via un endpoint dédié (durée limitée)
}

export interface MessageView {
  readonly id: string;
  readonly author: ConversationParticipant;
  readonly body: string | null;          // null si anonymisé (Loi 25)
  readonly createdAt: Date;
  readonly attachments: ReadonlyArray<AttachmentView>;
}

export interface ConversationView {
  readonly id: string;
  readonly leadId: string;
  readonly conseillerId: string;
  readonly briefId: string | null;       // null si brief anonymisé
  readonly writable: boolean;            // dérivé : canWrite(leadState, conseillerVerifie)
  readonly openedAt: Date;
  readonly lastMessageAt: Date | null;
}

export interface ConversationMessagesPage {
  readonly conversation: ConversationView;
  readonly items: ReadonlyArray<MessageView>;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}
```

## Opérations (lecture)

| Méthode | Rôle | Autorisation |
|---|---|---|
| `listForConseiller(conseillerId, paging)` | fils d'un conseiller | conseiller = propriétaire |
| `listForVoyageur(voyageurRef, paging)` | fils d'un voyageur (tous ses conseillers) | voyageur = membre |
| `getMessages(conversationId, requester, paging)` | page de messages d'un fil | requester membre du fil |

**Invariants** : `requester` doit être membre du fil (sinon erreur d'autorisation, pas de
fuite). `writable` est calculé à la lecture (état lead via `MatchingLeadQueryPort` + vérifié).
Aucune méthode n'expose de montant/paiement.
