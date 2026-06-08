// T006 — Entité Conversation (domaine pur). Porte les invariants d'appartenance
// (cloisonnement, FR-006) et le calcul du destinataire d'une notification.

import type { ConversationParticipant } from '@cv/shared/matching';

export interface ConversationProps {
  readonly id: string;
  readonly leadId: string;
  readonly conseillerId: string;
  readonly briefId: string | null;
  readonly voyageurRef: string | null;
}

export class Conversation {
  private constructor(private readonly props: ConversationProps) {}

  static fromProps(props: ConversationProps): Conversation {
    return new Conversation(props);
  }

  get id(): string {
    return this.props.id;
  }

  get leadId(): string {
    return this.props.leadId;
  }

  get conseillerId(): string {
    return this.props.conseillerId;
  }

  /** Vrai si `ref` est bien le participant `participant` de ce fil (autorisation). */
  isMember(participant: ConversationParticipant, ref: string): boolean {
    return participant === 'conseiller'
      ? this.props.conseillerId === ref
      : this.props.voyageurRef !== null && this.props.voyageurRef === ref;
  }

  /** Destinataire d'une notification quand `sender` envoie un message. */
  recipientOf(sender: ConversationParticipant): ConversationParticipant {
    return sender === 'conseiller' ? 'voyageur' : 'conseiller';
  }
}
