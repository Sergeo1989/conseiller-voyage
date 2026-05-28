'use client';

// T066-T069 — Form édition profil (feature 007 US1).
//
// Composant client unifié qui regroupe :
//   - Champs textes (titre, biographie avec compteur)
//   - Années d'expérience (number)
//   - Multi-select spécialités / langues / zones
//   - Toggle afficherNomComplet avec avertissement FR-006b (Loi 25)
//   - Upload photo (sous-composant PhotoUpload)
//   - useActionState (React 19) pour les Server Actions
//
// Validation client-side : react-hook-form + zod resolver (DTO partagé).
// Erreurs serveur : affichées par champ via aria-describedby.

import type {
  EditerProfilResult,
  ProfilPriveDto,
} from '@/features/profil-conseiller/actions/profil.actions';
import { editerProfilAction } from '@/features/profil-conseiller/actions/profil.actions';
import { EditerProfilDto } from '@cv/profil-domain/dtos';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { AfficherNomCompletSwitch } from './AfficherNomCompletSwitch';
import { PhotoUpload } from './PhotoUpload';

type FormValues = z.infer<typeof EditerProfilDto>;

interface ProfilFormProps {
  readonly initialData: ProfilPriveDto;
}

const SPECIALITES_DEFAUT = [
  { code: 'croisiere', label: 'Croisière' },
  { code: 'famille', label: 'Famille' },
  { code: 'aventure', label: 'Aventure' },
  { code: 'luxe', label: 'Luxe' },
  { code: 'lune-miel', label: 'Lune de miel' },
  { code: 'safari', label: 'Safari' },
  { code: 'ski', label: 'Ski' },
  { code: 'plage-soleil', label: 'Plage et soleil' },
  { code: 'culturel', label: 'Voyage culturel' },
  { code: 'gastronomique', label: 'Voyage gastronomique' },
  { code: 'voyage-solo', label: 'Voyage solo' },
  { code: 'ecotourisme', label: 'Écotourisme' },
];

const LANGUES_DEFAUT = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'Anglais' },
  { code: 'es', label: 'Espagnol' },
  { code: 'pt', label: 'Portugais' },
  { code: 'it', label: 'Italien' },
  { code: 'de', label: 'Allemand' },
];

const ZONES_DEFAUT = [
  { code: 'canada', label: 'Canada' },
  { code: 'etats-unis', label: 'États-Unis' },
  { code: 'caraibes', label: 'Caraïbes' },
  { code: 'mexique', label: 'Mexique' },
  { code: 'amerique-centrale', label: 'Amérique centrale' },
  { code: 'amerique-sud', label: 'Amérique du Sud' },
  { code: 'europe-ouest', label: "Europe de l'Ouest" },
  { code: 'europe-est', label: "Europe de l'Est" },
  { code: 'asie-sud-est', label: 'Asie du Sud-Est' },
  { code: 'asie-orient', label: 'Extrême-Orient' },
  { code: 'afrique-nord', label: 'Afrique du Nord' },
  { code: 'afrique-australe', label: 'Afrique australe' },
];

function buildFormData(data: FormValues): FormData {
  const fd = new FormData();
  setIfDefined(fd, 'titre', data.titre);
  setIfDefined(fd, 'biographie', data.biographie);
  setIfDefined(fd, 'anneesExperience', data.anneesExperience);
  fd.set('afficherNomComplet', data.afficherNomComplet ? 'true' : 'false');
  appendArray(fd, 'specialitesCodes', data.specialitesCodes);
  appendArray(fd, 'languesCodes', data.languesCodes);
  appendArray(fd, 'zonesGeographiquesCodes', data.zonesGeographiquesCodes);
  return fd;
}

function setIfDefined(fd: FormData, key: string, value: string | number | null | undefined): void {
  if (value !== undefined && value !== null) fd.set(key, String(value));
}

function appendArray(fd: FormData, key: string, values: readonly string[] | undefined): void {
  for (const v of values ?? []) fd.append(key, v);
}

const EDITER_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Session expirée. Veuillez vous reconnecter.',
  service_unavailable: 'Service temporairement indisponible. Réessayez plus tard.',
};

function formatEditerError(result: EditerProfilResult): string {
  if (result.kind === 'validation_error') return `${result.champ} : ${result.messageFr}`;
  if (result.kind === 'conflict') {
    return result.code === 'PROFIL_ANONYMISE'
      ? 'Ce profil a été anonymisé.'
      : 'Profil introuvable.';
  }
  if (result.kind === 'error') return result.message;
  return EDITER_ERROR_MESSAGES[result.kind] ?? 'Erreur inconnue.';
}

function toDefaultValues(initialData: ProfilPriveDto): FormValues {
  return {
    titre: initialData.titre,
    biographie: initialData.biographie,
    anneesExperience: initialData.anneesExperience,
    afficherNomComplet: initialData.afficherNomComplet,
    specialitesCodes: [...initialData.specialitesCodes],
    languesCodes: [...initialData.languesCodes],
    zonesGeographiquesCodes: [...initialData.zonesGeographiquesCodes],
  };
}

export function ProfilForm({ initialData }: ProfilFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(EditerProfilDto),
    defaultValues: toDefaultValues(initialData),
  });

  const biographie = watch('biographie') ?? '';
  const afficherNomComplet = watch('afficherNomComplet') ?? false;

  const onSubmit = (data: FormValues): void => {
    setServerError(null);
    setSuccessMsg(null);
    const fd = buildFormData(data);
    startTransition(async () => {
      const result: EditerProfilResult = await editerProfilAction(fd);
      handleResult(result);
    });
  };

  const handleResult = (result: EditerProfilResult): void => {
    if (result.kind === 'ok') {
      setSuccessMsg('Profil enregistré.');
      router.refresh();
      return;
    }
    setServerError(formatEditerError(result));
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-6">
      {/* Photo */}
      <PhotoUpload
        currentPhotoUrl={initialData.photoUrlPublique}
        currentPhotoWidth={initialData.photoWidth}
        currentPhotoHeight={initialData.photoHeight}
      />

      <TextFieldsBlock register={register} errors={errors} biographieLength={biographie.length} />

      <MultiSelectsGroup
        watch={watch}
        setValue={setValue}
        errorSpecialites={errors.specialitesCodes?.message}
        errorLangues={errors.languesCodes?.message}
        errorZones={errors.zonesGeographiquesCodes?.message}
      />

      <AnneesExperienceField register={register} errors={errors} />

      {/* Toggle afficherNomComplet (FR-006b avertissement Loi 25) */}
      <AfficherNomCompletSwitch
        checked={afficherNomComplet}
        onChange={(v) => setValue('afficherNomComplet', v, { shouldDirty: true })}
        nomLegalPrenom={initialData.nomLegal.prenom}
        nomLegalNom={initialData.nomLegal.nom}
      />

      {/* Erreur / succès serveur */}
      {serverError && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">
          {serverError}
        </div>
      )}
      {successMsg && (
        <output className="block rounded-md border border-emerald-300 bg-emerald-50 p-3 text-emerald-800">
          {successMsg}
        </output>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-blue-600 px-4 py-2 text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {isPending ? 'Enregistrement…' : 'Sauvegarder'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------
// MultiSelectField (T068) — inline car spécifique au form
// ---------------------------------------------------------------------

interface MultiSelectOption {
  readonly code: string;
  readonly label: string;
}

interface MultiSelectFieldProps {
  readonly label: string;
  readonly helpText: string;
  readonly options: readonly MultiSelectOption[];
  readonly selectedCodes: readonly string[];
  readonly onChange: (codes: string[]) => void;
  readonly errorMessage: string | undefined;
  readonly max: number;
}

function MultiSelectField({
  label,
  helpText,
  options,
  selectedCodes,
  onChange,
  errorMessage,
  max,
}: MultiSelectFieldProps) {
  const toggle = (code: string): void => {
    if (selectedCodes.includes(code)) {
      onChange(selectedCodes.filter((c) => c !== code));
    } else if (selectedCodes.length < max) {
      onChange([...selectedCodes, code]);
    }
  };

  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">{label}</legend>
      <p className="mt-1 text-xs text-slate-500">{helpText}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = selectedCodes.includes(opt.code);
          return (
            <button
              key={opt.code}
              type="button"
              onClick={() => toggle(opt.code)}
              aria-pressed={selected}
              className={`rounded-full border px-3 py-1 text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                selected
                  ? 'border-blue-600 bg-blue-50 text-blue-900'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {errorMessage && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {errorMessage}
        </p>
      )}
    </fieldset>
  );
}

interface TextFieldsBlockProps {
  readonly register: ReturnType<typeof useForm<FormValues>>['register'];
  readonly errors: ReturnType<typeof useForm<FormValues>>['formState']['errors'];
  readonly biographieLength: number;
}

function TextFieldsBlock({ register, errors, biographieLength }: TextFieldsBlockProps) {
  return (
    <>
      <div>
        <label htmlFor="titre" className="block text-sm font-medium text-slate-700">
          Titre / accroche
        </label>
        <input
          id="titre"
          type="text"
          maxLength={80}
          placeholder="Conseillère spécialisée croisières et famille"
          {...register('titre')}
          aria-invalid={errors.titre ? 'true' : 'false'}
          aria-describedby={errors.titre ? 'titre-error' : undefined}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
        {errors.titre && (
          <p id="titre-error" className="mt-1 text-sm text-red-700">
            {errors.titre.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="biographie" className="block text-sm font-medium text-slate-700">
          Biographie
        </label>
        <p className="mt-1 text-xs text-slate-500">
          Entre 100 et 2 000 caractères. Décrivez votre approche, votre expérience, vos passions.
        </p>
        <textarea
          id="biographie"
          rows={6}
          maxLength={2000}
          {...register('biographie')}
          aria-invalid={errors.biographie ? 'true' : 'false'}
          aria-describedby="biographie-counter biographie-error"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
        <p id="biographie-counter" className="mt-1 text-xs text-slate-500" aria-live="polite">
          {biographieLength} / 2000
        </p>
        {errors.biographie && (
          <p id="biographie-error" className="mt-1 text-sm text-red-700">
            {errors.biographie.message}
          </p>
        )}
      </div>
    </>
  );
}

interface AnneesExperienceFieldProps {
  readonly register: ReturnType<typeof useForm<FormValues>>['register'];
  readonly errors: ReturnType<typeof useForm<FormValues>>['formState']['errors'];
}

function AnneesExperienceField({ register, errors }: AnneesExperienceFieldProps) {
  return (
    <div>
      <label htmlFor="anneesExperience" className="block text-sm font-medium text-slate-700">
        Années d&apos;expérience
      </label>
      <input
        id="anneesExperience"
        type="number"
        min={0}
        max={60}
        {...register('anneesExperience', { valueAsNumber: true })}
        aria-invalid={errors.anneesExperience ? 'true' : 'false'}
        aria-describedby={errors.anneesExperience ? 'annees-error' : undefined}
        className="mt-1 block w-32 rounded-md border border-slate-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
      />
      {errors.anneesExperience && (
        <p id="annees-error" className="mt-1 text-sm text-red-700">
          {errors.anneesExperience.message}
        </p>
      )}
    </div>
  );
}

interface MultiSelectsGroupProps {
  readonly watch: ReturnType<typeof useForm<FormValues>>['watch'];
  readonly setValue: ReturnType<typeof useForm<FormValues>>['setValue'];
  readonly errorSpecialites: string | undefined;
  readonly errorLangues: string | undefined;
  readonly errorZones: string | undefined;
}

function MultiSelectsGroup({
  watch,
  setValue,
  errorSpecialites,
  errorLangues,
  errorZones,
}: MultiSelectsGroupProps) {
  return (
    <>
      <MultiSelectField
        label="Spécialités"
        helpText="1 à 8 spécialités."
        options={SPECIALITES_DEFAUT}
        selectedCodes={watch('specialitesCodes') ?? []}
        onChange={(codes) => setValue('specialitesCodes', codes, { shouldValidate: true })}
        errorMessage={errorSpecialites}
        max={8}
      />
      <MultiSelectField
        label="Langues parlées"
        helpText="1 à 6 langues."
        options={LANGUES_DEFAUT}
        selectedCodes={watch('languesCodes') ?? []}
        onChange={(codes) => setValue('languesCodes', codes, { shouldValidate: true })}
        errorMessage={errorLangues}
        max={6}
      />
      <MultiSelectField
        label="Zones géographiques d'expertise"
        helpText="1 à 12 zones."
        options={ZONES_DEFAUT}
        selectedCodes={watch('zonesGeographiquesCodes') ?? []}
        onChange={(codes) => setValue('zonesGeographiquesCodes', codes, { shouldValidate: true })}
        errorMessage={errorZones}
        max={12}
      />
    </>
  );
}
