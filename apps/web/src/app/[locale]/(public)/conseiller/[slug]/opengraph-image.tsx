// T087 — OG image dynamique pour la page publique conseiller.
//
// Next.js 15 — `ImageResponse` génère une image PNG 1200×630 (standard OG)
// à partir du JSX. Re-générée à chaque revalidatePath (ISR aligné sur la
// page). Coût compute acceptable car cacheable CDN long terme.

import { lireProfilPublicBySlug } from '@/features/profil-public';
import type { Locale } from '@/i18n';
import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface ImageProps {
  params: Promise<{ locale: Locale; slug: string }>;
}

export default async function Image({ params }: ImageProps) {
  const { slug } = await params;
  const profil = await lireProfilPublicBySlug(slug);
  if (!profil) {
    return new ImageResponse(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#fff',
          fontSize: 64,
        }}
      >
        Conseiller Voyage
      </div>,
      size,
    );
  }

  const specialitePrincipale = profil.specialites[0]?.label ?? '';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
        color: '#fff',
        padding: 80,
      }}
    >
      <div style={{ fontSize: 96, fontWeight: 700, marginBottom: 24 }}>{profil.nomAffiche}</div>
      {specialitePrincipale && (
        <div style={{ fontSize: 48, opacity: 0.9 }}>{specialitePrincipale}</div>
      )}
      <div style={{ fontSize: 28, marginTop: 64, opacity: 0.7 }}>Conseiller Voyage</div>
    </div>,
    size,
  );
}
