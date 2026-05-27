// Template courriel auth — vérification d'email après signup (US1).
//
// FR-CA, lien à usage unique valide 24h. Cf. contracts/api-verify-email.md.

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

export interface EmailVerificationEmailProps {
  readonly firstName: string;
  readonly verifyUrl: string;
  readonly expiresAtIso: string;
}

export function EmailVerificationEmail({
  firstName,
  verifyUrl,
  expiresAtIso,
}: EmailVerificationEmailProps): React.ReactElement {
  return (
    <Html lang="fr-CA">
      <Head />
      <Preview>Bienvenue ! Vérifiez votre courriel pour activer votre compte.</Preview>
      <Body>
        <Container>
          <Heading>Bienvenue {firstName} !</Heading>
          <Section>
            <Text>
              Vous venez de créer un compte conseiller sur Conseiller Voyage. Pour activer votre
              accès, merci de confirmer votre adresse courriel en cliquant sur le bouton ci-dessous.
            </Text>
            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button href={verifyUrl}>Vérifier mon courriel</Button>
            </Section>
            <Text>
              Ce lien est valide jusqu'au {expiresAtIso}. Au-delà, vous devrez en demander un
              nouveau depuis la page de connexion.
            </Text>
            <Text>
              Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :{' '}
              <Link href={verifyUrl}>{verifyUrl}</Link>
            </Text>
            <Text>
              <strong>Si vous n'avez pas créé ce compte</strong>, vous pouvez ignorer ce courriel —
              aucun compte ne sera activé sans vérification.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
