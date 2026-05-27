import {
  Body,
  Button,
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

export interface ExpirationReminderEmailProps {
  readonly locale?: 'fr-CA' | 'en';
  readonly expiresAt: string;
  readonly daysRemaining: 60 | 30 | 7;
  readonly ctaUrl: string;
}

const COPY = {
  'fr-CA': {
    preview: (days: number) => `Votre certificat expire dans ${days} jours.`,
    heading: (days: number) =>
      days === 7
        ? 'URGENT : votre certificat expire bientôt'
        : `Rappel : votre certificat expire dans ${days} jours`,
    body: (days: number, expiresAt: string) => {
      if (days === 60)
        return `Votre certificat de conformité expire le ${expiresAt}, dans 60 jours. Vous pouvez dès maintenant soumettre votre renouvellement.`;
      if (days === 30)
        return `Votre certificat expire le ${expiresAt}, dans 30 jours. Pensez à initier votre renouvellement.`;
      return `ATTENTION : votre certificat expire le ${expiresAt}, dans 7 jours seulement. Sans renouvellement, votre statut bascule en suspendu.`;
    },
    urgentBanner: 'Action requise sous 7 jours',
    cta: 'Soumettre mon renouvellement',
    footer: 'Conseiller Voyage — toutes vos données sont hébergées au Canada (Loi 25).',
  },
  en: {
    preview: (days: number) => `Your certificate expires in ${days} days.`,
    heading: (days: number) =>
      days === 7
        ? 'URGENT: your certificate is expiring soon'
        : `Reminder: your certificate expires in ${days} days`,
    body: (days: number, expiresAt: string) => {
      if (days === 60)
        return `Your compliance certificate expires on ${expiresAt}, in 60 days. You can submit your renewal now.`;
      if (days === 30)
        return `Your certificate expires on ${expiresAt}, in 30 days. Please initiate your renewal soon.`;
      return `ATTENTION: your certificate expires on ${expiresAt}, in 7 days only. Without renewal, your status will switch to suspended.`;
    },
    urgentBanner: 'Action required within 7 days',
    cta: 'Submit my renewal',
    footer: 'Conseiller Voyage — all your data is hosted in Canada (Law 25).',
  },
} as const;

export function ExpirationReminderEmail({
  locale = 'fr-CA',
  expiresAt,
  daysRemaining,
  ctaUrl,
}: ExpirationReminderEmailProps): React.ReactElement {
  const c = COPY[locale] ?? COPY['fr-CA'];
  const isUrgent = daysRemaining === 7;
  const accentColor = isUrgent ? '#dc2626' : '#2563eb';
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{c.preview(daysRemaining)}</Preview>
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
          {isUrgent && (
            <Section
              style={{
                backgroundColor: accentColor,
                borderRadius: '4px',
                padding: '8px 16px',
                marginBottom: '16px',
              }}
            >
              <Text style={{ color: '#ffffff', fontWeight: 'bold', margin: '0' }}>
                {c.urgentBanner}
              </Text>
            </Section>
          )}
          <Heading style={{ color: accentColor, fontSize: '24px' }}>
            {c.heading(daysRemaining)}
          </Heading>
          <Section>
            <Text style={{ color: '#1a1a1a', lineHeight: '1.6' }}>
              {c.body(daysRemaining, expiresAt)}
            </Text>
            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button
                href={ctaUrl}
                style={{
                  backgroundColor: accentColor,
                  color: '#ffffff',
                  padding: '12px 24px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: 'bold',
                }}
              >
                {c.cta}
              </Button>
            </Section>
          </Section>
          <Hr style={{ borderColor: '#e5e7eb' }} />
          <Text style={{ color: '#6b7280', fontSize: '12px' }}>{c.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
