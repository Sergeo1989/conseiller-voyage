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

export interface DossierSubmittedEmailProps {
  readonly locale?: 'fr-CA' | 'en';
  readonly submittedAt: string;
}

const COPY = {
  'fr-CA': {
    preview: 'Votre dossier de conformité a bien été soumis.',
    heading: 'Dossier reçu',
    body: (submittedAt: string) =>
      `Votre dossier de conformité soumis le ${submittedAt} a bien été reçu par notre équipe. Nous procéderons à sa vérification dans les meilleurs délais et vous informerons de la décision par courriel.`,
    nextSteps: 'Prochaines étapes :',
    step1: 'Notre équipe vérifiera vos documents.',
    step2: "Vous recevrez un courriel de confirmation d'approbation ou de demande de corrections.",
    step3: "En cas d'approbation, votre profil deviendra visible aux voyageurs.",
    footer: 'Conseiller Voyage — toutes vos données sont hébergées au Canada (Loi 25).',
  },
  en: {
    preview: 'Your compliance file has been successfully submitted.',
    heading: 'File received',
    body: (submittedAt: string) =>
      `Your compliance file submitted on ${submittedAt} has been received by our team. We will review it as soon as possible and notify you of our decision by email.`,
    nextSteps: 'Next steps:',
    step1: 'Our team will review your documents.',
    step2: 'You will receive an approval confirmation or a request for corrections by email.',
    step3: 'Upon approval, your profile will become visible to travelers.',
    footer: 'Conseiller Voyage — all your data is hosted in Canada (Law 25).',
  },
} as const;

export function DossierSubmittedEmail({
  locale = 'fr-CA',
  submittedAt,
}: DossierSubmittedEmailProps): React.ReactElement {
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
          <Heading style={{ color: '#2563eb', fontSize: '24px' }}>{c.heading}</Heading>
          <Section>
            <Text style={{ color: '#1a1a1a', lineHeight: '1.6' }}>{c.body(submittedAt)}</Text>
            <Text style={{ fontWeight: 'bold', color: '#1a1a1a', marginTop: '24px' }}>
              {c.nextSteps}
            </Text>
            <Text style={{ color: '#374151', margin: '4px 0' }}>1. {c.step1}</Text>
            <Text style={{ color: '#374151', margin: '4px 0' }}>2. {c.step2}</Text>
            <Text style={{ color: '#374151', margin: '4px 0' }}>3. {c.step3}</Text>
          </Section>
          <Hr style={{ borderColor: '#e5e7eb', marginTop: '32px' }} />
          <Text style={{ color: '#6b7280', fontSize: '12px' }}>{c.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
