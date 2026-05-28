'use client';

// T067 — Composant Upload photo profil (feature 007 US1).
//
// File picker JPEG/PNG/WebP ≤ 5 Mo, preview avant submit, gestion des erreurs
// retournées par uploaderPhotoAction (taille, format, contenu, dimensions).

import { type UploaderPhotoResult, uploaderPhotoAction } from '@/features/profil-conseiller';
import { useState, useTransition } from 'react';

interface PhotoUploadProps {
  readonly currentPhotoUrl: string | null;
  readonly currentPhotoWidth: number | null;
  readonly currentPhotoHeight: number | null;
}

const ACCEPTED_MIME = 'image/jpeg,image/png,image/webp';
const MAX_MB = 5;

const UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  format_non_supporte: 'Format non supporté. Utilisez JPEG, PNG ou WebP.',
  contenu_non_image: "Le fichier n'est pas une image valide.",
  dimensions_depasse: 'Image trop grande (maximum 4 096 × 4 096 pixels).',
  unauthorized: 'Session expirée. Veuillez vous reconnecter.',
  conflict: 'Profil indisponible.',
  storage_hs: 'Service de stockage temporairement indisponible. Réessayez plus tard.',
};

function formatUploadError(result: UploaderPhotoResult): string {
  if (result.kind === 'taille_depasse') {
    return `Fichier trop volumineux (${(result.tailleOctets / 1024 / 1024).toFixed(1)} Mo).`;
  }
  if (result.kind === 'error') return result.message;
  return UPLOAD_ERROR_MESSAGES[result.kind] ?? 'Erreur inconnue.';
}

export function PhotoUpload({
  currentPhotoUrl,
  currentPhotoWidth,
  currentPhotoHeight,
}: PhotoUploadProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentPhotoUrl);
  const [previewDim, setPreviewDim] = useState<{ width: number; height: number } | null>(
    currentPhotoWidth && currentPhotoHeight
      ? { width: currentPhotoWidth, height: currentPhotoHeight }
      : null,
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setError(null);
    setSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Fichier trop volumineux. Maximum ${MAX_MB} Mo.`);
      return;
    }

    // Preview optimiste — URL.createObjectURL.
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    const fd = new FormData();
    fd.set('file', file);

    startTransition(async () => {
      const result: UploaderPhotoResult = await uploaderPhotoAction(fd);
      URL.revokeObjectURL(objectUrl);
      handleResult(result);
    });
  };

  const handleResult = (result: UploaderPhotoResult): void => {
    if (result.kind === 'ok') {
      setPreviewUrl(result.photoUrlPublique);
      setPreviewDim({ width: result.photoWidth, height: result.photoHeight });
      setSuccess('Photo enregistrée.');
      return;
    }
    setError(formatUploadError(result));
  };

  return (
    <div>
      <p className="block text-sm font-medium text-slate-700">Photo de profil</p>
      <p className="mt-1 text-xs text-slate-500">JPEG, PNG ou WebP — {MAX_MB} Mo maximum.</p>

      {previewUrl && previewDim ? (
        <div className="mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Aperçu du profil conseiller"
            width={previewDim.width}
            height={previewDim.height}
            className="h-32 w-32 rounded-full object-cover ring-2 ring-slate-200"
          />
        </div>
      ) : (
        <div
          className="mt-2 h-32 w-32 rounded-full bg-slate-100 ring-2 ring-slate-200"
          aria-hidden
        />
      )}

      <label
        htmlFor="profil-photo-upload"
        className="mt-3 inline-block cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-blue-500"
      >
        {previewUrl ? 'Changer ma photo' : 'Téléverser ma photo'}
        <input
          id="profil-photo-upload"
          type="file"
          accept={ACCEPTED_MIME}
          onChange={handleChange}
          disabled={isPending}
          className="sr-only"
        />
      </label>

      {isPending && (
        <p className="mt-2 text-sm text-slate-600" aria-live="polite">
          Téléversement en cours…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {success && <output className="mt-2 block text-sm text-emerald-700">{success}</output>}
    </div>
  );
}
