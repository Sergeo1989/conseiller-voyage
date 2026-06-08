// T034 [Polish] — Lien vers une pièce jointe (devis opaque). Présentationnel :
// l'URL signée courte est résolue par le parent (endpoint dédié, durée limitée).
// Aucun montant affiché — le fichier est opaque (ADR-0002).

import type { AttachmentView } from '@cv/shared/matching';
import { useTranslations } from 'next-intl';

interface AttachmentLinkProps {
  readonly attachment: AttachmentView;
  /** URL signée déjà résolue, ou undefined (rendu non cliquable). */
  readonly href?: string;
}

export function AttachmentLink({ attachment, href }: AttachmentLinkProps) {
  const t = useTranslations('conversation');
  if (!attachment.available) {
    return (
      <span className="text-sm text-gray-400 italic">
        {attachment.fileName} — {t('attachmentUnavailable')}
      </span>
    );
  }
  if (!href) {
    return <span className="text-sm text-gray-700">{attachment.fileName}</span>;
  }
  return (
    <a
      href={href}
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm text-blue-700 underline hover:text-blue-900"
    >
      {attachment.fileName}
      <span className="sr-only"> — {t('download')}</span>
    </a>
  );
}
