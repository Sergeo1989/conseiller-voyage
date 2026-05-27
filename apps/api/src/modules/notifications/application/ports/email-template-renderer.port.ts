// T044 — Port EmailTemplateRenderer.
// Abstrait le rendu react-email — utile pour les tests (mock renderer).

import type { EmailLocale } from '../../domain/value-objects/email-locale.vo';

export interface RenderTemplateInput {
  readonly templateId: string;
  readonly locale: EmailLocale;
  readonly data: Record<string, unknown>;
}

export interface RenderedTemplate {
  /** Sujet rendu (déjà i18n'sé). */
  readonly subject: string;
  /** HTML complet avec inline CSS via react-email. */
  readonly htmlBody: string;
  /** Plain-text auto-généré. */
  readonly textBody: string;
}

export class TemplateRenderingError extends Error {
  constructor(
    public readonly templateId: string,
    public override readonly cause: unknown,
  ) {
    super(`Failed to render template ${templateId}: ${String(cause)}`);
    this.name = 'TemplateRenderingError';
  }
}

export interface EmailTemplateRenderer {
  render(input: RenderTemplateInput): Promise<RenderedTemplate>;
  /** Retourne true si le template existe (utile pour validation au build). */
  exists(templateId: string): boolean;
}

export const EMAIL_TEMPLATE_RENDERER = Symbol.for('NotificationsEmailTemplateRenderer');
