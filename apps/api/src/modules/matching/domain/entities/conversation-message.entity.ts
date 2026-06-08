// T006 — Entité ConversationMessage (domaine). Représentation immuable d'un
// message ; la validation du corps vit dans `conversation-policy` (validateMessage).

import type { ConversationParticipant } from '@cv/shared/matching';

export interface ConversationMessageProps {
  readonly id: string;
  readonly conversationId: string;
  readonly author: ConversationParticipant;
  readonly body: string | null; // null après anonymisation Loi 25
  readonly createdAt: Date;
}

export class ConversationMessage {
  private constructor(private readonly props: ConversationMessageProps) {}

  static fromProps(props: ConversationMessageProps): ConversationMessage {
    return new ConversationMessage(props);
  }

  get id(): string {
    return this.props.id;
  }

  get author(): ConversationParticipant {
    return this.props.author;
  }

  get body(): string | null {
    return this.props.body;
  }
}
