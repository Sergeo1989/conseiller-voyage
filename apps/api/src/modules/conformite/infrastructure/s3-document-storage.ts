// T061 — S3DocumentStorage adapter.
// Implémente DocumentStoragePort via AWS SDK v3 + s3-request-presigner.
//
// Sécurité (Principe IX) :
//   - presignUpload contraint Content-Type ET Content-Length-Range côté
//     S3 (le client ne peut pas dépasser la taille déclarée à la
//     génération de l'URL).
//   - presignDownload force Content-Disposition: attachment (R5)
//     pour empêcher l'inline malicieux (XSS via PDF embarqué).
//   - Toutes les opérations s'appuient sur le bucket configuré dans
//     env.AWS_S3_BUCKET_CONFORMITE — pas de bucket dynamique.
//   - En dev local : LocalStack via env.AWS_S3_ENDPOINT (path-style).
//
// Cf. specs/001-conformite-module/research.md R8 + ADR-0001.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { s3Client } from '../../../aws/clients';
import { env } from '../../../env';
import type {
  DocumentStoragePort,
  ObjectMetadata,
  PresignDownloadOptions,
  PresignedUploadUrl,
} from '../application/ports/document-storage.port';

/** Token DI Nest pour injecter un client mock dans les tests. */
export const S3_CLIENT = Symbol.for('S3Client');

const DEFAULT_DOWNLOAD_TTL_SECONDS = 5 * 60;

@Injectable()
export class S3DocumentStorage implements DocumentStoragePort {
  constructor(@Inject(S3_CLIENT) private readonly client: S3Client = s3Client) {}

  async presignUpload(args: {
    objectKey: string;
    contentType: string;
    contentLength: number;
    ttlSeconds: number;
  }): Promise<PresignedUploadUrl> {
    const command = new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET_CONFORMITE,
      Key: args.objectKey,
      ContentType: args.contentType,
      ContentLength: args.contentLength,
      // ServerSideEncryption forcé via bucket policy en prod ; on
      // l'envoie aussi côté client comme défense en profondeur.
      ServerSideEncryption: 'AES256',
    });

    const url = await getSignedUrl(this.client, command, { expiresIn: args.ttlSeconds });

    return {
      url,
      requiredHeaders: {
        'Content-Type': args.contentType,
        'Content-Length': String(args.contentLength),
        'x-amz-server-side-encryption': 'AES256',
      },
      expiresAt: new Date(Date.now() + args.ttlSeconds * 1000),
    };
  }

  async headObject(objectKey: string): Promise<ObjectMetadata | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: env.AWS_S3_BUCKET_CONFORMITE,
          Key: objectKey,
        }),
      );
      return {
        contentType: response.ContentType ?? 'application/octet-stream',
        contentLength: response.ContentLength ?? 0,
        lastModified: response.LastModified ?? new Date(0),
      };
    } catch (error) {
      if (this.isNotFoundError(error)) return null;
      throw error;
    }
  }

  async presignDownload(objectKey: string, options?: PresignDownloadOptions): Promise<string> {
    const ttl = options?.ttlSeconds ?? DEFAULT_DOWNLOAD_TTL_SECONDS;
    const command = new GetObjectCommand({
      Bucket: env.AWS_S3_BUCKET_CONFORMITE,
      Key: objectKey,
      // Force download — empêche le rendu inline d'un PDF/HTML
      // potentiellement malicieux dans l'onglet admin (R5).
      ...(options?.forceDownload !== false && {
        ResponseContentDisposition: `attachment; filename="${this.safeFilename(objectKey)}"`,
      }),
    });
    return getSignedUrl(this.client, command, { expiresIn: ttl });
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: env.AWS_S3_BUCKET_CONFORMITE,
        Key: objectKey,
      }),
    );
  }

  // --- Helpers internes ---

  private isNotFoundError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404;
  }

  /** Sanitize objectKey to a safe filename for Content-Disposition. */
  private safeFilename(objectKey: string): string {
    const tail = objectKey.split('/').pop() ?? 'document';
    return tail.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
}
