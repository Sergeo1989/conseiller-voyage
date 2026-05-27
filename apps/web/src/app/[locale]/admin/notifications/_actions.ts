// T130 — Server Actions admin notifications.
// removeFromSuppressionAction + retryDeadLetterAction.
// Validation Zod côté serveur (Principe IX).

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '../../../../auth';
import { apiClient, unwrapApi } from '../../../_lib/api-client';

const RemoveSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(10).max(1000),
});

const RetrySchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(10).max(1000),
});

export async function removeFromSuppressionAction(
  data: unknown,
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return { success: false, error: 'Accès non autorisé.' };
  }

  const parsed = RemoveSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  try {
    const path = `/api/admin/notifications/suppression-list/${parsed.data.id}/remove`;
    unwrapApi(await apiClient.post<void>(path, { reason: parsed.data.reason }), path);
    revalidatePath('/admin/notifications/suppression-list');
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function retryDeadLetterAction(
  data: unknown,
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return { success: false, error: 'Accès non autorisé.' };
  }

  const parsed = RetrySchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  try {
    const path = `/api/admin/notifications/dead-letter/${parsed.data.id}/retry`;
    unwrapApi(await apiClient.post<void>(path, { reason: parsed.data.reason }), path);
    revalidatePath('/admin/notifications/dead-letter');
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
