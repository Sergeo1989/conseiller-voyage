// T146c — Route handler dev-only pour seed E2E (Playwright globalSetup).
//
// Crée (ou upsert) un AuthUser + ConseillerProfile selon le preset, ouvre
// une AuthSession fraîche, renvoie le cookie au caller. Le globalSetup
// Playwright l'appelle au boot et stocke les cookies dans des env vars
// (`E2E_CONSEILLER_SESSION`, `E2E_ADMIN_SESSION`) consommés par les
// `test.skip(!ENV_VAR, ...)` patterns existants.
//
// SÉCURITÉ : 404 strict en production (vérification triple — NODE_ENV
// applicatif + variable explicite `ENABLE_DEV_ENDPOINTS` + header
// `X-Dev-Seed-Authorization`).

import { randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '@cv/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const SESSION_TTL_DAYS = 30;
const COOKIE_NAME = 'authjs.session-token';

const SeedRequestSchema = z.object({
  role: z.enum(['conseiller', 'admin']),
  profilStatut: z.enum(['incomplet', 'pret']).optional(),
});

type SeedRequest = z.infer<typeof SeedRequestSchema>;

function isProductionRefuse(req: Request): NextResponse | null {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }
  if (process.env.ENABLE_DEV_ENDPOINTS !== 'true') {
    return new NextResponse('Not Found', { status: 404 });
  }
  const expected = process.env.DEV_SEED_TOKEN ?? '';
  const provided = req.headers.get('x-dev-seed-authorization') ?? '';
  if (expected.length < 32 || provided !== expected) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  return null;
}

async function upsertConseiller(profilStatut: 'incomplet' | 'pret'): Promise<string> {
  const email = `conseiller-e2e-${randomUUID()}@test.local`;
  const user = await prisma.authUser.create({
    data: {
      email,
      emailVerified: new Date(),
      name: 'Conseiller E2E',
      firstName: 'Conseiller',
      lastName: 'E2E',
      role: 'conseiller',
    },
  });
  await prisma.conseillerProfile.create({
    data: {
      authUserId: user.id,
      titre: profilStatut === 'pret' ? 'Conseiller test E2E' : null,
      biographie:
        profilStatut === 'pret'
          ? 'Bio test pour les essais Playwright. Au moins 50 caractères pour passer la validation.'
          : null,
      anneesExperience: profilStatut === 'pret' ? 5 : null,
      afficherNomComplet: false,
      statut: profilStatut,
      slug: profilStatut === 'pret' ? `conseiller-e2e-${user.id.slice(0, 8)}` : null,
      publishedAt: profilStatut === 'pret' ? new Date() : null,
    },
  });
  return user.id;
}

async function upsertAdmin(): Promise<string> {
  const email = `admin-e2e-${randomUUID()}@test.local`;
  const user = await prisma.authUser.create({
    data: {
      email,
      emailVerified: new Date(),
      name: 'Admin E2E',
      firstName: 'Admin',
      lastName: 'E2E',
      role: 'admin',
    },
  });
  return user.id;
}

interface SeedResponse {
  readonly cookieName: string;
  readonly sessionToken: string;
  readonly expires: string;
  readonly userId: string;
  readonly role: 'conseiller' | 'admin';
}

export async function POST(req: Request): Promise<NextResponse<SeedResponse> | NextResponse> {
  const refuse = isProductionRefuse(req);
  if (refuse) return refuse;

  let body: SeedRequest;
  try {
    body = SeedRequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const userId =
    body.role === 'admin'
      ? await upsertAdmin()
      : await upsertConseiller(body.profilStatut ?? 'pret');

  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: { sessionToken, userId, expires },
  });

  return NextResponse.json<SeedResponse>({
    cookieName: COOKIE_NAME,
    sessionToken,
    expires: expires.toISOString(),
    userId,
    role: body.role,
  });
}
