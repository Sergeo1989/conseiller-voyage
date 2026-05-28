// T039 — S3PhotoStorage (feature 007, R2).
//
// Impl du port PhotoStorage (T029). Bucket dédié `cv-profiles-photos-*`,
// SSE-KMS si AWS_KMS_PROFILES_KEY_ID est configuré (prod), pas de KMS
// en dev local (LocalStack). Réutilise le s3Client singleton (avec
// requestChecksumCalculation: WHEN_REQUIRED — cf. clients.ts T026).

import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { s3Client } from '../../../aws/clients';
import { env } from '../../../env';
import type { PhotoStorage, PhotoUploadInput } from '../application/ports/photo-storage.port';

@Injectable()
export class S3PhotoStorage implements PhotoStorage {
  private readonly bucket = env.AWS_S3_BUCKET_PROFILES;

  async upload(input: PhotoUploadInput): Promise<void> {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.buffer,
        ContentType: input.contentType,
        // SSE-KMS uniquement si KMS_KEY_ID configuré (prod).
        // En dev (LocalStack), ServerSideEncryption non supporté.
        ...(env.AWS_KMS_PROFILES_KEY_ID && {
          ServerSideEncryption: 'aws:kms',
          SSEKMSKeyId: env.AWS_KMS_PROFILES_KEY_ID,
        }),
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await s3Client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async listKeysWithPrefix(prefix: string): Promise<readonly string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const resp = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ...(continuationToken && { ContinuationToken: continuationToken }),
        }),
      );
      for (const obj of resp.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      continuationToken = resp.NextContinuationToken;
    } while (continuationToken);
    return keys;
  }
}
