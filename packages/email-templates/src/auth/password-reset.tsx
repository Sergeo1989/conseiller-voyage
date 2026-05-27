// Template courriel auth — lien reset password (US5).

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

export interface PasswordResetEmailProps {
  readonly firstName: string;
  readonly resetUrl: string;
  readonly expiresAtIso: string;
}

export function PasswordResetEmail({
  firstName,
  resetUrl,
  expiresAtIso,
}: PasswordResetEmailProps): React.ReactElement {
  return (
    <Html lang="fr-CA">
      <Head />
      <Preview>Choisissez un nouveau mot de passe (lien valide 1 heure).</Preview>
      <Body>
        <Container>
          <Heading>Réinitialisation de mot de passe</Heading>
          <Section>
            <Text>Bonjour {firstName},</Text>
            <Text>
              Vous avez demandé à réinitialiser votre mot de passe Conseiller Voyage. Cliquez le
              bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valide pendant
              <strong> 1 heure</strong> (jusqu'au {expiresAtIso}).
            </Text>
            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button href={resetUrl}>Choisir un nouveau mot de passe</Button>
            </Section>
            <Text>
              Si le bouton ne fonctionne pas : <Link href={resetUrl}>{resetUrl}</Link>
            </Text>
            <Text>
              <strong>Si vous n'avez pas demandé cette réinitialisation</strong>, ignorez ce
              courriel — votre mot de passe restera inchangé.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
