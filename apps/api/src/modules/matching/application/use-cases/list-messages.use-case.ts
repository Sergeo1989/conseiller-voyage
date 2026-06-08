// T013 [US1] [TDD GREEN] — Liste paginée des messages d'un fil (ordre
// chronologique). Autorisation membre (cloisonnement FR-006).

import type { ConversationParticipant } from '@cv/shared/matching';
import { Conversation } from '../../domain/entities/conversation.entity';
import type { ConversationRepo, MessageRecord } from '../ports';

export interface ListMessagesDeps {
  readonly repo: ConversationRepo;
}

export interface ListMessagesInput {
  readonly conversationId: string;
  readonly requester: ConversationParticipant;
  readonly requesterRef: string;
  readonly page: number;
  readonly pageSize: number;
}

export type ListMessagesResult =
  | {
      readonly kind: 'ok';
      readonly items: ReadonlyArray<MessageRecord>;
      readonly total: number;
    }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'forbidden_not_member' };

export class ListConversationMessagesUseCase {
  constructor(private readonly deps: ListMessagesDeps) {}

  async execute(input: ListMessagesInput): Promise<ListMessagesResult> {
    const rec = await this.deps.repo.findById(input.conversationId);
    if (!rec) return { kind: 'not_found' };

    const conversation = Conversation.fromProps(rec);
    if (!conversation.isMember(input.requester, input.requesterRef)) {
      return { kind: 'forbidden_not_member' };
    }

    const page = await this.deps.repo.listMessages(
      input.conversationId,
      input.page,
      input.pageSize,
    );
    return { kind: 'ok', items: page.items, total: page.total };
  }
}
