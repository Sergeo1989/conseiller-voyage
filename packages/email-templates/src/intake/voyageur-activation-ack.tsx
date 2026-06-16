// T021 [017 US2] — Template courriel voyageur : accusé d'activation du brief.
// Émis à l'activation du brief (post-vérification 008), distinct du courriel de
// vérification magic-link. Ton rassurant : « demande confirmée, on cherche ».
//
// ANTI-MARKETPLACE (ADR-0002) : aucun montant, aucune coordonnée. Le seul CTA
// renvoie au récap / espace voyageur (magic-link de suivi). Bilingue FR-CA / EN.

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

export interface VoyageurActivationAckEmailProps {
  readonly trackingUrl: string;
  readonly locale: 'fr-CA' | 'en';
}

interface CopyBundle {
  readonly preview: string;
  readonly heading: string;
  readonly intro: string;
  readonly next: string;
  readonly button: string;
  readonly fallback: string;
  readonly footer: string;
}

const COPY_FR_CA: CopyBundle = {
  preview: 'Votre demande de voyage est confirmée — nous cherchons vos conseillers.',
  heading: 'Votre demande est confirmée',
  intro:
    'Merci ! Votre demande de voyage est confirmée et active. Nous recherchons maintenant des conseillers en voyage vérifiés correspondant à votre projet.',
  next: 'Vous recevrez un courriel dès que des conseillers vérifiés seront prêts à vous accompagner. Vous pouvez consulter l’état de votre demande à tout moment depuis votre espace.',
  button: 'Suivre ma demande',
  fallback: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
  footer:
    'Conseiller Voyage — service de mise en relation avec des conseillers vérifiés CCV / TICO au Canada.',
};

const COPY_EN: CopyBundle = {
  preview: 'Your travel request is confirmed — we are finding your advisors.',
  heading: 'Your request is confirmed',
  intro:
    'Thank you! Your travel request is confirmed and active. We are now looking for verified travel advisors that match your project.',
  next: 'You will receive an email as soon as verified advisors are ready to help. You can check your request status anytime from your space.',
  button: 'Track my request',
  fallback: "If the button doesn't work, copy this link into your browser:",
  footer: 'Conseiller Voyage — connecting Canadian travelers with CCV / TICO-verified advisors.',
};

export function VoyageurActivationAckEmail({
  trackingUrl,
  locale,
}: VoyageurActivationAckEmailProps): React.ReactElement {
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
            <Text style={{ color: '#333', fontSize: '16px', lineHeight: 1.5 }}>{copy.next}</Text>
            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button
                href={trackingUrl}
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
            <Text style={{ color: '#666', fontSize: '14px', marginTop: '16px' }}>
              {copy.fallback}
              <br />
              <Link href={trackingUrl} style={{ color: '#0066cc', wordBreak: 'break-all' }}>
                {trackingUrl}
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
