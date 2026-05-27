// T126 — Layout admin notifications.
// Nav sidebar avec liens vers les 3 sections : suppression-list, dead-letter, audit.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '../../../../auth';
import type { Locale } from '../../../../i18n';

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ locale: Locale }>;
}

export default async function NotificationsAdminLayout({ children, params }: LayoutProps) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    const { locale } = await params;
    redirect(`/${locale}/connexion`);
  }

  return (
    <div className="flex min-h-screen">
      <nav
        aria-label="Navigation notifications admin"
        className="w-56 border-r bg-muted/30 p-4 shrink-0"
      >
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Notifications
        </h2>
        <ul className="space-y-1">
          <li>
            <Link
              href="suppression-list"
              className="block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Liste de suppression
            </Link>
          </li>
          <li>
            <Link
              href="dead-letter"
              className="block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Dead letter queue
            </Link>
          </li>
          <li>
            <Link
              href="audit"
              className="block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              Journal d&apos;audit
            </Link>
          </li>
        </ul>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
