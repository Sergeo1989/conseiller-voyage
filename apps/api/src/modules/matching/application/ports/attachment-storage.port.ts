// T020/T024 [US2] — Port AttachmentStorage : stockage objet des pièces jointes
// (S3 ca-central-1, ADR-0001). Le binaire ne transite jamais par l'API :
//   - presignUpload  → URL PUT pré-signée (le client téléverse directement) ;
//   - presignDownload → URL GET signée à durée courte (membre du fil uniquement) ;
//   - deleteObject   → suppression de l'objet (cascade Loi 25, FR-011).
// AUCUNE donnée transactionnelle ne transite ici (ADR-0002).

export interface PresignedUrl {
  readonly url: string;
  readonly expiresInSec: number;
}

export interface AttachmentStorage {
  presignUpload(s3Key: string, mimeType: string): Promise<PresignedUrl>;
  presignDownload(s3Key: string, fileName: string): Promise<PresignedUrl>;
  deleteObject(s3Key: string): Promise<void>;
}

export const ATTACHMENT_STORAGE = Symbol.for('AttachmentStorage');
