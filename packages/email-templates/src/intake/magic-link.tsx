// T058 — Template courriel intake : magic link de vérification voyageur.
// Cf. spec.md FR-013 + FR-013a. Bilingue FR-CA / EN.

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

export interface MagicLinkEmailProps {
  readonly firstName: string;
  readonly verifyUrl: string;
  readonly locale: 'fr-CA' | 'en';
}

interface CopyBundle {
  readonly preview: string;
  readonly heading: string;
  readonly intro: string;
  readonly button: string;
  readonly validity: string;
  readonly fallback: string;
  readonly notYou: string;
  readonly footer: string;
}

const COPY_FR_CA: CopyBundle = {
  preview: 'Confirmez votre demande de voyage pour qu’un conseiller vérifié vous contacte.',
  heading: 'Bonjour {firstName} !',
  intro:
    'Pour valider votre demande de voyage et permettre à un conseiller vérifié de vous contacter, cliquez sur le bouton ci-dessous.',
  button: 'Confirmer mon courriel',
  validity: 'Ce lien est valide pendant 7 jours.',
  fallback: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
  notYou:
    'Vous n’avez pas demandé ce courriel ? Ignorez-le simplement, aucune action ne sera prise.',
  footer:
    'Conseiller Voyage — service de mise en relation avec des conseillers vérifiés CCV / TICO au Canada.',
};

const COPY_EN: CopyBundle = {
  preview: 'Confirm your travel request so a verified advisor can contact you.',
  heading: 'Hi {firstName}!',
  intro:
    'To confirm your travel request and allow a verified advisor to contact you, click the button below.',
  button: 'Verify my email',
  validity: 'This link is valid for 7 days.',
  fallback: "If the button doesn't work, copy this link into your browser:",
  notYou: "Didn't request this email? Just ignore it — no action will be taken.",
  footer: 'Conseiller Voyage — connecting Canadian travelers with CCV / TICO-verified advisors.',
};

export function MagicLinkEmail({
  firstName,
  verifyUrl,
  locale,
}: MagicLinkEmailProps): React.ReactElement {
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
            {copy.heading.replace('{firstName}', firstName)}
          </Heading>
          <Section>
            <Text style={{ color: '#333', fontSize: '16px', lineHeight: 1.5 }}>{copy.intro}</Text>
            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button
                href={verifyUrl}
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
            <Text style={{ color: '#666', fontSize: '14px' }}>{copy.validity}</Text>
            <Text style={{ color: '#666', fontSize: '14px' }}>
              {copy.fallback}
              <br />
              <Link href={verifyUrl} style={{ color: '#0066cc', wordBreak: 'break-all' }}>
                {verifyUrl}
              </Link>
            </Text>
            <Text style={{ color: '#888', fontSize: '13px', marginTop: '32px' }}>
              {copy.notYou}
            </Text>
          </Section>
          <Section
            style={{
              borderTop: '1px solid #e5e5e5',
              paddingTop: '16px',
              marginTop: '32px',
            }}
          >
            <Text style={{ color: '#999', fontSize: '12px' }}>{copy.footer}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
