'use client';

// T069 — Toggle afficherNomComplet (FR-006a + FR-006b avertissement Loi 25).
//
// Affiche l'aperçu du nom qui sera publié (Marie D. vs Marie Dupont) +
// un avertissement explicite avant activation (FR-006b) : indexation
// Google persistante même après effacement Loi 25.

import { useState } from 'react';

interface AfficherNomCompletSwitchProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly nomLegalPrenom: string;
  readonly nomLegalNom: string;
}

function initialeNom(nomLegal: string): string {
  // Skip particules nobiliaires + prendre l'initiale du premier mot
  // non-particule (cf. formaterNomAffiche du domaine pur).
  const PARTICULES = new Set(['de', 'du', 'la', 'le', 'des']);
  const mots = nomLegal.trim().split(/\s+/);
  for (const mot of mots) {
    if (PARTICULES.has(mot.toLowerCase())) continue;
    const sousMot = mot.split('-')[0] ?? mot;
    if (sousMot.length > 0) return sousMot.charAt(0).toUpperCase();
  }
  const dernier = mots[mots.length - 1];
  return dernier && dernier.length > 0 ? dernier.charAt(0).toUpperCase() : '';
}

export function AfficherNomCompletSwitch({
  checked,
  onChange,
  nomLegalPrenom,
  nomLegalNom,
}: AfficherNomCompletSwitchProps) {
  const [confirmingActivation, setConfirmingActivation] = useState(false);

  const nomCompact = `${nomLegalPrenom} ${initialeNom(nomLegalNom)}.`;
  const nomComplet = `${nomLegalPrenom} ${nomLegalNom}`;

  const handleChange = (next: boolean): void => {
    // Avertissement uniquement à l'activation (false → true).
    if (next && !checked) {
      setConfirmingActivation(true);
      return;
    }
    onChange(next);
  };

  const confirmActivation = (): void => {
    setConfirmingActivation(false);
    onChange(true);
  };

  return (
    <fieldset className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <legend className="px-1 text-sm font-medium text-slate-700">Affichage du nom public</legend>

      <div className="mt-2 flex items-start gap-3">
        <input
          id="afficher-nom-complet"
          type="checkbox"
          checked={checked}
          onChange={(e) => handleChange(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <div className="flex-1">
          <label htmlFor="afficher-nom-complet" className="block text-sm text-slate-800">
            Afficher mon nom de famille complet sur ma page publique
          </label>
          <p className="mt-1 text-xs text-slate-600">
            Aperçu — <strong>{checked ? nomComplet : nomCompact}</strong>
          </p>
        </div>
      </div>

      {confirmingActivation && (
        <div
          role="alertdialog"
          aria-labelledby="afficher-nom-warning-title"
          className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900"
        >
          <p id="afficher-nom-warning-title" className="text-sm font-medium">
            Avant d&apos;activer cette option (FR-006b)
          </p>
          <p className="mt-1 text-xs">
            En affichant votre nom complet, vous acceptez son indexation par les moteurs de
            recherche (Google, Bing). Cette indexation persiste plusieurs semaines même après une
            demande d&apos;effacement Loi 25 (cache moteur). L&apos;URL de votre page publique reste
            basée sur votre nom légal indépendamment de ce choix.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={confirmActivation}
              className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
            >
              J&apos;accepte, activer
            </button>
            <button
              type="button"
              onClick={() => setConfirmingActivation(false)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </fieldset>
  );
}
