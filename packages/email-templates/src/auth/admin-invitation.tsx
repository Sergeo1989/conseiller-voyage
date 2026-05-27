// Template courriel auth — invitation admin (US7).

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

export interface AdminInvitationEmailProps {
  readonly inviterName: string;
  readonly acceptUrl: string;
  readonly expiresAtIso: string;
}

export function AdminInvitationEmail({
  inviterName,
  acceptUrl,
  expiresAtIso,
}: AdminInvitationEmailProps): React.ReactElement {
  return (
    <Html lang="fr-CA">
      <Head />
      <Preview>Vous avez été invité comme administrateur Conseiller Voyage.</Preview>
      <Body>
        <Container>
          <Heading>Invitation à devenir administrateur</Heading>
          <Section>
            <Text>
              Bonjour, {inviterName} vous a invité à devenir administrateur de la plateforme
              Conseiller Voyage. Cliquez le bouton ci-dessous pour accepter l'invitation et créer
              votre compte.
            </Text>
            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button href={acceptUrl}>Accepter l'invitation</Button>
            </Section>
            <Text>
              Ce lien est valide jusqu'au {expiresAtIso} (72 heures). Au-delà, demandez une nouvelle
              invitation à {inviterName}.
            </Text>
            <Text>
              <strong>À noter</strong> : à votre première connexion, vous serez automatiquement
              redirigé vers l'enrôlement MFA (authentification à double facteur) — c'est obligatoire
              pour tout administrateur (Principe de sécurité NON-NÉGOCIABLE).
            </Text>
            <Text>
              Si le bouton ne fonctionne pas : <Link href={acceptUrl}>{acceptUrl}</Link>
            </Text>
            <Text>
              <strong>Si cette invitation n'est pas attendue</strong>, ignorez ce courriel et
              contactez Conseiller Voyage.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
