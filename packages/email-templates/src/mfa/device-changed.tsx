// Template courriel FR-015e — confirmation de changement de device TOTP.

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

export interface DeviceChangedEmailProps {
  readonly changedAtIso: string;
  readonly actorIp: string; // abrégée
}

export function DeviceChangedEmail({
  changedAtIso,
  actorIp,
}: DeviceChangedEmailProps): React.ReactElement {
  return (
    <Html lang="fr-CA">
      <Head />
      <Preview>Vous avez changé votre device TOTP.</Preview>
      <Body>
        <Container>
          <Heading>Changement de device TOTP confirmé</Heading>
          <Section>
            <Text>
              Bonjour, vous venez de changer le device associé à votre MFA TOTP. Vos nouveaux codes
              de récupération viennent de vous être affichés une seule fois — assurez-vous de les
              avoir sauvegardés en lieu sûr.
            </Text>
            <Text>
              Date : {changedAtIso}
              <br />
              Adresse IP source (abrégée) : {actorIp}
            </Text>
            <Text>
              Les sessions actives sur vos autres devices ont été invalidées par mesure de sécurité.
              Vous devrez vous reconnecter avec votre nouveau code TOTP.
            </Text>
            <Text>
              <strong>Si ce n'est pas vous qui avez effectué ce changement</strong>, contactez
              immédiatement l'équipe support de Conseiller Voyage.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
