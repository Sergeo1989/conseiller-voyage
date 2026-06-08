// T017 (feature 013) — Template courriel : nouveau message dans une conversation.
// Cf. specs/014-conversation-conseiller-voyageur/contracts/notifications-and-storage.md.
//
// NON-NÉGOCIABLE (vie privée, FR-003) : le courriel NE contient JAMAIS le corps
// du message, de pièce jointe, ni de PII de contact de l'autre partie. Seulement
// « vous avez un nouveau message » + un lien vers l'espace sécurisé.
// Anti-marketplace (ADR-0002) : aucun montant ; rappel que la plateforme ne
// participe pas à la transaction. Bilingue FR-CA / EN (FR-CA par défaut).

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type * as React from 'react';

export interface ConversationNewMessageEmailProps {
  /** Destinataire — n'influence que la formulation, jamais l'identité de l'autre partie. */
  readonly recipientKind: 'conseiller' | 'voyageur';
  readonly conversationUrl: string;
  readonly locale: 'fr-CA' | 'en';
}

interface CopyBundle {
  readonly preview: string;
  readonly heading: string;
  readonly intro: string;
  readonly button: string;
  readonly noContent: string;
  readonly neutrality: string;
  readonly fallback: string;
  readonly footer: string;
}

const COPY_FR_CA: CopyBundle = {
  preview: 'Vous avez un nouveau message dans votre conversation.',
  heading: 'Nouveau message',
  intro:
    'Vous avez reçu un nouveau message dans une de vos conversations. Ouvrez votre espace sécurisé pour le consulter et y répondre.',
  button: 'Ouvrir la conversation',
  noContent:
    'Pour votre confidentialité, le contenu du message et les pièces jointes ne sont jamais transmis par courriel.',
  neutrality:
    'La plateforme ne participe pas à la transaction. Toute soumission et tout paiement se font directement entre vous et votre interlocuteur.',
  fallback: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
  footer:
    'Conseiller Voyage — service de mise en relation avec des conseillers vérifiés CCV / TICO au Canada.',
};

const COPY_EN: CopyBundle = {
  preview: 'You have a new message in your conversation.',
  heading: 'New message',
  intro:
    'You received a new message in one of your conversations. Open your secure workspace to read and reply.',
  button: 'Open the conversation',
  noContent: 'For your privacy, the message body and any attachments are never sent by email.',
  neutrality:
    'The platform does not take part in the transaction. Any quote and any payment happen directly between you and the other party.',
  fallback: "If the button doesn't work, copy this link into your browser:",
  footer: 'Conseiller Voyage — connecting Canadian travelers with CCV / TICO-verified advisors.',
};

export function ConversationNewMessageEmail({
  conversationUrl,
  locale,
}: ConversationNewMessageEmailProps): React.ReactElement {
  const copy = locale === 'en' ? COPY_EN : COPY_FR_CA;
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{copy.preview}</Preview>
      <Body
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#fafafa' }}
      >
        <Container style={{ maxWidth: '560px', padding: '32px 24px', backgroundColor: '#ffffff' }}>
          <Heading style={{ color: '#1a1a1a', fontSize: '24px', margin: '0 0 16px' }}>
            {copy.heading}
          </Heading>
          <Section>
            <Text style={{ color: '#333', fontSize: '16px', lineHeight: 1.5 }}>{copy.intro}</Text>
            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button
                href={conversationUrl}
                style={{
                  backgroundColor: '#0066cc',
                  color: '#ffffff',
                  padding: '14px 28px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: 600,
                  display: 'inline-block',
                }}
              >
                {copy.button}
              </Button>
            </Section>
            <Text style={{ color: '#888', fontSize: '13px' }}>{copy.noContent}</Text>
            <Text style={{ color: '#888', fontSize: '13px' }}>{copy.neutrality}</Text>
            <Text style={{ color: '#666', fontSize: '14px', marginTop: '16px' }}>
              {copy.fallback}
              <br />
              <Link href={conversationUrl} style={{ color: '#0066cc', wordBreak: 'break-all' }}>
                {conversationUrl}
              </Link>
            </Text>
          </Section>
          <Section
            style={{ borderTop: '1px solid #e5e5e5', paddingTop: '16px', marginTop: '32px' }}
          >
            <Text style={{ color: '#999', fontSize: '12px' }}>{copy.footer}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
