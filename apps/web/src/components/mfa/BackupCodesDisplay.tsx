'use client';

// BackupCodesDisplay — affichage one-shot des 10 codes de récupération
// (FR-005). Contraste ≥ 7:1 (Principe XI). Boutons « Télécharger .txt »
// et « Copier dans le presse-papier ».

import { useState } from 'react';

export interface BackupCodesDisplayProps {
  readonly codes: readonly string[];
}

export function BackupCodesDisplay({ codes }: BackupCodesDisplayProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
    }
  };

  const handleDownload = (): void => {
    const blob = new Blob(
      [
        '# Codes de récupération MFA — Conseiller Voyage\n',
        "# Conservez ce fichier en lieu sûr. Chaque code n'est utilisable qu'une seule fois.\n",
        '# Ces codes ne seront jamais ré-affichés.\n\n',
        codes.join('\n'),
        '\n',
      ],
      { type: 'text/plain;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'codes-de-recuperation-conseiller-voyage.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-labelledby="backup-codes-heading"
      className="rounded-lg border border-amber-300 bg-amber-50 p-6"
    >
      <h3 id="backup-codes-heading" className="mb-2 text-lg font-semibold text-amber-900">
        Vos 10 codes de récupération
      </h3>
      <p className="mb-4 text-sm text-amber-900">
        Conservez ces codes en lieu sûr. Ils servent à vous reconnecter si vous perdez votre device.
        <strong> Chaque code n'est utilisable qu'une seule fois.</strong> Ces codes ne seront jamais
        ré-affichés.
      </p>
      <section
        aria-label="Liste des codes de récupération"
        className="mb-4 grid grid-cols-2 gap-2 rounded bg-white p-4 font-mono text-base font-semibold tracking-wider text-slate-900"
      >
        {codes.map((code, i) => (
          <code key={code} className="block" aria-label={`Code numéro ${i + 1} : ${code}`}>
            <span className="inline-block w-6 text-right text-slate-500" aria-hidden="true">
              {i + 1}.
            </span>{' '}
            {code}
          </code>
        ))}
      </section>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDownload}
          className="rounded bg-amber-900 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-900/30"
        >
          Télécharger en .txt
        </button>
        <button
          type="button"
          onClick={handleCopy}
          aria-live="polite"
          className="rounded border border-amber-900 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-900/30"
        >
          {copyState === 'copied' ? 'Copié ✓' : 'Copier dans le presse-papier'}
        </button>
        {copyState === 'error' && (
          <span role="alert" className="text-sm text-red-700">
            Copie indisponible — utilisez le téléchargement.
          </span>
        )}
      </div>
    </section>
  );
}
