// T015 [US3] — Server Actions pièces jointes (devis opaque, ADR-0002).
// Délèguent aux endpoints de 013 : upload pré-signé → finalize → URL de lecture
// signée courte. Le binaire ne transite jamais par l'API. Aucun montant.
//
// Note : ces actions complètent la couche d'accès ; le widget d'upload/téléchargement
// dans le fil est branché par incrément (les endpoints + actions sont prêts).

'use server';

import { apiClient } from '@/shared/lib/http';
import { type ActionResult, err, ok } from '@/shared/lib/result';

export async function createAttachmentUploadAction(input: {
  conversationId: string;
  messageId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ActionResult<{ attachmentId: string; uploadUrl: string; expiresInSec: number }>> {
  const res = await apiClient.post<{
    attachmentId: string;
    uploadUrl: string;
    expiresInSec: number;
  }>(`/api/matching/conseiller/conversations/${input.conversationId}/attachments`, {
    messageId: input.messageId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });
  return res.ok ? ok(res.data) : err('ATTACHMENT_UPLOAD_FAILED', message(res.errorBody));
}

export async function finalizeAttachmentAction(input: {
  conversationId: string;
  attachmentId: string;
}): Promise<ActionResult<{ ok: true }>> {
  const res = await apiClient.post<{ ok: true }>(
    `/api/matching/conseiller/conversations/${input.conversationId}/attachments/${input.attachmentId}/finalize`,
    {},
  );
  return res.ok ? ok(res.data) : err('ATTACHMENT_FINALIZE_FAILED', message(res.errorBody));
}

export async function getAttachmentUrlAction(input: {
  conversationId: string;
  attachmentId: string;
}): Promise<ActionResult<{ url: string; expiresInSec: number; fileName: string }>> {
  const res = await apiClient.get<{ url: string; expiresInSec: number; fileName: string }>(
    `/api/matching/conseiller/conversations/${input.conversationId}/attachments/${input.attachmentId}/url`,
  );
  return res.ok ? ok(res.data) : err('ATTACHMENT_URL_FAILED', message(res.errorBody));
}

function message(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>;
    if (typeof b.message === 'string') return b.message;
  }
  return 'Action sur la pièce jointe impossible. Réessayez.';
}
