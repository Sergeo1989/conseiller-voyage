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

export interface DossierRefusedEmailProps {
  readonly locale?: 'fr-CA' | 'en';
  readonly submittedAt: string;
  readonly reason: string;
  readonly ctaUrl: string;
}

const COPY = {
  'fr-CA': {
    preview: 'Votre dossier de conformité requiert des corrections.',
    heading: 'Corrections requises',
    body: (submittedAt: string) =>
      `Votre dossier de conformité soumis le ${submittedAt} ne peut être validé en l'état.`,
    reasonLabel: "Motif communiqué par l'administrateur :",
    cta: 'Soumettre un dossier corrigé',
    footer: 'Conseiller Voyage — toutes vos données sont hébergées au Canada (Loi 25).',
  },
  en: {
    preview: 'Your compliance file requires corrections.',
    heading: 'Corrections required',
    body: (submittedAt: string) =>
      `Your compliance file submitted on ${submittedAt} cannot be validated as-is.`,
    reasonLabel: 'Reason from the administrator:',
    cta: 'Submit a corrected file',
    footer: 'Conseiller Voyage — all your data is hosted in Canada (Law 25).',
  },
} as const;

export function DossierRefusedEmail({
  locale = 'fr-CA',
  submittedAt,
  reason,
  ctaUrl,
}: DossierRefusedEmailProps): React.ReactElement {
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
          <Heading style={{ color: '#dc2626', fontSize: '24px' }}>{c.heading}</Heading>
          <Section>
            <Text style={{ color: '#1a1a1a', lineHeight: '1.6' }}>{c.body(submittedAt)}</Text>
            <Text style={{ fontWeight: 'bold', color: '#1a1a1a', marginTop: '16px' }}>
              {c.reasonLabel}
            </Text>
            <Text
              style={{
                borderLeft: '4px solid #ef4444',
                paddingLeft: '12px',
                color: '#7f1d1d',
                backgroundColor: '#fef2f2',
                padding: '8px 12px',
                borderRadius: '0 4px 4px 0',
              }}
            >
              {reason}
            </Text>
            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button
                href={ctaUrl}
                style={{
                  backgroundColor: '#2563eb',
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
