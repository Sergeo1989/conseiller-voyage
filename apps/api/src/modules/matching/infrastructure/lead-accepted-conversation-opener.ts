// T016 [US1] — Adaptateur ConversationOpener : ouvre (idempotent) le fil à
// l'acceptation d'un lead en déléguant à OpenConversationOnLeadAcceptedUseCase.
//
// Déclenché in-process par RecordLeadTransitionUseCase (012 n'émet pas
// d'événement bus sur les transitions de lead). voyageurRef = briefId (proxy
// MVP ; 015 formalisera l'identité voyageur). Ne lève jamais : les erreurs sont
// reloguées, l'acceptation reste valide (POST /open + sweep = filets).

import { Injectable, Logger } from '@nestjs/common';
import type { ConversationOpener, OpenConversationForLeadInput } from '../application/ports';
import type { OpenConversationOnLeadAcceptedUseCase } from '../application/use-cases/open-conversation-on-accept.use-case';

@Injectable()
export class LeadAcceptedConversationOpener implements ConversationOpener {
  private readonly logger = new Logger(LeadAcceptedConversationOpener.name);

  constructor(private readonly openConversation: OpenConversationOnLeadAcceptedUseCase) {}

  async openForAcceptedLead(input: OpenConversationForLeadInput): Promise<void> {
    try {
      const res = await this.openConversation.execute({
        leadId: input.leadId,
        conseillerId: input.conseillerId,
        briefId: input.briefId,
        voyageurRef: input.briefId,
      });
      this.logger.log(
        `Fil ${res.kind === 'opened' ? 'ouvert' : 'déjà ouvert'} pour lead ${input.leadId} (conversation ${res.conversationId})`,
      );
    } catch (e) {
      this.logger.error(
        `Échec ouverture du fil pour lead ${input.leadId} : ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
