// Port DocumentStoragePort — abstraction du stockage objet (S3 en prod,
// LocalStack en dev). Cf. ADR-0001 + research.md R8.

export interface PresignedUploadUrl {
  /** URL S3 PUT signée, expire après ~5 min. */
  readonly url: string;
  /** Headers que le client DOIT renvoyer avec son PUT pour passer la validation S3. */
  readonly requiredHeaders: Readonly<Record<string, string>>;
  /** ISO datetime d'expiration. */
  readonly expiresAt: Date;
}

export interface PresignDownloadOptions {
  /** Force `Content-Disposition: attachment` pour éviter l'inline (research R5). */
  readonly forceDownload?: boolean;
  /** Durée de validité de l'URL signée (défaut 5 min). */
  readonly ttlSeconds?: number;
}

export interface ObjectMetadata {
  readonly contentType: string;
  readonly contentLength: number;
  readonly lastModified: Date;
}

export interface DocumentStoragePort {
  /** Génère une URL signée PUT pour téléversement direct par le client. */
  presignUpload(args: {
    objectKey: string;
    contentType: string;
    contentLength: number;
    ttlSeconds: number;
  }): Promise<PresignedUploadUrl>;

  /** Vérifie qu'un objet existe avec le bon type MIME et taille (HEAD S3). */
  headObject(objectKey: string): Promise<ObjectMetadata | null>;

  /** Génère une URL signée GET pour visualisation admin (avec Content-Disposition). */
  presignDownload(objectKey: string, options?: PresignDownloadOptions): Promise<string>;

  /** Suppression irréversible (effacement Loi 25). */
  deleteObject(objectKey: string): Promise<void>;
}

export const DOCUMENT_STORAGE = Symbol.for('DocumentStoragePort');
