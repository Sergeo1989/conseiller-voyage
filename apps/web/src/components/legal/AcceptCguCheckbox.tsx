// T072 — AcceptCguCheckbox (US3 P2).
//
// Composant client accessible WCAG 2.1 AA. À intégrer dans le formulaire
// signup conseiller (T074) et dans la page de ré-acceptation (T073).
//
// Accessibilité :
//   - Label explicitement associé via htmlFor
//   - aria-required pour signaler l'obligation au lecteur d'écran
//   - aria-invalid + aria-describedby quand error présent
//   - Message d'erreur en aria-live="polite" (annoncé sans interrompre)

'use client';

import { useId } from 'react';

interface AcceptCguCheckboxProps {
  /** Version courante du document à accepter — affichée à côté du lien */
  readonly documentVersion: number;
  /** Lien vers la version du CGU à lire avant acceptation (route i18n locale) */
  readonly readMoreHref: string;
  /** Valeur courante de la case (controlled / RHF register) */
  readonly checked: boolean;
  /** Handler de changement (depuis register('acceptedCgu')) */
  readonly onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Identifiant du champ pour register RHF — passer le `name` à utiliser */
  readonly name: string;
  /** Message d'erreur affiché si la case n'est pas cochée à la soumission */
  readonly errorMessage?: string;
  /** Texte explicatif optionnel (ex. cadre ré-acceptation) */
  readonly intro?: React.ReactNode;
}

export function AcceptCguCheckbox({
  documentVersion,
  readMoreHref,
  checked,
  onChange,
  name,
  errorMessage,
  intro,
}: AcceptCguCheckboxProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const hasError = Boolean(errorMessage);
  return (
    <div className="space-y-1">
      {intro ? <p className="text-sm text-muted-foreground">{intro}</p> : null}
      <label htmlFor={inputId} className="flex items-start gap-2 text-sm">
        <input
          id={inputId}
          name={name}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          aria-required="true"
          aria-invalid={hasError ? 'true' : 'false'}
          aria-describedby={hasError ? errorId : undefined}
          className="mt-1 size-4 shrink-0 rounded border-gray-300 text-primary focus:ring-2 focus:ring-primary"
        />
        <span>
          J&apos;ai lu et j&apos;accepte les{' '}
          <a
            href={readMoreHref}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            Conditions générales d&apos;utilisation (version {documentVersion})
          </a>
          .{' '}
          <span className="text-red-700" aria-hidden="true">
            *
          </span>
        </span>
      </label>
      {hasError ? (
        <p id={errorId} role="alert" aria-live="polite" className="text-xs text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
