// Server Component admin reset MFA (US4 P2).
//
// Vérifie côté serveur : session valide + role=admin + auto-reset
// interdit. Charge les infos cible (email + role + MFA actif) +
// le compteur d'admins actifs pour le warning FR-026b.

import { AdminResetForm } from '@/features/mfa/ui/AdminResetForm';
import { prisma } from '@cv/db';
import { redirect } from 'next/navigation';
import { auth } from '../../../../../../../auth';
import { toUrlLocale } from '../../../../../../../i18n';

export const metadata = {
  title: 'Réinitialisation MFA — Conseiller Voyage',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

async function fetchActiveAdminsCount(): Promise<number> {
  // Lecture directe Prisma — pas besoin du cache applicatif côté Web.
  return prisma.authUser.count({
    where: {
      role: 'admin',
      mfaSecrets: { some: { enabledAt: { not: null } } },
    },
  });
}

export default async function AdminResetMfaPage({ params }: PageProps) {
  const { locale, id: targetUserId } = await params;

  const session = await auth();
  if (!session?.user) {
    redirect(`/${toUrlLocale(locale)}/login`);
  }
  if (session.user.role !== 'admin') {
    redirect(`/${toUrlLocale(locale)}`);
  }

  // US5 — MFA admin obligatoire dès J1. Si l'admin courant n'a pas
  // de MFA actif, redirect vers l'enrôlement admin avant tout accès
  // à la console.
  const actorSecret = await prisma.mfaSecret.findFirst({
    where: { userId: session.user.id, enabledAt: { not: null } },
    select: { id: true },
  });
  if (!actorSecret) {
    redirect(`/${toUrlLocale(locale)}/admin/mfa/enroll`);
  }

  // Lookup target avec MFA actif
  const target = await prisma.authUser.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      role: true,
      mfaSecrets: {
        where: { enabledAt: { not: null } },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!target) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-red-900">Utilisateur introuvable</h2>
        <p className="text-sm text-red-900">L'identifiant {targetUserId} n'existe pas.</p>
      </div>
    );
  }

  if (target.id === session.user.id) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-amber-900">Auto-reset interdit (FR-022a)</h2>
        <p className="text-sm text-amber-900">
          Vous ne pouvez pas réinitialiser votre propre MFA. Demandez à un autre admin de le faire
          pour vous, ou suivez la procédure break-glass DB si vous êtes seul.
        </p>
      </div>
    );
  }

  if (target.mfaSecrets.length === 0) {
    return (
      <div className="rounded border border-slate-300 bg-slate-50 p-6">
        <h2 className="mb-2 text-lg font-semibold">Aucun MFA actif</h2>
        <p className="text-sm text-slate-700">
          {target.email ?? target.id} n'a pas de MFA actif — rien à réinitialiser.
        </p>
      </div>
    );
  }

  const activeAdminsCount = await fetchActiveAdminsCount();

  return (
    <div>
      <h2 className="mb-2 text-xl font-semibold">Réinitialiser le MFA d'un utilisateur</h2>
      <p className="mb-6 text-slate-600">
        Cette action est <strong>destructive et auditée</strong>. Elle supprime le secret TOTP + les
        codes de récupération + toutes les sessions actives de la cible. L'utilisateur devra refaire
        l'enrôlement à sa prochaine connexion.
      </p>
      <AdminResetForm
        targetUserId={target.id}
        targetEmail={target.email}
        targetRole={target.role as 'admin' | 'conseiller'}
        activeAdminsCount={activeAdminsCount}
      />
    </div>
  );
}
