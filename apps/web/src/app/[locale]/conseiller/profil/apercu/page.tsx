// T108 — Page Aperçu public depuis le dashboard (feature 007 US4).
//
// Server Component sous auth. Réutilise les composants visuels US2
// (ProfilHero, ProfilSections, BadgeVerifie) avec un BandeauApercu si
// le profil n'est pas en état d'être publié.

import { lireProfilApercuAction } from '@/features/profil-conseiller/actions/profil.actions';
import { BandeauApercu } from '@/features/profil-conseiller/ui/BandeauApercu';
import { BadgeVerifie } from '@/features/profil-public/ui/BadgeVerifie';
import { ProfilHero } from '@/features/profil-public/ui/ProfilHero';
import { redirect } from 'next/navigation';
import { auth } from '../../../../../auth';
import { type Locale, toUrlLocale } from '../../../../../i18n';

interface PageProps {
  params: Promise<{ locale: Locale }>;
}

export const metadata = {
  robots: { index: false, follow: false },
};

const SPECIALITES_LABELS: Record<string, string> = {
  croisiere: 'Croisière',
  famille: 'Famille',
  aventure: 'Aventure',
  luxe: 'Luxe',
  'lune-miel': 'Lune de miel',
  safari: 'Safari',
  ski: 'Ski',
  'plage-soleil': 'Plage et soleil',
  culturel: 'Voyage culturel',
  gastronomique: 'Voyage gastronomique',
  'voyage-solo': 'Voyage solo',
  ecotourisme: 'Écotourisme',
};

const LANGUES_LABELS: Record<string, string> = {
  fr: 'Français',
  en: 'Anglais',
  es: 'Espagnol',
  pt: 'Portugais',
  it: 'Italien',
  de: 'Allemand',
};

const ZONES_LABELS: Record<string, string> = {
  canada: 'Canada',
  'etats-unis': 'États-Unis',
  caraibes: 'Caraïbes',
  mexique: 'Mexique',
  'amerique-centrale': 'Amérique centrale',
  'amerique-sud': 'Amérique du Sud',
  'europe-ouest': "Europe de l'Ouest",
  'europe-est': "Europe de l'Est",
  'asie-sud-est': 'Asie du Sud-Est',
  'asie-orient': 'Extrême-Orient',
  'afrique-nord': 'Afrique du Nord',
  'afrique-australe': 'Afrique australe',
};

function expandCodes(
  codes: readonly string[],
  map: Record<string, string>,
): { code: string; label: string }[] {
  return codes.map((code) => ({ code, label: map[code] ?? code }));
}

export default async function ApercuPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/${toUrlLocale(locale)}/connexion`);
  }
  const apercu = await lireProfilApercuAction();
  if (!apercu) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-900">Aperçu impossible</h1>
        <p className="mt-4 text-slate-700">
          Votre profil n&apos;a pas encore été créé. Complétez votre conformité d&apos;abord.
        </p>
      </main>
    );
  }

  const { payloadPublic, bandeauApercu } = apercu;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {bandeauApercu && <BandeauApercu bandeau={bandeauApercu} />}

      {payloadPublic.photoUrlPublique && payloadPublic.photoWidth && payloadPublic.photoHeight && (
        <ProfilHero
          nomAffiche={payloadPublic.nomAffiche}
          titre={payloadPublic.titre}
          photoUrl={payloadPublic.photoUrlPublique}
          photoWidth={payloadPublic.photoWidth}
          photoHeight={payloadPublic.photoHeight}
        />
      )}

      <BadgeVerifie verifie={payloadPublic.verifieOPCTICO} />

      <div className="mt-8 space-y-6">
        {payloadPublic.biographie && (
          <section>
            <h2 className="text-xl font-semibold text-slate-900">À propos</h2>
            <p className="mt-2 whitespace-pre-wrap text-slate-700">{payloadPublic.biographie}</p>
          </section>
        )}
        <ChipList
          title="Spécialités"
          items={expandCodes(payloadPublic.specialitesCodes, SPECIALITES_LABELS)}
        />
        <ChipList title="Langues" items={expandCodes(payloadPublic.languesCodes, LANGUES_LABELS)} />
        <ChipList
          title="Zones d'expertise"
          items={expandCodes(payloadPublic.zonesGeographiquesCodes, ZONES_LABELS)}
        />
        {payloadPublic.anneesExperience !== null && (
          <section>
            <h2 className="text-xl font-semibold text-slate-900">Expérience</h2>
            <p className="mt-2 text-slate-700">
              {payloadPublic.anneesExperience === 1
                ? '1 an d’expérience'
                : `${payloadPublic.anneesExperience} ans d’expérience`}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

function ChipList({ title, items }: { title: string; items: { code: string; label: string }[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <li
            key={item.code}
            className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-sm text-slate-700"
          >
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
