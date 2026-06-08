// Surface publique du slice `conversation` (feature 013, UI minimale).
// Inter-slice : importer UNIQUEMENT via cet index (Principe VIII.a).

export { sendMessageAction } from './actions/send-message.action';
export { MAX_MESSAGE_LENGTH, sendMessageSchema } from './schemas/send-message.schema';
export type { SendMessageInput } from './schemas/send-message.schema';
export { AntiTransactionNotice } from './ui/AntiTransactionNotice';
export { AttachmentLink } from './ui/AttachmentLink';
export { ConversationThread } from './ui/ConversationThread';
export { MessageComposer } from './ui/MessageComposer';
export { MessageList } from './ui/MessageList';
