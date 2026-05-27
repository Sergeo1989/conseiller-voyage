// Template courriel auth — confirmation post-changement de mot de passe
// (US5 reset OU US6 change). FR-021.

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

export interface PasswordChangedEmailProps {
  readonly firstName: string;
  readonly changedAtIso: string;
  /** 'reset' = US5 lien email, 'change' = US6 changement authentifié. */
  readonly reason: 'reset' | 'change';
}

export function PasswordChangedEmail({
  firstName,
  changedAtIso,
  reason,
}: PasswordChangedEmailProps): React.ReactElement {
  const action = reason === 'reset' ? 'réinitialisé' : 'changé';
  return (
    <Html lang="fr-CA">
      <Head />
      <Preview>Votre mot de passe a été {action}.</Preview>
      <Body>
        <Container>
          <Heading>Mot de passe {action}</Heading>
          <Section>
            <Text>Bonjour {firstName},</Text>
            <Text>
              Votre mot de passe a été {action} le {changedAtIso}.
            </Text>
            <Text>
              {reason === 'reset'
                ? 'Toutes vos sessions actives ont été déconnectées pour des raisons de sécurité. Vous devrez vous reconnecter sur tous vos appareils.'
                : 'Vos autres sessions actives (autres navigateurs ou appareils) ont été déconnectées. Votre session courante reste active.'}
            </Text>
            <Text>
              <strong>Si ce n'est pas vous</strong> qui avez initié ce changement, contactez
              immédiatement l'équipe support de Conseiller Voyage.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
