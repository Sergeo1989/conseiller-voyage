// T112 — Page /voyage/supprime — neutre post-effacement brief seul.

import { BriefDeletedNotice } from '@/features/intake';
import type { ReactNode } from 'react';

export default function BriefSupprimePage(): ReactNode {
  return (
    <main className="container mx-auto max-w-2xl px-4 py-8">
      <BriefDeletedNotice />
    </main>
  );
}
