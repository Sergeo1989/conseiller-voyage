// T049 — RequestUploadUrlsUseCase.
// Génère N URLs signées S3 PUT + persiste N UploadIntent (B2 du review
// — empêche la forge d'uploadId au moment de la submission).
// Cf. spec FR-001/FR-021 + data-model.md *UploadIntent* + research.md R8.

import {
  type ConseillerId,
  type UploadIntentId,
  UploadIntentIdSchema,
} from '@cv/shared/conformite';
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import { UUID_GENERATOR, type UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { AuthRole } from '../../../identite/application/ports/auth-session-reader.port';
import {
  ALLOWED_MIME_TYPES,
  type AllowedMimeType,
  MAX_CONTENT_LENGTH_BYTES,
  UPLOAD_INTENT_TTL_SECONDS,
  type UploadPurpose,
} from '../../domain/entities/upload-intent.entity';
import { CONFORMITE_WRITER, type ConformiteWriter } from '../ports/conformite-writer.port';
import {
  DOCUMENT_STORAGE,
  type DocumentStoragePort,
  type PresignedUploadUrl,
} from '../ports/document-storage.port';

const MIN_FILES = 1;
const MAX_FILES = 5;

export interface RequestUploadUrlsInput {
  readonly requestedBy: { readonly id: ConseillerId; readonly role: AuthRole };
  readonly files: ReadonlyArray<{
    readonly purpose: UploadPurpose;
    readonly contentType: AllowedMimeType;
    readonly contentLength: number;
  }>;
}

export interface RequestedUploadUrl {
  readonly uploadId: UploadIntentId;
  readonly presignedUrl: string;
  readonly expiresAt: Date;
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

export interface RequestUploadUrlsOutput {
  readonly uploads: ReadonlyArray<RequestedUploadUrl>;
}

@Injectable()
export class RequestUploadUrlsUseCase {
  constructor(
    @Inject(CONFORMITE_WRITER) private readonly writer: ConformiteWriter,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuidGenerator: UuidGenerator,
  ) {}

  async execute(input: RequestUploadUrlsInput): Promise<RequestUploadUrlsOutput> {
    this.enforceRbac(input.requestedBy.role);
    this.validateFiles(input.files);

    const now = this.clock.now();
    const compliance = await this.writer.getOrCreateCompliance({
      conseillerId: input.requestedBy.id,
      now,
    });

    const intents = input.files.map((file) => {
      const id = UploadIntentIdSchema.parse(this.uuidGenerator.generate());
      return {
        id,
        purpose: file.purpose,
        expectedContentType: file.contentType,
        expectedContentLength: file.contentLength,
        objectKey: `conformite/${compliance.id}/${id}`,
        createdAt: now,
        expiresAt: new Date(now.getTime() + UPLOAD_INTENT_TTL_SECONDS * 1000),
      };
    });

    const presigned = await Promise.all(intents.map((intent) => this.presign(intent)));

    await this.writer.createUploadIntents({
      conseillerComplianceId: compliance.id,
      intents,
    });

    return {
      uploads: intents.map((intent, i) => {
        const url = presigned[i];
        if (!url) {
          throw new Error(`Missing presigned URL for intent ${intent.id}`);
        }
        return {
          uploadId: intent.id,
          presignedUrl: url.url,
          expiresAt: url.expiresAt,
          requiredHeaders: url.requiredHeaders,
        };
      }),
    };
  }

  private enforceRbac(role: AuthRole): void {
    if (role !== 'conseiller') {
      throw new UnauthorizedException('Only conseillers can request upload URLs (Principe IX).');
    }
  }

  private validateFiles(files: RequestUploadUrlsInput['files']): void {
    if (files.length < MIN_FILES || files.length > MAX_FILES) {
      throw new BadRequestException(
        `Files count must be between ${MIN_FILES} and ${MAX_FILES} (FR-021).`,
      );
    }
    for (const [i, file] of files.entries()) {
      this.validateFileMime(file.contentType, i);
      this.validateFileSize(file.contentLength, i);
    }
  }

  private validateFileMime(contentType: string, index: number): void {
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(contentType)) {
      throw new BadRequestException(
        `File #${index + 1}: invalid contentType "${contentType}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}.`,
      );
    }
  }

  private validateFileSize(contentLength: number, index: number): void {
    if (contentLength <= 0 || contentLength > MAX_CONTENT_LENGTH_BYTES) {
      throw new BadRequestException(
        `File #${index + 1}: contentLength must be 1..${MAX_CONTENT_LENGTH_BYTES} bytes (FR-021 = 5 MB max).`,
      );
    }
  }

  private presign(intent: {
    objectKey: string;
    expectedContentType: AllowedMimeType;
    expectedContentLength: number;
  }): Promise<PresignedUploadUrl> {
    return this.storage.presignUpload({
      objectKey: intent.objectKey,
      contentType: intent.expectedContentType,
      contentLength: intent.expectedContentLength,
      ttlSeconds: UPLOAD_INTENT_TTL_SECONDS,
    });
  }
}
