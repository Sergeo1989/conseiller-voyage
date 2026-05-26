// Template courriel FR-015f — rappel changement de device > 24h sans complétion.

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

export interface DeviceChangeIncompleteEmailProps {
  readonly startedAtIso: string;
}

export function DeviceChangeIncompleteEmail({
  startedAtIso,
}: DeviceChangeIncompleteEmailProps): React.ReactElement {
  return (
    <Html lang="fr-CA">
      <Head />
      <Preview>Vous avez démarré un changement de device sans le compléter.</Preview>
      <Body>
        <Container>
          <Heading>Changement de device inachevé</Heading>
          <Section>
            <Text>
              Bonjour, vous avez démarré un changement de votre device TOTP le{' '}
              <strong>{startedAtIso}</strong> mais ne l'avez pas terminé.
            </Text>
            <Text>
              Tant que vous n'aurez pas complété l'enrôlement du nouveau device (scan du nouveau QR
              code + premier code TOTP validé), vos prochaines connexions exigeront de finaliser ce
              processus.
            </Text>
            <Text>
              Connectez-vous à Conseiller Voyage pour reprendre le flow là où vous l'avez laissé. Si
              vous n'avez pas initié ce changement, contactez l'équipe support.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
