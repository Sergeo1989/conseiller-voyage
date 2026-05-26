// Template courriel FR-020a — 3 échecs step-up → session invalidée.

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

export interface StepUpSessionKilledEmailProps {
  readonly killedAtIso: string;
  readonly actorIp: string; // abrégée
  readonly intendedAction: string;
}

export function StepUpSessionKilledEmail({
  killedAtIso,
  actorIp,
  intendedAction,
}: StepUpSessionKilledEmailProps): React.ReactElement {
  return (
    <Html lang="fr-CA">
      <Head />
      <Preview>Action sensible refusée — session invalidée.</Preview>
      <Body>
        <Container>
          <Heading>Tentative d'action sensible refusée</Heading>
          <Section>
            <Text>
              Bonjour, une tentative d'effectuer l'action <strong>{intendedAction}</strong> sur
              votre compte a échoué après 3 essais infructueux de validation par code TOTP.
            </Text>
            <Text>
              Date : {killedAtIso}
              <br />
              Adresse IP source (abrégée) : {actorIp}
            </Text>
            <Text>
              Par mesure de sécurité, la session concernée a été invalidée. Vos autres sessions
              actives ne sont pas affectées.
            </Text>
            <Text>
              <strong>Si ce n'est pas vous qui avez tenté cette action</strong>, votre compte est
              probablement compromis. Connectez-vous immédiatement, changez votre mot de passe et
              révoquez toutes vos sessions actives depuis vos paramètres.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
