// T092 — Endpoint /api/revalidate Next.js (feature 007).
//
// Callback authentifié (Bearer secret) consommé par les listeners côté
// apps/api/src/modules/identite/application/listeners/* (T093) lors
// des transitions de statut profil (publish / depublish / masque /
// anonymise / update). Invalide le cache Next.js ISR ; en parallèle,
// le listener invalide aussi CloudFront (C2 — double invalidation).
//
// POST /api/revalidate
// Headers : Authorization: Bearer <CV_REVALIDATE_SECRET>
// Body    : { path: string } | { tag: string }

import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

interface RevalidateBody {
  readonly path?: string;
  readonly tag?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.CV_REVALIDATE_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: 'NOT_CONFIGURED' }, { status: 500 });
  }

  const auth = req.headers.get('authorization');
  if (!auth || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as RevalidateBody | null;
  if (!body || (!body.path && !body.tag)) {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }

  if (body.path) revalidatePath(body.path, 'page');
  if (body.tag) revalidateTag(body.tag);
  return NextResponse.json({ revalidated: true, target: body.path ?? body.tag });
}
