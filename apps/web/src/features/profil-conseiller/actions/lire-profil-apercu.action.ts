// Server Action — lecture de l'aperçu profil conseiller (US4).
// Renvoie le payload public ET le bandeau d'aperçu (raison de non-publication
// + éléments manquants) pour la page /conseiller/profil/apercu.

'use server';

import { PROFIL_API_BASE_URL, getSessionCookieHeader } from '../lib/api';

export interface ProfilApercuDto {
  readonly payloadPublic: {
    readonly conseillerId: string;
    readonly slug: string | null;
    readonly nomAffiche: string;
    readonly titre: string | null;
    readonly biographie: string | null;
    readonly photoUrlPublique: string | null;
    readonly photoWidth: number | null;
    readonly photoHeight: number | null;
    readonly specialitesCodes: readonly string[];
    readonly languesCodes: readonly string[];
    readonly zonesGeographiquesCodes: readonly string[];
    readonly anneesExperience: number | null;
    readonly verifieOPCTICO: boolean;
  };
  readonly bandeauApercu: {
    readonly type: 'profil_incomplet' | 'non_verifie' | 'masque_admin' | 'anonymise';
    readonly elementsManquants: readonly string[];
    readonly raisonMasquage: string | null;
  } | null;
}

export async function lireProfilApercuAction(): Promise<ProfilApercuDto | null> {
  const cookieHeader = await getSessionCookieHeader();
  if (!cookieHeader) return null;
  const res = await fetch(`${PROFIL_API_BASE_URL}/api/profil/apercu`, {
    method: 'GET',
    headers: { Cookie: cookieHeader },
    cache: 'no-store',
  });
  if (res.status !== 200) return null;
  return (await res.json().catch(() => null)) as ProfilApercuDto | null;
}
