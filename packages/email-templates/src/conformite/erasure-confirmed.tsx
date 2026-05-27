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

export interface ErasureConfirmedEmailProps {
  readonly locale?: 'fr-CA' | 'en';
  readonly erasedAt: string;
  readonly requestId: string;
}

const COPY = {
  'fr-CA': {
    preview: 'Vos données personnelles ont été effacées conformément à la Loi 25.',
    heading: "Confirmation d'effacement de vos données",
    body: (erasedAt: string) =>
      `Nous confirmons que vos données personnelles ont été effacées de la plateforme Conseiller Voyage le ${erasedAt}, conformément à votre demande et aux obligations de la Loi sur la protection des renseignements personnels dans le secteur privé (Loi 25).`,
    retentionTitle: 'Données conservées à des fins légales',
    retentionBody:
      "Conformément aux obligations légales et réglementaires applicables, certaines données anonymisées (à des fins d'audit, de conformité fiscale et de traçabilité) sont conservées pendant 7 ans. Ces données ne permettent pas de vous identifier.",
    requestIdLabel: 'Identifiant de votre demande :',
    footer:
      'Conseiller Voyage — données hébergées au Canada (Loi 25). Pour toute question relative à vos droits : privacy@conseiller-voyage.ca',
  },
  en: {
    preview: 'Your personal data has been erased in compliance with Law 25.',
    heading: 'Confirmation of personal data erasure',
    body: (erasedAt: string) =>
      `We confirm that your personal data has been erased from the Conseiller Voyage platform on ${erasedAt}, in accordance with your request and the obligations under the Act respecting the protection of personal information in the private sector (Law 25).`,
    retentionTitle: 'Data retained for legal purposes',
    retentionBody:
      'In accordance with applicable legal and regulatory obligations, certain anonymized data (for audit, tax compliance, and traceability purposes) is retained for 7 years. This data cannot be used to identify you.',
    requestIdLabel: 'Your request identifier:',
    footer:
      'Conseiller Voyage — data hosted in Canada (Law 25). For any question regarding your rights: privacy@conseiller-voyage.ca',
  },
} as const;

export function ErasureConfirmedEmail({
  locale = 'fr-CA',
  erasedAt,
  requestId,
}: ErasureConfirmedEmailProps): React.ReactElement {
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
          <Heading style={{ color: '#1a1a1a', fontSize: '24px' }}>{c.heading}</Heading>
          <Section>
            <Text style={{ color: '#1a1a1a', lineHeight: '1.6' }}>{c.body(erasedAt)}</Text>
            <Text style={{ fontWeight: 'bold', color: '#374151', marginTop: '24px' }}>
              {c.retentionTitle}
            </Text>
            <Text
              style={{
                color: '#4b5563',
                lineHeight: '1.6',
                borderLeft: '4px solid #6b7280',
                paddingLeft: '12px',
              }}
            >
              {c.retentionBody}
            </Text>
            <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0' }} />
            <Text style={{ color: '#6b7280', fontSize: '13px' }}>
              {c.requestIdLabel} <strong style={{ fontFamily: 'monospace' }}>{requestId}</strong>
            </Text>
          </Section>
          <Hr style={{ borderColor: '#e5e7eb' }} />
          <Text style={{ color: '#6b7280', fontSize: '12px' }}>{c.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
