// T015 [017] — Template courriel voyageur : « vos conseillers vérifiés sont prêts ».
// Émis quand le brief passe à `matched` / `partially_matched`.
//
// ANTI-MARKETPLACE (ADR-0002) NON-NÉGOCIABLE : AUCUNE coordonnée de contact
// direct d'un conseiller (courriel, téléphone, lien externe), AUCUN montant /
// prix / paiement. Seuls le **prénom** et les **spécialités** publiques de
// chaque conseiller sont affichés. Le seul CTA renvoie au récap / espace
// voyageur (magic-link de suivi). Bilingue FR-CA / EN (FR-CA par défaut).

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

/** Affichage public minimal d'un conseiller — prénom + spécialités seulement. */
export interface VoyageurAdvisorDisplay {
  readonly prenom: string;
  readonly specialites: ReadonlyArray<string>;
}

export interface VoyageurAdvisorsReadyEmailProps {
  readonly advisors: ReadonlyArray<VoyageurAdvisorDisplay>;
  readonly trackingUrl: string;
  readonly locale: 'fr-CA' | 'en';
  /** `partially_matched` → moins de 3 conseillers ; ton légèrement adapté. */
  readonly partiel?: boolean;
}

interface CopyBundle {
  readonly preview: string;
  readonly heading: string;
  readonly intro: string;
  readonly introPartiel: string;
  readonly specialitesLabel: string;
  readonly button: string;
  readonly noContact: string;
  readonly fallback: string;
  readonly footer: string;
}

const COPY_FR_CA: CopyBundle = {
  preview: 'Vos conseillers vérifiés sont prêts à vous accompagner.',
  heading: 'Bonne nouvelle !',
  intro:
    'Des conseillers en voyage vérifiés correspondent à votre projet. Vous pouvez consulter leur profil et poursuivre les échanges en toute sécurité depuis votre espace.',
  introPartiel:
    'Un conseiller en voyage vérifié correspond déjà à votre projet, et nous continuons à en chercher d’autres. Vous pouvez dès maintenant consulter son profil depuis votre espace.',
  specialitesLabel: 'Spécialités',
  button: 'Voir mes conseillers',
  noContact:
    'Pour votre sécurité, les échanges se font uniquement depuis votre espace Conseiller Voyage. Aucune coordonnée personnelle n’est transmise par courriel.',
  fallback: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
  footer:
    'Conseiller Voyage — service de mise en relation avec des conseillers vérifiés CCV / TICO au Canada.',
};

const COPY_EN: CopyBundle = {
  preview: 'Your verified travel advisors are ready to help.',
  heading: 'Good news!',
  intro:
    'Verified travel advisors match your project. You can view their profiles and continue the conversation securely from your space.',
  introPartiel:
    'A verified travel advisor already matches your project, and we are still looking for more. You can view their profile from your space right now.',
  specialitesLabel: 'Specialties',
  button: 'View my advisors',
  noContact:
    'For your safety, all exchanges happen only from your Conseiller Voyage space. No personal contact details are ever sent by email.',
  fallback: "If the button doesn't work, copy this link into your browser:",
  footer: 'Conseiller Voyage — connecting Canadian travelers with CCV / TICO-verified advisors.',
};

export function VoyageurAdvisorsReadyEmail({
  advisors,
  trackingUrl,
  locale,
  partiel = false,
}: VoyageurAdvisorsReadyEmailProps): React.ReactElement {
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
            <Text style={{ color: '#333', fontSize: '16px', lineHeight: 1.5 }}>
              {partiel ? copy.introPartiel : copy.intro}
            </Text>
            {advisors.map((advisor, i) => (
              <Section
                // biome-ignore lint/suspicious/noArrayIndexKey: liste statique de rendu courriel
                key={i}
                style={{
                  backgroundColor: '#f5f7fa',
                  borderRadius: '6px',
                  padding: '16px 20px',
                  margin: '12px 0',
                }}
              >
                <Text style={{ color: '#1a1a1a', fontSize: '16px', fontWeight: 600, margin: 0 }}>
                  {advisor.prenom}
                </Text>
                {advisor.specialites.length > 0 ? (
                  <Text style={{ color: '#555', fontSize: '14px', margin: '6px 0 0' }}>
                    <strong>{copy.specialitesLabel} :</strong> {advisor.specialites.join(', ')}
                  </Text>
                ) : null}
              </Section>
            ))}
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
            <Text style={{ color: '#888', fontSize: '13px' }}>{copy.noContact}</Text>
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
