import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type * as React from 'react';

export interface RevocationEmailProps {
  readonly locale?: 'fr-CA' | 'en';
  readonly revokedAt: string;
  readonly reason: string;
  readonly resubmitUrl: string;
}

const COPY = {
  'fr-CA': {
    preview: 'Votre statut conseiller a été révoqué.',
    heading: 'Révocation de votre statut conseiller',
    body: (revokedAt: string) =>
      `Votre statut de conseiller vérifié sur Conseiller Voyage a été révoqué le ${revokedAt}. À compter de cette date, votre profil n'est plus visible aux voyageurs.`,
    reasonLabel: "Motif communiqué par l'administrateur :",
    resubmitText:
      'Si vous souhaitez contester cette décision ou fournir de nouveaux documents, vous pouvez soumettre un nouveau dossier :',
    cta: 'Soumettre un nouveau dossier',
    footer:
      'Conseiller Voyage — données hébergées au Canada (Loi 25). Pour toute question : support@conseiller-voyage.ca',
  },
  en: {
    preview: 'Your advisor status has been revoked.',
    heading: 'Revocation of your advisor status',
    body: (revokedAt: string) =>
      `Your verified advisor status on Conseiller Voyage was revoked on ${revokedAt}. From this date, your profile is no longer visible to travelers.`,
    reasonLabel: 'Reason from the administrator:',
    resubmitText:
      'If you wish to contest this decision or provide new documents, you can submit a new file:',
    cta: 'Submit a new file',
    footer:
      'Conseiller Voyage — data hosted in Canada (Law 25). For any question: support@conseiller-voyage.ca',
  },
} as const;

export function RevocationEmail({
  locale = 'fr-CA',
  revokedAt,
  reason,
  resubmitUrl,
}: RevocationEmailProps): React.ReactElement {
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
          <Section
            style={{
              backgroundColor: '#dc2626',
              borderRadius: '4px',
              padding: '8px 16px',
              marginBottom: '16px',
            }}
          >
            <Text style={{ color: '#ffffff', fontWeight: 'bold', margin: '0' }}>{c.heading}</Text>
          </Section>
          <Section>
            <Text style={{ color: '#1a1a1a', lineHeight: '1.6' }}>{c.body(revokedAt)}</Text>
            <Text style={{ fontWeight: 'bold', color: '#1a1a1a', marginTop: '16px' }}>
              {c.reasonLabel}
            </Text>
            <Text
              style={{
                borderLeft: '4px solid #dc2626',
                color: '#7f1d1d',
                backgroundColor: '#fef2f2',
                padding: '8px 12px',
                borderRadius: '0 4px 4px 0',
              }}
            >
              {reason}
            </Text>
            <Text style={{ color: '#1a1a1a', marginTop: '24px' }}>{c.resubmitText}</Text>
            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button
                href={resubmitUrl}
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
