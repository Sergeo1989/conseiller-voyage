// T076 — Composant client du formulaire de soumission multi-étapes.
// Gère localement l'état des 4 étapes (consentement → certs → affils →
// confirmation) et orchestre le 2-phase upload :
//   1. Server Action requestUploadUrlsAction → presigned URLs S3
//   2. PUT direct côté navigateur (fetch) vers S3
//   3. Server Action submitDossierAction → POST dossier avec uploadIds

'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { requestUploadUrlsAction, submitDossierAction } from './actions';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'] as const;
type AllowedMime = (typeof ALLOWED_MIME)[number];

interface CertificateDraft {
  province: 'QC' | 'ON';
  certificateNumber: string;
  issuedAt: string;
  expiresAt: string;
  file: File | null;
}

interface AffiliationDraft {
  agencyName: string;
  agencyPermitNumber: string;
  agencyProvince: 'QC' | 'ON';
  role: string;
  activeSince: string;
  file: File | null;
}

type SubmissionPhase = 'editing' | 'submitting' | 'success' | 'error';

export function SubmitDossierForm(): JSX.Element {
  const t = useTranslations('conformite.conseiller.submit');
  const tShared = useTranslations('conformite.shared');
  const tCommon = useTranslations();

  const [consentGiven, setConsentGiven] = useState(false);
  const [certificates, setCertificates] = useState<CertificateDraft[]>([emptyCertificate('QC')]);
  const [affiliations, setAffiliations] = useState<AffiliationDraft[]>([emptyAffiliation('QC')]);
  const [phase, setPhase] = useState<SubmissionPhase>('editing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setErrorMessage(null);

    const clientError = validateClient(consentGiven, certificates, affiliations, t);
    if (clientError) {
      setErrorMessage(clientError);
      return;
    }

    setPhase('submitting');
    try {
      const allFiles = collectFiles(certificates, affiliations);
      const uploads = await requestUploads(allFiles);
      await putToS3(allFiles, uploads);
      await submitDossier(uploads);
      setPhase('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : tCommon('errors.networkError'));
      setPhase('error');
    }
  }

  async function requestUploads(
    allFiles: ReadonlyArray<{ purpose: 'certificat' | 'preuve_affiliation'; file: File }>,
  ): Promise<
    ReadonlyArray<{
      uploadId: string;
      presignedUrl: string;
      requiredHeaders: Record<string, string>;
    }>
  > {
    const res = await requestUploadUrlsAction({
      files: allFiles.map(({ purpose, file }) => ({
        purpose,
        contentType: file.type as AllowedMime,
        contentLength: file.size,
      })),
    });
    if (!res.ok) throw new Error(res.error);
    return res.data.uploads;
  }

  async function submitDossier(uploads: ReadonlyArray<{ uploadId: string }>): Promise<void> {
    const certUploadIds = uploads.slice(0, certificates.length);
    const affilUploadIds = uploads.slice(certificates.length);
    const res = await submitDossierAction({
      consentGiven: true as const,
      certificates: certificates.map((c, i) => ({
        province: c.province,
        certificateNumber: c.certificateNumber,
        issuedAt: new Date(c.issuedAt).toISOString(),
        expiresAt: new Date(c.expiresAt).toISOString(),
        documentUploadId: certUploadIds[i]?.uploadId ?? '',
      })),
      affiliations: affiliations.map((a, i) => ({
        agencyName: a.agencyName,
        agencyPermitNumber: a.agencyPermitNumber,
        agencyProvince: a.agencyProvince,
        proofUploadId: affilUploadIds[i]?.uploadId ?? '',
        ...(a.role && { role: a.role }),
        ...(a.activeSince && { activeSince: new Date(a.activeSince).toISOString() }),
      })),
    });
    if (!res.ok) throw new Error(res.error);
  }

  if (phase === 'success') {
    return (
      <section style={successStyle}>
        <h2>{t('successTitle')}</h2>
        <p>{t('successMessage')}</p>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={phase === 'submitting'}>
      {/* Step 1 — Consentement */}
      <section style={stepStyle} aria-labelledby="step1">
        <h2 id="step1">{t('step1Title')}</h2>
        <p>{t('step1Description')}</p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={consentGiven}
            onChange={(e) => setConsentGiven(e.target.checked)}
            required
          />
          <span>{t('consentLabel')}</span>
        </label>
      </section>

      {/* Step 2 — Certificats */}
      <section style={stepStyle} aria-labelledby="step2">
        <h2 id="step2">{t('step2Title')}</h2>
        {certificates.map((cert, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: order is stable, deletion uses splice
          <fieldset key={i} style={fieldsetStyle}>
            <legend>#{i + 1}</legend>
            <label style={fieldLabelStyle}>
              {t('certificateNumber')}
              <input
                type="text"
                value={cert.certificateNumber}
                onChange={(e) =>
                  updateCert(setCertificates, i, { certificateNumber: e.target.value })
                }
                required
              />
            </label>
            <label style={fieldLabelStyle}>
              {tShared('provinceQC')} / {tShared('provinceON')}
              <select
                value={cert.province}
                onChange={(e) =>
                  updateCert(setCertificates, i, { province: e.target.value as 'QC' | 'ON' })
                }
              >
                <option value="QC">{tShared('provinceQC')}</option>
                <option value="ON">{tShared('provinceON')}</option>
              </select>
            </label>
            <label style={fieldLabelStyle}>
              {t('issuedAt')}
              <input
                type="date"
                value={cert.issuedAt}
                onChange={(e) => updateCert(setCertificates, i, { issuedAt: e.target.value })}
                required
              />
            </label>
            <label style={fieldLabelStyle}>
              {t('expiresAt')}
              <input
                type="date"
                value={cert.expiresAt}
                onChange={(e) => updateCert(setCertificates, i, { expiresAt: e.target.value })}
                required
              />
            </label>
            <label style={fieldLabelStyle}>
              {t('documentFile')}
              <input
                type="file"
                accept={ALLOWED_MIME.join(',')}
                onChange={(e) =>
                  updateCert(setCertificates, i, { file: e.target.files?.[0] ?? null })
                }
                required
              />
            </label>
            {certificates.length > 1 && (
              <button
                type="button"
                onClick={() => setCertificates((prev) => prev.filter((_, idx) => idx !== i))}
              >
                {t('removeCertificate')}
              </button>
            )}
          </fieldset>
        ))}
        {certificates.length < 2 && (
          <button
            type="button"
            onClick={() => setCertificates((prev) => [...prev, emptyCertificate('ON')])}
          >
            {t('addCertificate')}
          </button>
        )}
      </section>

      {/* Step 3 — Affiliations */}
      <section style={stepStyle} aria-labelledby="step3">
        <h2 id="step3">{t('step3Title')}</h2>
        {affiliations.map((aff, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: order is stable, deletion uses splice
          <fieldset key={i} style={fieldsetStyle}>
            <legend>#{i + 1}</legend>
            <label style={fieldLabelStyle}>
              {t('agencyName')}
              <input
                type="text"
                value={aff.agencyName}
                onChange={(e) => updateAffil(setAffiliations, i, { agencyName: e.target.value })}
                required
              />
            </label>
            <label style={fieldLabelStyle}>
              {t('agencyPermitNumber')}
              <input
                type="text"
                value={aff.agencyPermitNumber}
                onChange={(e) =>
                  updateAffil(setAffiliations, i, { agencyPermitNumber: e.target.value })
                }
                required
              />
            </label>
            <label style={fieldLabelStyle}>
              {t('agencyProvince')}
              <select
                value={aff.agencyProvince}
                onChange={(e) =>
                  updateAffil(setAffiliations, i, { agencyProvince: e.target.value as 'QC' | 'ON' })
                }
              >
                <option value="QC">{tShared('provinceQC')}</option>
                <option value="ON">{tShared('provinceON')}</option>
              </select>
            </label>
            <label style={fieldLabelStyle}>
              {t('role')}
              <input
                type="text"
                value={aff.role}
                onChange={(e) => updateAffil(setAffiliations, i, { role: e.target.value })}
              />
            </label>
            <label style={fieldLabelStyle}>
              {t('activeSince')}
              <input
                type="date"
                value={aff.activeSince}
                onChange={(e) => updateAffil(setAffiliations, i, { activeSince: e.target.value })}
              />
            </label>
            <label style={fieldLabelStyle}>
              {t('proofFile')}
              <input
                type="file"
                accept={ALLOWED_MIME.join(',')}
                onChange={(e) =>
                  updateAffil(setAffiliations, i, { file: e.target.files?.[0] ?? null })
                }
                required
              />
            </label>
            {affiliations.length > 1 && (
              <button
                type="button"
                onClick={() => setAffiliations((prev) => prev.filter((_, idx) => idx !== i))}
              >
                {t('removeAffiliation')}
              </button>
            )}
          </fieldset>
        ))}
        {affiliations.length < 5 && (
          <button
            type="button"
            onClick={() => setAffiliations((prev) => [...prev, emptyAffiliation('QC')])}
          >
            {t('addAffiliation')}
          </button>
        )}
      </section>

      {/* Step 4 — Submit */}
      <section style={stepStyle} aria-labelledby="step4">
        <h2 id="step4">{t('step4Title')}</h2>
        <p>{t('step4Description')}</p>
        {errorMessage && (
          <p style={errorStyle} role="alert">
            {errorMessage}
          </p>
        )}
        <button type="submit" disabled={phase === 'submitting'} style={submitButtonStyle}>
          {phase === 'submitting' ? t('submittingButton') : t('submitButton')}
        </button>
      </section>
    </form>
  );
}

// --- Helpers ---

function emptyCertificate(province: 'QC' | 'ON'): CertificateDraft {
  return {
    province,
    certificateNumber: '',
    issuedAt: '',
    expiresAt: '',
    file: null,
  };
}

function emptyAffiliation(province: 'QC' | 'ON'): AffiliationDraft {
  return {
    agencyName: '',
    agencyPermitNumber: '',
    agencyProvince: province,
    role: '',
    activeSince: '',
    file: null,
  };
}

function updateCert(
  setter: React.Dispatch<React.SetStateAction<CertificateDraft[]>>,
  index: number,
  patch: Partial<CertificateDraft>,
): void {
  setter((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
}

function updateAffil(
  setter: React.Dispatch<React.SetStateAction<AffiliationDraft[]>>,
  index: number,
  patch: Partial<AffiliationDraft>,
): void {
  setter((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
}

function collectFiles(
  certs: ReadonlyArray<CertificateDraft>,
  affils: ReadonlyArray<AffiliationDraft>,
): ReadonlyArray<{ purpose: 'certificat' | 'preuve_affiliation'; file: File }> {
  return [
    ...certs.map((c) => ({ purpose: 'certificat' as const, file: c.file as File })),
    ...affils.map((a) => ({ purpose: 'preuve_affiliation' as const, file: a.file as File })),
  ];
}

async function putToS3(
  allFiles: ReadonlyArray<{ file: File }>,
  uploads: ReadonlyArray<{ presignedUrl: string; requiredHeaders: Record<string, string> }>,
): Promise<void> {
  await Promise.all(
    allFiles.map(async ({ file }, i) => {
      const upload = uploads[i];
      if (!upload) throw new Error('Missing upload URL.');
      const res = await fetch(upload.presignedUrl, {
        method: 'PUT',
        headers: upload.requiredHeaders,
        body: file,
      });
      if (!res.ok) throw new Error(`S3 upload failed (${res.status}).`);
    }),
  );
}

function validateFileShape(
  file: File | null,
  t: ReturnType<typeof useTranslations>,
  missingKey: 'errorMinCertificates' | 'errorMinAffiliations',
): string | null {
  if (!file) return t(missingKey);
  if (file.size > MAX_BYTES) return t('errorFileTooLarge');
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    return t('errorInvalidFileType');
  }
  return null;
}

function validateCertificate(
  cert: CertificateDraft,
  t: ReturnType<typeof useTranslations>,
): string | null {
  const fileErr = validateFileShape(cert.file, t, 'errorMinCertificates');
  if (fileErr) return fileErr;
  if (cert.issuedAt && cert.expiresAt && new Date(cert.expiresAt) <= new Date(cert.issuedAt)) {
    return t('errorExpiresBeforeIssued');
  }
  return null;
}

function validateClient(
  consent: boolean,
  certs: CertificateDraft[],
  affils: AffiliationDraft[],
  t: ReturnType<typeof useTranslations>,
): string | null {
  if (!consent) return t('errorConsentRequired');
  if (certs.length === 0) return t('errorMinCertificates');
  if (affils.length === 0) return t('errorMinAffiliations');
  for (const c of certs) {
    const err = validateCertificate(c, t);
    if (err) return err;
  }
  for (const a of affils) {
    const err = validateFileShape(a.file, t, 'errorMinAffiliations');
    if (err) return err;
  }
  return null;
}

// --- Styles ---

const stepStyle = {
  background: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 24,
  margin: '16px 0',
};

const fieldsetStyle = {
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: 16,
  margin: '12px 0',
};

const fieldLabelStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 4,
  margin: '8px 0',
};

const errorStyle = {
  background: '#fef2f2',
  border: '1px solid #ef4444',
  color: '#7f1d1d',
  padding: 12,
  borderRadius: 6,
};

const successStyle = {
  background: '#f0fdf4',
  border: '1px solid #16a34a',
  color: '#14532d',
  padding: 24,
  borderRadius: 8,
  margin: '24px 0',
};

const submitButtonStyle = {
  background: '#2563eb',
  color: '#fff',
  padding: '12px 24px',
  border: 'none',
  borderRadius: 6,
  fontSize: 16,
  cursor: 'pointer' as const,
};
