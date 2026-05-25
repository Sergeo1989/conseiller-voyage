// Seed dev — crée 2 utilisateurs (1 conseiller, 1 admin) idempotent.
// Lancer : pnpm db:seed:dev
//
// NE PAS lancer en production — ce script ne créé aucune AuthSession,
// les sessions sont créées dynamiquement par la page /login dev
// (apps/web/src/app/[locale]/login/page.tsx).

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.info('🌱 Seeding dev users...');

  const conseiller = await prisma.authUser.upsert({
    where: { email: 'conseiller@test.cv' },
    update: { role: 'conseiller' },
    create: {
      email: 'conseiller@test.cv',
      emailVerified: new Date(),
      name: 'Conseiller de Test',
      role: 'conseiller',
    },
  });

  const admin = await prisma.authUser.upsert({
    where: { email: 'admin@test.cv' },
    update: { role: 'admin' },
    create: {
      email: 'admin@test.cv',
      emailVerified: new Date(),
      name: 'Admin de Test',
      role: 'admin',
    },
  });

  console.info(`✓ Conseiller seedé : ${conseiller.id} (${conseiller.email})`);
  console.info(`✓ Admin seedé : ${admin.id} (${admin.email})`);
  console.info('\nPour te connecter en dev, va sur http://localhost:3000/fr/login');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
