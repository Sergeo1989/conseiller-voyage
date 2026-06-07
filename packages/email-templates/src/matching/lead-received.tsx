// T002 — Template courriel matching : nouveau lead reçu par un conseiller.
// Cf. specs/012-lead-notifications-state-machine/contracts/bus-and-notifications.md §2.
//
// FR-004 NON-NÉGOCIABLE : AUCUNE coordonnée de contact direct du voyageur
// (nom complet, courriel, téléphone, adresse). Uniquement un résumé non
// sensible (destinations, période approximative, type de projet) + un lien
// vers l'espace conseiller. Bilingue FR-CA / EN (FR-CA par défaut).

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

/** Résumé NON sensible du brief — jamais de PII de contact (FR-004). */
export interface LeadBriefSummary {
  readonly destinations: ReadonlyArray<string>;
  readonly periodeApprox: string;
  readonly typeProjet: string;
}

export interface LeadReceivedEmailProps {
  readonly firstName: string;
  readonly briefSummary: LeadBriefSummary;
  readonly leadUrl: string;
  readonly locale: 'fr-CA' | 'en';
}

interface CopyBundle {
  readonly preview: string;
  readonly heading: string;
  readonly intro: string;
  readonly destinationsLabel: string;
  readonly periodeLabel: string;
  readonly typeLabel: string;
  readonly button: string;
  readonly noContact: string;
  readonly fallback: string;
  readonly footer: string;
}

const COPY_FR_CA: CopyBundle = {
  preview: 'Un nouveau projet de voyage correspond à votre profil.',
  heading: 'Bonjour {firstName},',
  intro:
    'Un projet de voyage correspond à votre profil de conseiller vérifié. Voici un aperçu non nominatif de la demande :',
  destinationsLabel: 'Destinations envisagées',
  periodeLabel: 'Période approximative',
  typeLabel: 'Type de projet',
  button: 'Voir ce lead dans mon espace',
  noContact:
    'Les coordonnées du voyageur ne sont jamais transmises par courriel. Consultez le lead depuis votre espace sécurisé pour donner suite.',
  fallback: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
  footer:
    'Conseiller Voyage — service de mise en relation avec des conseillers vérifiés CCV / TICO au Canada.',
};

const COPY_EN: CopyBundle = {
  preview: 'A new travel project matches your profile.',
  heading: 'Hello {firstName},',
  intro:
    'A travel project matches your verified advisor profile. Here is a non-identifying overview of the request:',
  destinationsLabel: 'Considered destinations',
  periodeLabel: 'Approximate timeframe',
  typeLabel: 'Project type',
  button: 'View this lead in my workspace',
  noContact:
    "The traveler's contact details are never sent by email. Open the lead from your secure workspace to follow up.",
  fallback: "If the button doesn't work, copy this link into your browser:",
  footer: 'Conseiller Voyage — connecting Canadian travelers with CCV / TICO-verified advisors.',
};

export function LeadReceivedEmail({
  firstName,
  briefSummary,
  leadUrl,
  locale,
}: LeadReceivedEmailProps): React.ReactElement {
  const copy = locale === 'en' ? COPY_EN : COPY_FR_CA;
  const destinations =
    briefSummary.destinations.length > 0 ? briefSummary.destinations.join(', ') : '—';
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
            <Section
              style={{
                backgroundColor: '#f5f7fa',
                borderRadius: '6px',
                padding: '16px 20px',
                margin: '16px 0',
              }}
            >
              <Text style={{ color: '#555', fontSize: '14px', margin: '4px 0' }}>
                <strong>{copy.destinationsLabel} :</strong> {destinations}
              </Text>
              <Text style={{ color: '#555', fontSize: '14px', margin: '4px 0' }}>
                <strong>{copy.periodeLabel} :</strong> {briefSummary.periodeApprox}
              </Text>
              <Text style={{ color: '#555', fontSize: '14px', margin: '4px 0' }}>
                <strong>{copy.typeLabel} :</strong> {briefSummary.typeProjet}
              </Text>
            </Section>
            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button
                href={leadUrl}
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
            <Text style={{ color: '#888', fontSize: '13px' }}>{copy.noContact}</Text>
            <Text style={{ color: '#666', fontSize: '14px', marginTop: '16px' }}>
              {copy.fallback}
              <br />
              <Link href={leadUrl} style={{ color: '#0066cc', wordBreak: 'break-all' }}>
                {leadUrl}
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
