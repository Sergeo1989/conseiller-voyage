// T036 [Polish] — Port ConversationMetricsRecorder (observabilité, Principe X).
// Compteurs produit du fil de conversation. Implémentation OTel + no-op par
// défaut (les use cases ne dépendent pas d'un MeterProvider en test).

export interface ConversationMetricsRecorder {
  /** Un fil ouvert (à l'acceptation d'un lead). */
  recordConversationOpened(): void;
  /** Un message envoyé (texte). */
  recordMessageSent(): void;
  /** Une pièce jointe finalisée (devis transmis). */
  recordAttachmentReady(): void;
}

export const CONVERSATION_METRICS_RECORDER = Symbol.for('ConversationMetricsRecorder');

/** No-op — défaut sûr (tests, absence de MeterProvider). */
export const noopConversationMetricsRecorder: ConversationMetricsRecorder = {
  recordConversationOpened() {},
  recordMessageSent() {},
  recordAttachmentReady() {},
};
