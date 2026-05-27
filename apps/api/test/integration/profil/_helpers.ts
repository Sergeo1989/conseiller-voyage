// Helpers partagés pour les tests intégration profil (feature 007).
//
// Convention UUID littéraux : 00000000-0000-4000-8000-pppXXXXXXXXX
//   - ppp = préfixe par fichier de test (évite collisions entre tests
//           parallèles et facilite cleanup ciblé)
//   - X   = suffixe arbitraire 9 chars
//
// Pattern hérité de apps/api/test/integration/conformite/verified-filter.integration.test.ts.

import { type Prisma, prisma } from '@cv/db';
import type { ConformiteQueryPort, VerificationStatusDto } from '@cv/shared/conformite';
import { PrismaConformiteRepository } from '../../../src/modules/conformite/infrastructure/prisma-conformite-repository';

export interface SeedAuthUserInput {
  readonly id: string;
  readonly email?: string;
  readonly firstName: string;
  readonly lastName: string;
}

export async function seedAuthUser(input: SeedAuthUserInput): Promise<void> {
  await prisma.authUser.create({
    data: {
      id: input.id,
      email: input.email ?? `${input.id}@example.test`,
      firstName: input.firstName,
      lastName: input.lastName,
      role: 'conseiller',
    },
  });
}

export interface SeedComplianceInput {
  readonly id: string;
  readonly conseillerId: string;
  readonly status: 'pending' | 'verified' | 'suspended' | 'revoked';
  readonly anonymizedAt?: Date | null;
}

export async function seedCompliance(input: SeedComplianceInput): Promise<void> {
  const data: Prisma.ConseillerComplianceUncheckedCreateInput = {
    id: input.id,
    conseillerId: input.conseillerId,
    status: input.status,
    lastVerifiedAt: input.status === 'verified' ? new Date() : null,
    lastStatusChangeAt: new Date(),
    consentToProcessGivenAt: new Date(),
    erasureRequestedAt: null,
    anonymizedAt: input.anonymizedAt ?? null,
  };
  await prisma.conseillerCompliance.create({ data });
}

export interface SeedProfilInput {
  readonly id: string;
  readonly authUserId: string;
  readonly titre?: string | null;
  readonly biographie?: string | null;
  readonly anneesExperience?: number | null;
  readonly afficherNomComplet?: boolean;
  readonly photoS3Key?: string | null;
  readonly photoWidth?: number | null;
  readonly photoHeight?: number | null;
  readonly photoContentType?: string | null;
  readonly slug?: string | null;
  readonly statut?: 'incomplet' | 'pret' | 'masque_admin' | 'anonymise';
  readonly raisonMasquageAdmin?: string | null;
  readonly publishedAt?: Date | null;
  readonly anonymizedAt?: Date | null;
  readonly specialitesCodes?: readonly string[];
  readonly languesCodes?: readonly string[];
  readonly zonesGeographiquesCodes?: readonly string[];
}

const PROFIL_DEFAULTS = {
  titre: null,
  biographie: null,
  anneesExperience: null,
  afficherNomComplet: false,
  photoS3Key: null,
  photoWidth: null,
  photoHeight: null,
  photoContentType: null,
  slug: null,
  statut: 'incomplet' as const,
  raisonMasquageAdmin: null,
  publishedAt: null,
  anonymizedAt: null,
} as const;

function buildProfilScalars(input: SeedProfilInput): Record<string, unknown> {
  // Spread defaults puis spread input — input écrase quand défini ;
  // les `undefined` du spread laissent la valeur du default intacte.
  const scalars: Record<string, unknown> = { ...PROFIL_DEFAULTS };
  for (const [k, v] of Object.entries(input)) {
    if (
      v !== undefined &&
      !['specialitesCodes', 'languesCodes', 'zonesGeographiquesCodes'].includes(k)
    ) {
      scalars[k] = v;
    }
  }
  return scalars;
}

function buildProfilRelations(input: SeedProfilInput): Record<string, unknown> {
  const rel: Record<string, unknown> = {};
  if (input.specialitesCodes) {
    rel.specialites = { connect: input.specialitesCodes.map((code) => ({ code })) };
  }
  if (input.languesCodes) {
    rel.langues = { connect: input.languesCodes.map((code) => ({ code })) };
  }
  if (input.zonesGeographiquesCodes) {
    rel.zonesGeographiques = {
      connect: input.zonesGeographiquesCodes.map((code) => ({ code })),
    };
  }
  return rel;
}

export async function seedProfil(input: SeedProfilInput): Promise<void> {
  await prisma.conseillerProfile.create({
    data: {
      ...buildProfilScalars(input),
      ...buildProfilRelations(input),
    } as Prisma.ConseillerProfileUncheckedCreateInput,
  });
}

// Cleanup ciblé par préfixe UUID — supporte les triggers append-only via
// session_replication_role = replica (cf. signup.integration.test.ts:29).
//
// `prefix` est le préfixe court 3 chars (ex. 'a01'). Les UUIDs construits
// par buildUuid suivent le format `00000000-0000-4000-8000-pppXXXXXXXXX`,
// donc le filtre LIKE doit cibler le segment final via `%-pppXXX%`.
export async function cleanupByUuidPrefix(prefix: string): Promise<void> {
  const pattern = `%-${prefix}%`;
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM profile_moderation_audits WHERE "profileId"::text LIKE '${pattern}'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM profile_onboarding_reminder_schedules WHERE "profileId"::text LIKE '${pattern}'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM profile_photo_history WHERE "profileId"::text LIKE '${pattern}'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM profile_conseiller_profiles WHERE id::text LIKE '${pattern}' OR "authUserId"::text LIKE '${pattern}'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM profile_slug_reservations WHERE "conseillerIdOrigine"::text LIKE '${pattern}' OR slug LIKE '${prefix}-%'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM conformite_conseiller_compliances WHERE id::text LIKE '${pattern}' OR "conseillerId"::text LIKE '${pattern}'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM auth_audit_events WHERE "actorUserId"::text LIKE '${pattern}' OR "targetUserId"::text LIKE '${pattern}'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM auth_outbox_emails WHERE "recipientUserId"::text LIKE '${pattern}'`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM auth_users WHERE id::text LIKE '${pattern}'`);
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}

// Cleanup ciblé par slug (utile pour les tests qui réservent un slug
// spécifique). À utiliser EN COMPLÉMENT de cleanupByUuidPrefix.
export async function cleanupBySlug(slug: string): Promise<void> {
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM profile_slug_reservations WHERE slug = '${slug}'`);
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}

// Construit un UUID v4 littéral à partir d'un préfixe de test (3 chars) +
// suffixe 9 chars. Format : 00000000-0000-4000-8000-pppXXXXXXXXX
export function buildUuid(prefix3: string, suffix9: string): string {
  if (prefix3.length !== 3) throw new Error('prefix3 must be exactly 3 chars');
  if (suffix9.length > 9) throw new Error('suffix9 max 9 chars');
  return `00000000-0000-4000-8000-${prefix3}${suffix9.padStart(9, '0')}`;
}

// ConformiteQueryPort minimal pour les tests — bypass cache + publisher,
// lit directement la DB via PrismaConformiteRepository. Couvre les besoins
// des use cases profil qui appellent uniquement getVerificationStatus().
export function buildTestConformiteQueryPort(): ConformiteQueryPort {
  const repo = new PrismaConformiteRepository();
  return {
    async getVerificationStatus(args: {
      conseillerId: string;
      strict?: boolean;
    }): Promise<VerificationStatusDto> {
      // Cast vers le brand ConseillerId — l'entrée tests utilise des UUID
      // valides construits par buildUuid, sans qu'on traîne le ConseillerIdSchema.
      const compliance = await repo.findVerifiedByConseillerId(args.conseillerId as never);
      return {
        conseillerId: args.conseillerId,
        verified: compliance !== null,
        lastVerifiedAt: compliance?.lastVerifiedAt?.toISOString() ?? null,
      };
    },
    onStatusChanged: () => () => undefined,
  };
}
