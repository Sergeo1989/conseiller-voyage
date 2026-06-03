// T060 — Adapter : EmbeddedFsaCentroidReader.
//
// Charge `packages/shared/src/matching/fsa-centroids.json` au boot du module
// matching (singleton DI). Validation Zod du fichier au chargement (defense-in-depth
// contre corruption).
//
// Le bootstrap fixture (41 FSAs métros canadiennes) suffit pour dev + tests
// unitaires. La version production (1 622 FSAs StatCan) sera générée par
// `pnpm tsx tools/build-fsa-centroids.ts --production` en T090 polish avant merge.

import fsaCentroidsFile from '@cv/shared/matching/fsa-centroids.json';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import type {
  FsaCentroid,
  FsaCentroidReader,
  FsaCentroidTable,
  ProvinceCode,
} from '../application/ports/fsa-centroid-reader.port';
import { type FsaCode, asFsaCode } from '../domain/value-objects/fsa-code.vo';

const ProvinceCodeSchema = z.enum([
  'QC',
  'ON',
  'BC',
  'AB',
  'MB',
  'SK',
  'NS',
  'NB',
  'NL',
  'PE',
  'YT',
  'NT',
  'NU',
]);

const FsaEntrySchema = z.object({
  fsa: z.string().regex(/^[A-Z]\d[A-Z]$/),
  lat: z.number(),
  lng: z.number(),
  province: ProvinceCodeSchema,
});

const FsaFileSchema = z.object({
  meta: z.object({
    isBootstrap: z.boolean(),
    fsaCount: z.number().int().min(1),
  }),
  entries: z.array(FsaEntrySchema),
});

@Injectable()
export class EmbeddedFsaCentroidReader implements FsaCentroidReader, OnModuleInit {
  private readonly logger = new Logger(EmbeddedFsaCentroidReader.name);
  private table: FsaCentroidTable = new Map();

  onModuleInit(): void {
    const parsed = FsaFileSchema.parse(fsaCentroidsFile);
    const table = new Map<FsaCode, FsaCentroid>();
    for (const entry of parsed.entries) {
      table.set(asFsaCode(entry.fsa), {
        lat: entry.lat,
        lng: entry.lng,
        province: entry.province as ProvinceCode,
      });
    }
    this.table = table;
    this.logger.log(
      `FSA centroids loaded: ${parsed.entries.length} entries (bootstrap=${parsed.meta.isBootstrap})`,
    );
  }

  lookup(fsaCode: FsaCode): FsaCentroid | null {
    return this.table.get(fsaCode) ?? null;
  }

  getAll(): FsaCentroidTable {
    return this.table;
  }
}
