// T052 — ReactEmailRenderer.
//
// Adapte @react-email/render.renderAsync() pour EmailTemplateRenderer.
// Le catalogue est construit à l'initialisation du module — si un templateId
// inconnu est demandé, TemplateRenderingError est levée (non-retry-able).
//
// Cf. research R3 — renderAsync() est non-bloquant et thread-safe.

import { Injectable } from '@nestjs/common';
import { renderAsync } from '@react-email/render';
import type { ReactElement } from 'react';
import type {
  EmailTemplateRenderer,
  RenderTemplateInput,
  RenderedTemplate,
} from '../application/ports/email-template-renderer.port';
import { TemplateRenderingError } from '../application/ports/email-template-renderer.port';

type TemplateFn = (props: Record<string, unknown>) => ReactElement;
type SubjectFn = (props: Record<string, unknown>, locale: string) => string;

interface TemplateDef {
  component: TemplateFn;
  subject: SubjectFn;
}

@Injectable()
export class ReactEmailRenderer implements EmailTemplateRenderer {
  private readonly catalogue = new Map<string, TemplateDef>();

  constructor(catalogue: ReadonlyMap<string, TemplateDef>) {
    for (const [id, def] of catalogue) {
      this.catalogue.set(id, def);
    }
  }

  exists(templateId: string): boolean {
    return this.catalogue.has(templateId);
  }

  async render(input: RenderTemplateInput): Promise<RenderedTemplate> {
    const def = this.catalogue.get(input.templateId);
    if (!def) {
      throw new TemplateRenderingError(
        input.templateId,
        new Error(`Unknown templateId: ${input.templateId}`),
      );
    }
    try {
      const element = def.component({ ...input.data, locale: input.locale });
      const [htmlBody, textBody] = await Promise.all([
        renderAsync(element, { plainText: false }),
        renderAsync(element, { plainText: true }),
      ]);
      const subject = def.subject(input.data, input.locale);
      return { subject, htmlBody, textBody };
    } catch (cause) {
      throw new TemplateRenderingError(input.templateId, cause);
    }
  }
}

export type { TemplateDef };
