// Template courriel FR-013 — verrouillage temporaire après 5 échecs TOTP.
// FR-CA primary. EN sera ajouté via 024.

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type * as React from 'react';

export interface LoginLockedEmailProps {
  readonly lockedUntilIso: string; // ISO 8601, formatté côté caller en fr-CA
  readonly attemptsInWindow: number;
}

export function LoginLockedEmail({
  lockedUntilIso,
  attemptsInWindow,
}: LoginLockedEmailProps): React.ReactElement {
  return (
    <Html lang="fr-CA">
      <Head />
      <Preview>Votre compte Conseiller Voyage est temporairement verrouillé.</Preview>
      <Body>
        <Container>
          <Heading>Compte temporairement verrouillé</Heading>
          <Section>
            <Text>
              Bonjour, nous avons détecté {attemptsInWindow} tentatives infructueuses de connexion
              par code TOTP sur votre compte au cours des dernières 5 minutes.
            </Text>
            <Text>
              Par mesure de sécurité, l'accès à votre compte est temporairement bloqué jusqu'à{' '}
              <strong>{lockedUntilIso}</strong>.
            </Text>
            <Text>
              Si ce n'est pas vous qui avez tenté de vous connecter, contactez le support de
              Conseiller Voyage immédiatement pour vérifier la sécurité de votre compte.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
