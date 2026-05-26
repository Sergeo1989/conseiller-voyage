#!/usr/bin/env tsx
// T109 — CLI bootstrap du premier admin (US7 scénario 1).
//
// Usage :
//   pnpm exec tsx apps/api/src/cli/admin-bootstrap.ts \
//     --email admin@conseiller-voyage.ca \
//     --password 'TempStrong!Pass-2026' \
//     --first-name Sergio \
//     --last-name 'Talom Nokam'
//
// Exit codes (cf. contracts/cli-admin-bootstrap.md) :
//   0 = succès
//   1 = erreur env / autre
//   2 = admin existe déjà (sans --force)
//   3 = politique mot de passe
//   4 = email invalide

import { BootstrapAdminUseCase } from '../modules/identite/application/use-cases/bootstrap-admin.use-case';
import { PrismaAuthAuditWriter } from '../modules/identite/infrastructure/prisma-auth-audit-writer';

interface CliArgs {
  email: string | undefined;
  password: string | undefined;
  firstName: string | undefined;
  lastName: string | undefined;
  force: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    email: undefined,
    password: undefined,
    firstName: undefined,
    lastName: undefined,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    switch (key) {
      case '--email':
        args.email = value;
        i++;
        break;
      case '--password':
        args.password = value;
        i++;
        break;
      case '--first-name':
        args.firstName = value;
        i++;
        break;
      case '--last-name':
        args.lastName = value;
        i++;
        break;
      case '--force':
        args.force = true;
        break;
    }
  }
  return args;
}

function log(message: string): void {
  process.stdout.write(`[bootstrap] ${message}\n`);
}

function logError(message: string): void {
  process.stderr.write(`[bootstrap] ${message}\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email || !args.password || !args.firstName || !args.lastName) {
    logError('✗ ERREUR : --email, --password, --first-name, --last-name sont requis.');
    process.exit(1);
  }

  const useCase = new BootstrapAdminUseCase(new PrismaAuthAuditWriter());
  const result = await useCase.execute({
    emailRaw: args.email,
    password: args.password,
    firstName: args.firstName,
    lastName: args.lastName,
    force: args.force,
  });

  if (result.kind === 'admin_already_exists') {
    logError('✗ ERREUR : un admin existe déjà.');
    logError('  Utilisez POST /admin/users via la console admin pour ajouter un admin.');
    logError('  Pour forcer (test only), passez --force.');
    process.exit(2);
  }
  if (result.kind === 'invalid_password') {
    logError('✗ ERREUR : politique de mot de passe non respectée :');
    for (const err of result.errors) logError(`  - ${err}`);
    process.exit(3);
  }
  if (result.kind === 'invalid_email') {
    logError('✗ ERREUR : email invalide.');
    process.exit(4);
  }

  log(`Création de l'admin ${args.firstName} ${args.lastName} (${args.email})…`);
  log(`✓ AuthUser créé (id=${result.userId})`);
  log('✓ AuthAccount credentials créé (bcrypt cost 11 sur SHA-256 pré-hash)');
  log('✓ AuthAuditEvent admin_bootstrap enregistré');
  log('');
  log('PROCHAINE ÉTAPE : aller sur la page de connexion, se connecter avec');
  log('ces identifiants, puis enrôler MFA immédiatement (redirect automatique');
  log('vers /admin/mfa/enroll).');
  log('');
  log("N'OUBLIEZ PAS de changer le mot de passe temporaire après l'enrôlement");
  log('MFA, via Paramètres > Sécurité.');

  process.exit(0);
}

void main().catch((err: unknown) => {
  logError(`✗ ERREUR inattendue : ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
