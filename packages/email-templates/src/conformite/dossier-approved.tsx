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

export interface DossierApprovedEmailProps {
  readonly locale?: 'fr-CA' | 'en';
  readonly submittedAt: string;
  readonly comment?: string;
  readonly ctaUrl: string;
}

const COPY = {
  'fr-CA': {
    preview: 'Votre dossier de conformité a été approuvé.',
    heading: 'Dossier approuvé',
    body: (submittedAt: string) =>
      `Votre dossier de conformité soumis le ${submittedAt} a été approuvé par notre équipe.`,
    commentLabel: "Commentaire de l'administrateur :",
    cta: 'Consulter mon espace conseiller',
    footer: 'Conseiller Voyage — toutes vos données sont hébergées au Canada (Loi 25).',
  },
  en: {
    preview: 'Your compliance file has been approved.',
    heading: 'File approved',
    body: (submittedAt: string) =>
      `Your compliance file submitted on ${submittedAt} has been approved by our team.`,
    commentLabel: 'Administrator comment:',
    cta: 'View my advisor dashboard',
    footer: 'Conseiller Voyage — all your data is hosted in Canada (Law 25).',
  },
} as const;

export function DossierApprovedEmail({
  locale = 'fr-CA',
  submittedAt,
  comment,
  ctaUrl,
}: DossierApprovedEmailProps): React.ReactElement {
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
            <Text style={{ color: '#1a1a1a', lineHeight: '1.6' }}>{c.body(submittedAt)}</Text>
            {comment && (
              <>
                <Text style={{ fontWeight: 'bold', color: '#1a1a1a' }}>{c.commentLabel}</Text>
                <Text
                  style={{
                    borderLeft: '4px solid #16a34a',
                    paddingLeft: '12px',
                    color: '#166534',
                    backgroundColor: '#f0fdf4',
                    padding: '8px 12px',
                    borderRadius: '0 4px 4px 0',
                  }}
                >
                  {comment}
                </Text>
              </>
            )}
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
