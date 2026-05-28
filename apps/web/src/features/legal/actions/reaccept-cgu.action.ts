// Server Action — POST l'acceptation au backend, puis redirige vers
// l'espace conseiller. Le AuthGuard backend exige une session valide ;
// si elle manque, on redirige vers /login.
//
// Compliance Loi 25 (FR-018) : la chaîne `X-Forwarded-For` reçue par
// Next.js (CloudFront → Next.js) est propagée à l'API NestJS pour que
// `auth_legal_acceptances.ipAddress` reflète la VRAIE IP du conseiller,
// pas celle du serveur Next.js. La valeur sera ensuite masquée /24 ou
// /48 lors de l'anonymisation Loi 25 (ADR-0008).

'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

/** Construit le préfixe locale pour les redirects (préserve fr-CA / en). */
function getLocalePrefix(formLocale: string | null): '/fr' | '/en' {
  return formLocale === 'en' ? '/en' : '/fr';
}

export async function reacceptCguAction(formData: FormData): Promise<void> {
  const formLocale = (formData.get('locale') as string | null) ?? null;
  const prefix = getLocalePrefix(formLocale);

  const accepted = formData.get('accept');
  if (accepted !== 'on') {
    redirect(`${prefix}/cgu-conseiller/re-accepter?error=not_checked`);
  }

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
  if (apiBaseUrl.length === 0) {
    redirect(`${prefix}/cgu-conseiller/re-accepter?error=api_unavailable`);
  }

  // Récupère la version courante via l'endpoint public.
  const versionRes = await fetch(`${apiBaseUrl}/api/legal/cgu-b2b/current-version`, {
    method: 'GET',
  });
  if (!versionRes.ok) {
    redirect(`${prefix}/cgu-conseiller/re-accepter?error=version_lookup_failed`);
  }
  const { version } = (await versionRes.json()) as { version: number };

  // Propage le cookie de session pour que AuthGuard reconnaisse l'utilisateur.
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const headerStore = await headers();
  // FR-018 (Loi 25) : propage le X-Forwarded-For reçu par Next.js pour
  // que l'API NestJS enregistre la vraie IP utilisateur (pas celle du
  // serveur Next.js). En prod, TRUSTED_PROXY_HEADERS=true côté API
  // active la chaîne XFF.
  const incomingXff = headerStore.get('x-forwarded-for');
  const userAgent = headerStore.get('user-agent') ?? 'cv-web/legal-reaccept';
  const apiHeaders: Record<string, string> = {
    'content-type': 'application/json',
    cookie: cookieHeader,
    'user-agent': userAgent,
  };
  if (incomingXff !== null && incomingXff.length > 0) {
    apiHeaders['x-forwarded-for'] = incomingXff;
  }

  const acceptRes = await fetch(`${apiBaseUrl}/api/me/legal/accept`, {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({ documentVersion: version }),
  });

  if (acceptRes.status === 401) {
    redirect(`${prefix}/login?next=${prefix}/cgu-conseiller/re-accepter`);
  }
  if (!acceptRes.ok) {
    redirect(`${prefix}/cgu-conseiller/re-accepter?error=accept_failed`);
  }

  redirect(`${prefix}/conseiller`);
}
