// Server Action — lecture du profil privé (pour la page édition).

'use server';

import { PROFIL_API_BASE_URL, getSessionCookieHeader } from '../lib/api';

export interface ProfilPriveDto {
  readonly profilId: string;
  readonly authUserId: string;
  readonly titre: string | null;
  readonly biographie: string | null;
  readonly anneesExperience: number | null;
  readonly afficherNomComplet: boolean;
  readonly specialitesCodes: readonly string[];
  readonly languesCodes: readonly string[];
  readonly zonesGeographiquesCodes: readonly string[];
  readonly photoUrlPublique: string | null;
  readonly photoWidth: number | null;
  readonly photoHeight: number | null;
  readonly nomLegal: { prenom: string; nom: string };
  readonly nomAffiche: string;
  readonly slug: string | null;
  readonly statut: 'incomplet' | 'pret' | 'masque_admin';
  readonly raisonMasquageAdmin: string | null;
  readonly verifie: boolean;
  readonly lastVerifiedAt: string | null;
  readonly champsManquants: readonly string[];
}

export async function lireProfilPriveAction(): Promise<ProfilPriveDto | null> {
  const cookieHeader = await getSessionCookieHeader();
  if (!cookieHeader) return null;
  const res = await fetch(`${PROFIL_API_BASE_URL}/api/profil/me`, {
    method: 'GET',
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
  });
  if (res.status !== 200) return null;
  return (await res.json().catch(() => null)) as ProfilPriveDto | null;
}
