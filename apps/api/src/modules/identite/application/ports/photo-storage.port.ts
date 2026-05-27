// T029 — Port stockage S3 des photos profil (feature 007, R2).
//
// Wrappe @aws-sdk/client-s3 pour le bucket cv-profiles-photos-ca-central-1.
// SSE-KMS imposé par bucket policy. URLs publiques via CloudFront OAC
// (pas signées — cf. R2 + M7). Le module ne sait pas quel CloudFront ;
// il retourne la clé S3 et le caller construit l'URL via env var.
//
// Aucune dépendance directe au SDK AWS dans la couche application.

export interface PhotoUploadInput {
  readonly key: string;
  readonly buffer: Buffer;
  readonly contentType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface PhotoStorage {
  /** Upload SSE-KMS dans le bucket photos profil. */
  upload(input: PhotoUploadInput): Promise<void>;
  /** Suppression irréversible (Loi 25 + FIFO eviction). */
  delete(key: string): Promise<void>;
  /** Liste les objets sous un préfixe (cleanup orphans worker). */
  listKeysWithPrefix(prefix: string): Promise<readonly string[]>;
}

export const PHOTO_STORAGE = Symbol.for('PhotoStorage');
