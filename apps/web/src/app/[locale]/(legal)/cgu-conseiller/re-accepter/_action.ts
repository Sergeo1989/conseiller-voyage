// Server Action — POST l'acceptation au backend, puis redirige vers
// l'espace conseiller. Le AuthGuard backend exige une session valide ;
// si elle manque, on redirige vers /login.

'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

export async function reacceptCguAction(formData: FormData): Promise<void> {
  const accepted = formData.get('accept');
  if (accepted !== 'on') {
    redirect('/fr/cgu-conseiller/re-accepter?error=not_checked');
  }

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
  if (apiBaseUrl.length === 0) {
    redirect('/fr/cgu-conseiller/re-accepter?error=api_unavailable');
  }

  // Récupère la version courante via l'endpoint public.
  const versionRes = await fetch(`${apiBaseUrl}/api/legal/cgu-b2b/current-version`, {
    method: 'GET',
  });
  if (!versionRes.ok) {
    redirect('/fr/cgu-conseiller/re-accepter?error=version_lookup_failed');
  }
  const { version } = (await versionRes.json()) as { version: number };

  // Propage le cookie de session pour que AuthGuard reconnaisse l'utilisateur.
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const headerStore = await headers();
  const acceptRes = await fetch(`${apiBaseUrl}/api/me/legal/accept`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader,
      'user-agent': headerStore.get('user-agent') ?? 'cv-web/legal-reaccept',
    },
    body: JSON.stringify({ documentVersion: version }),
  });

  if (acceptRes.status === 401) {
    redirect('/fr/login?next=/fr/cgu-conseiller/re-accepter');
  }
  if (!acceptRes.ok) {
    redirect('/fr/cgu-conseiller/re-accepter?error=accept_failed');
  }

  redirect('/fr/conseiller');
}
