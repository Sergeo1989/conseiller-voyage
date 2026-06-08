// T024 [US2] — S3AttachmentStorage : pièces jointes de conversation sur S3
// ca-central-1 (ADR-0001). Objets privés ; le binaire ne transite jamais par
// l'API :
//   - presignUpload  → URL PUT pré-signée (le client téléverse directement) ;
//   - presignDownload → URL GET signée courte (ResponseContentDisposition pour
//     préserver le nom de fichier d'origine) ;
//   - deleteObject   → suppression (cascade Loi 25, FR-011).
// Compatible LocalStack (dev) via AWS_S3_ENDPOINT. Aucune donnée transactionnelle.

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { s3Client } from '../../../aws/clients';
import { env } from '../../../env';
import type { AttachmentStorage, PresignedUrl } from '../application/ports';

const UPLOAD_TTL_SEC = 300; // 5 min pour téléverser
const DOWNLOAD_TTL_SEC = 120; // 2 min de lecture

@Injectable()
export class S3AttachmentStorage implements AttachmentStorage {
  private readonly bucket = env.AWS_S3_BUCKET_CONVERSATIONS;

  async presignUpload(s3Key: string, mimeType: string): Promise<PresignedUrl> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ContentType: mimeType,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: UPLOAD_TTL_SEC });
    return { url, expiresInSec: UPLOAD_TTL_SEC };
  }

  async presignDownload(s3Key: string, fileName: string): Promise<PresignedUrl> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: s3Key,
      ResponseContentDisposition: `attachment; filename="${sanitizeFileName(fileName)}"`,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: DOWNLOAD_TTL_SEC });
    return { url, expiresInSec: DOWNLOAD_TTL_SEC };
  }

  async deleteObject(s3Key: string): Promise<void> {
    await s3Client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: s3Key }));
  }
}

/** Neutralise les guillemets/sauts de ligne dans l'en-tête Content-Disposition. */
function sanitizeFileName(name: string): string {
  return name.replace(/["\r\n]/g, '_').slice(0, 200);
}
