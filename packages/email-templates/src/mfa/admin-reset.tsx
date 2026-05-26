// Template courriel FR-026 — reset MFA par un admin.

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

export interface AdminResetEmailProps {
  readonly resetAtIso: string;
  readonly justification: string; // texte intégral
  readonly actorLabel: string; // "équipe support" côté conseiller, "<prénom> <nom>" côté admin
}

export function AdminResetEmail({
  resetAtIso,
  justification,
  actorLabel,
}: AdminResetEmailProps): React.ReactElement {
  return (
    <Html lang="fr-CA">
      <Head />
      <Preview>Votre MFA a été réinitialisé par l'équipe support.</Preview>
      <Body>
        <Container>
          <Heading>Réinitialisation de votre MFA</Heading>
          <Section>
            <Text>
              Bonjour, votre méthode d'authentification multi-facteur (TOTP) a été réinitialisée le{' '}
              <strong>{resetAtIso}</strong> par {actorLabel}.
            </Text>
            <Text>
              Motif :<br />
              <em>{justification}</em>
            </Text>
            <Text>
              À votre prochaine connexion, vous serez invité à refaire l'enrôlement TOTP complet
              (scan d'un nouveau QR code + génération de 10 nouveaux codes de récupération). Toutes
              vos sessions actives ont été invalidées.
            </Text>
            <Text>
              <strong>Si vous n'avez pas demandé cette réinitialisation</strong>, contactez
              immédiatement l'équipe support de Conseiller Voyage.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
