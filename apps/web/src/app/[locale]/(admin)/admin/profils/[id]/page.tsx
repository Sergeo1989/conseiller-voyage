// T122 — Console admin profils — page détail.
//
// Server Component qui :
//   1. Vérifie session admin (redirect si rôle != admin).
//   2. Charge le détail profil + historique modérations via apiClient.
//   3. Affiche : identité + statut + champs + photo + audits + 3 actions
//      (retirer photo / masquer / rétablir selon statut courant).

import { auth } from '@/auth';
import { AdminActionButtons } from '@/features/admin-users';
import { type Locale, toUrlLocale } from '@/i18n';
import { apiClient } from '@/shared/lib/http';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

interface PageProps {
  params: Promise<{ locale: Locale; id: string }>;
}

type StatutProfil = 'incomplet' | 'pret' | 'masque_admin' | 'anonymise';

interface ProfilAdminResponse {
  profilId: string;
  authUserId: string;
  nomLegal: { prenom: string; nom: string };
  nomAffiche: string;
  slug: string | null;
  statut: StatutProfil;
  raisonMasquageAdmin: string | null;
  verifie: boolean;
  lastVerifiedAt: string | null;
  titre: string | null;
  biographie: string | null;
  anneesExperience: number | null;
  afficherNomComplet: boolean;
  specialitesCodes: readonly string[];
  languesCodes: readonly string[];
  zonesGeographiquesCodes: readonly string[];
  photoS3Key: string | null;
  publishedAt: string | null;
  anonymizedAt: string | null;
  historiqueModerations: ReadonlyArray<{
    id: string;
    action: 'retrait_photo' | 'masquage' | 'retablissement';
    raison: string;
    adminEmailHash: string;
    occurredAt: string;
  }>;
}

const STATUT_LABELS: Record<StatutProfil, string> = {
  incomplet: 'Incomplet',
  pret: 'Prêt',
  masque_admin: 'Masqué (admin)',
  anonymise: 'Anonymisé Loi 25',
};

const ACTION_LABELS: Record<'retrait_photo' | 'masquage' | 'retablissement', string> = {
  retrait_photo: 'Retrait photo',
  masquage: 'Masquage',
  retablissement: 'Rétablissement',
};

export const metadata = { robots: { index: false, follow: false } };

function ProfilHeaderBlock({ profil }: { profil: ProfilAdminResponse }) {
  return (
    <>
      <header style={headerStyle}>
        <h1 style={{ margin: 0 }}>
          {profil.nomLegal.prenom} {profil.nomLegal.nom}
        </h1>
        <StatutBadge statut={profil.statut} />
      </header>
      <p style={subtitleStyle}>
        <strong>Slug public :</strong>{' '}
        {profil.slug ? (
          <code>{profil.slug}</code>
        ) : (
          <em style={{ color: '#9ca3af' }}>non attribué</em>
        )}
        {' · '}
        <strong>Conformité :</strong> {profil.verifie ? '✅ vérifiée' : '❌ non vérifiée'}
        {profil.lastVerifiedAt && ` (depuis ${formatDateFrCa(profil.lastVerifiedAt)})`}
      </p>
    </>
  );
}

function StatutAlerts({ profil }: { profil: ProfilAdminResponse }) {
  if (profil.statut === 'masque_admin' && profil.raisonMasquageAdmin) {
    return (
      <div role="alert" style={alertStyle}>
        <strong>Raison du masquage admin :</strong> {profil.raisonMasquageAdmin}
      </div>
    );
  }
  if (profil.statut === 'anonymise') {
    return (
      <div role="alert" style={alertAnonStyle}>
        <strong>Profil anonymisé Loi 25</strong>
        {profil.anonymizedAt && ` le ${formatDateFrCa(profil.anonymizedAt)}`}. Aucune action admin
        n'est plus possible.
      </div>
    );
  }
  return null;
}

function ContenuSection({ profil }: { profil: ProfilAdminResponse }) {
  return (
    <section style={sectionStyle}>
      <h2 style={h2Style}>Contenu du profil</h2>
      <dl style={dlStyle}>
        <Champ libelle="Titre" valeur={profil.titre} />
        <Champ libelle="Biographie" valeur={profil.biographie} multiline />
        <Champ libelle="Années d'expérience" valeur={profil.anneesExperience?.toString() ?? null} />
        <Champ
          libelle="Affiche le nom complet"
          valeur={profil.afficherNomComplet ? 'Oui' : 'Non (initiale-nom)'}
        />
        <Champ libelle="Spécialités" valeur={profil.specialitesCodes.join(', ') || null} />
        <Champ libelle="Langues" valeur={profil.languesCodes.join(', ') || null} />
        <Champ
          libelle="Zones géographiques"
          valeur={profil.zonesGeographiquesCodes.join(', ') || null}
        />
        <Champ libelle="Photo (S3 key)" valeur={profil.photoS3Key} monospace />
      </dl>
    </section>
  );
}

function ActionsSection({
  profil,
  locale,
}: {
  profil: ProfilAdminResponse;
  locale: Locale;
}) {
  if (profil.statut === 'anonymise') return null;
  return (
    <section style={sectionStyle}>
      <h2 style={h2Style}>Actions de modération</h2>
      <AdminActionButtons
        profilId={profil.profilId}
        statut={profil.statut}
        hasPhoto={profil.photoS3Key !== null}
        profilLibelle={`${profil.nomLegal.prenom} ${profil.nomLegal.nom}`}
        locale={locale}
      />
    </section>
  );
}

export default async function AdminProfilDetailPage({ params }: PageProps): Promise<ReactNode> {
  const { locale, id } = await params;
  const urlLocale = toUrlLocale(locale);

  const session = await auth();
  if (!session?.user) {
    redirect(`/${urlLocale}/connexion?callbackUrl=/${urlLocale}/admin/profils/${id}`);
  }
  if (session.user.role !== 'admin') {
    redirect(`/${urlLocale}/conseiller`);
  }

  const res = await apiClient.get<ProfilAdminResponse>(`/api/admin/profils/${id}`);
  if (!res.ok) {
    return (
      <main style={mainStyle}>
        <p>
          <Link href={`/${urlLocale}/admin/profils`} style={linkStyle}>
            ← Retour à la liste
          </Link>
        </p>
        <h1>Profil introuvable</h1>
        <p style={errorStyle}>
          Erreur API ({res.status}). Le profil n'existe pas ou la session admin a expiré.
        </p>
      </main>
    );
  }

  const profil = res.data;

  return (
    <main style={mainStyle}>
      <p>
        <Link href={`/${urlLocale}/admin/profils`} style={linkStyle}>
          ← Retour à la liste
        </Link>
      </p>
      <ProfilHeaderBlock profil={profil} />
      <StatutAlerts profil={profil} />
      <ContenuSection profil={profil} />
      <ActionsSection profil={profil} locale={locale} />

      <section style={sectionStyle}>
        <h2 style={h2Style}>Historique des modérations ({profil.historiqueModerations.length})</h2>
        {profil.historiqueModerations.length === 0 ? (
          <p style={{ color: '#6b7280' }}>Aucune modération enregistrée.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Raison</th>
                <th style={thStyle}>Admin (hash)</th>
              </tr>
            </thead>
            <tbody>
              {profil.historiqueModerations.map((entry) => (
                <tr key={entry.id}>
                  <td style={tdStyle}>{formatDateFrCa(entry.occurredAt)}</td>
                  <td style={tdStyle}>
                    <strong>{ACTION_LABELS[entry.action]}</strong>
                  </td>
                  <td style={tdStyle}>{entry.raison}</td>
                  <td style={tdStyle}>
                    <code style={{ fontSize: 11, color: '#6b7280' }}>
                      {entry.adminEmailHash.slice(0, 12)}…
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function Champ({
  libelle,
  valeur,
  multiline = false,
  monospace = false,
}: {
  libelle: string;
  valeur: string | null;
  multiline?: boolean;
  monospace?: boolean;
}) {
  return (
    <>
      <dt style={dtStyle}>{libelle}</dt>
      <dd style={multiline ? ddMultilineStyle : monospace ? ddMonospaceStyle : ddStyle}>
        {valeur ?? <em style={{ color: '#9ca3af' }}>—</em>}
      </dd>
    </>
  );
}

function StatutBadge({ statut }: { statut: StatutProfil }) {
  const colors: Record<StatutProfil, { bg: string; color: string }> = {
    incomplet: { bg: '#fef3c7', color: '#92400e' },
    pret: { bg: '#d1fae5', color: '#065f46' },
    masque_admin: { bg: '#fed7aa', color: '#9a3412' },
    anonymise: { bg: '#e5e7eb', color: '#4b5563' },
  };
  const c = colors[statut];
  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        padding: '4px 12px',
        borderRadius: 4,
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      {STATUT_LABELS[statut]}
    </span>
  );
}

function formatDateFrCa(iso: string): string {
  return new Date(iso).toLocaleString('fr-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---- Styles ----

const mainStyle = {
  maxWidth: 900,
  margin: '32px auto',
  padding: '0 24px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center' as const,
  gap: 16,
  margin: '16px 0',
};

const subtitleStyle = { color: '#6b7280', margin: '4px 0 16px 0', fontSize: 14 };

const sectionStyle = { margin: '32px 0' };
const h2Style = { fontSize: 18, color: '#1f2937', margin: '0 0 12px 0' };

const dlStyle = {
  display: 'grid' as const,
  gridTemplateColumns: '180px 1fr',
  gap: '8px 16px',
  margin: 0,
};

const dtStyle = { fontWeight: 500, color: '#4b5563' };
const ddStyle = { margin: 0, color: '#1f2937' };
const ddMultilineStyle = { ...ddStyle, whiteSpace: 'pre-wrap' as const };
const ddMonospaceStyle = { ...ddStyle, fontFamily: 'monospace', fontSize: 12 };

const tableStyle = { width: '100%', borderCollapse: 'collapse' as const };

const thStyle = {
  textAlign: 'left' as const,
  padding: '8px 12px',
  borderBottom: '2px solid #d1d5db',
  background: '#f9fafb',
  fontSize: 13,
};

const tdStyle = { padding: '10px 12px', borderBottom: '1px solid #e5e7eb', fontSize: 14 };

const linkStyle = { color: '#2563eb', textDecoration: 'none' };

const errorStyle = { color: '#dc2626', padding: 16, background: '#fef2f2', borderRadius: 4 };

const alertStyle = {
  background: '#fff7ed',
  color: '#9a3412',
  border: '1px solid #fed7aa',
  borderRadius: 4,
  padding: '12px 16px',
  margin: '16px 0',
};

const alertAnonStyle = {
  background: '#f3f4f6',
  color: '#4b5563',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  padding: '12px 16px',
  margin: '16px 0',
};
