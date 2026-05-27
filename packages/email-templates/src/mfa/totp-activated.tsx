import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type * as React from 'react';

export interface TotpActivatedEmailProps {
  readonly locale?: 'fr-CA' | 'en';
  readonly activatedAt: string;
}

const COPY = {
  'fr-CA': {
    preview: "L'authentification à deux facteurs est maintenant activée sur votre compte.",
    heading: 'Authentification à deux facteurs activée',
    body: (activatedAt: string) =>
      `L'authentification TOTP (code à usage unique via application d'authentification) a été activée sur votre compte Conseiller Voyage le ${activatedAt}.`,
    nextSteps:
      'Lors de votre prochaine connexion, un code à 6 chiffres vous sera demandé en plus de votre mot de passe.',
    securityNote:
      "Si vous n'avez pas initié cette action, contactez le support immédiatement pour sécuriser votre compte.",
    footer: 'Conseiller Voyage — toutes vos données sont hébergées au Canada (Loi 25).',
  },
  en: {
    preview: 'Two-factor authentication is now enabled on your account.',
    heading: 'Two-factor authentication enabled',
    body: (activatedAt: string) =>
      `TOTP authentication (one-time code via authenticator app) has been enabled on your Conseiller Voyage account on ${activatedAt}.`,
    nextSteps: 'On your next login, a 6-digit code will be required in addition to your password.',
    securityNote:
      'If you did not initiate this action, contact support immediately to secure your account.',
    footer: 'Conseiller Voyage — all your data is hosted in Canada (Law 25).',
  },
} as const;

export function TotpActivatedEmail({
  locale = 'fr-CA',
  activatedAt,
}: TotpActivatedEmailProps): React.ReactElement {
  const c = COPY[locale] ?? COPY['fr-CA'];
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{c.preview}</Preview>
      <Body
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          backgroundColor: '#f9fafb',
        }}
      >
        <Container
          style={{
            maxWidth: '600px',
            margin: '0 auto',
            padding: '24px',
            backgroundColor: '#ffffff',
            borderRadius: '8px',
          }}
        >
          <Heading style={{ color: '#16a34a', fontSize: '24px' }}>{c.heading}</Heading>
          <Section>
            <Text style={{ color: '#1a1a1a', lineHeight: '1.6' }}>{c.body(activatedAt)}</Text>
            <Text style={{ color: '#374151', lineHeight: '1.6' }}>{c.nextSteps}</Text>
            <Text
              style={{
                color: '#92400e',
                backgroundColor: '#fffbeb',
                border: '1px solid #fcd34d',
                padding: '12px',
                borderRadius: '6px',
                marginTop: '16px',
              }}
            >
              {c.securityNote}
            </Text>
          </Section>
          <Hr style={{ borderColor: '#e5e7eb', marginTop: '32px' }} />
          <Text style={{ color: '#6b7280', fontSize: '12px' }}>{c.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
