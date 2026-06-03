// Fakes en mémoire des ports matching — utilisés par les tests unitaires
// des use cases. Underscore prefix → ignoré par vitest.

import type {
  MatchingAuditEntryId,
  MatchingOutboxEntryId,
  MatchingResultId,
} from '@cv/shared/matching';
import type { Clock } from '../../../../common/ports/clock.port';
import type { UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { FsaCode } from '../../domain/value-objects/fsa-code.vo';
import type { BriefSnapshot, BriefSnapshotReader } from '../ports/brief-snapshot-reader.port';
import type {
  ConseillerLanguage,
  ConseillerSnapshot,
  ConseillerSnapshotReader,
} from '../ports/conseiller-snapshot-reader.port';
import type {
  FsaCentroid,
  FsaCentroidReader,
  FsaCentroidTable,
} from '../ports/fsa-centroid-reader.port';
import type {
  MatchingAuditEntryInput,
  MatchingAuditWriter,
} from '../ports/matching-audit-writer.port';
import type {
  MatchingOutboxEnqueueResult,
  MatchingOutboxEntryInput,
  MatchingOutboxWriter,
} from '../ports/matching-outbox-writer.port';
import type {
  MatchingResultEntity,
  MatchingResultReader,
} from '../ports/matching-result-reader.port';
import type {
  MatchingResultEntryInput,
  MatchingResultInput,
  MatchingResultWriteResult,
  MatchingResultWriter,
} from '../ports/matching-result-writer.port';
import type { MatchingComputedMetric, MetricsRecorder } from '../ports/metrics-recorder.port';
import type { RedisRematchLock, RematchLockAcquireResult } from '../ports/redis-rematch-lock.port';

// =====================================================================
// Clock + UuidGenerator
// =====================================================================

export class FakeClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  nowMs(): number {
    return this.current.getTime();
  }
  set(d: Date): void {
    this.current = d;
  }
}

export class FakeUuidGenerator implements UuidGenerator {
  private counter = 0;
  constructor(private prefix = '00000000-0000-4000-8000') {}
  generate(): string {
    this.counter += 1;
    return `${this.prefix}-${String(this.counter).padStart(12, '0')}`;
  }
}

// =====================================================================
// BriefSnapshotReader
// =====================================================================

export class FakeBriefSnapshotReader implements BriefSnapshotReader {
  private store = new Map<string, BriefSnapshot>();
  add(brief: BriefSnapshot): void {
    this.store.set(brief.briefId, brief);
  }
  async readByBriefId(briefId: string): Promise<BriefSnapshot | null> {
    return this.store.get(briefId) ?? null;
  }
}

// =====================================================================
// ConseillerSnapshotReader
// =====================================================================

export class FakeConseillerSnapshotReader implements ConseillerSnapshotReader {
  private store: ConseillerSnapshot[] = [];
  add(c: ConseillerSnapshot): void {
    this.store.push(c);
  }
  /** Filtre dur langue + filtre verified (les fakes en store sont supposés verified). */
  async readAllVerifiedSnapshots(
    filterLanguage: ConseillerLanguage,
  ): Promise<ReadonlyArray<ConseillerSnapshot>> {
    return this.store.filter((c) => c.languages.includes(filterLanguage));
  }
}

// =====================================================================
// FsaCentroidReader
// =====================================================================

export class FakeFsaCentroidReader implements FsaCentroidReader {
  constructor(private table: FsaCentroidTable = new Map()) {}
  lookup(fsa: FsaCode): FsaCentroid | null {
    return this.table.get(fsa) ?? null;
  }
  getAll(): FsaCentroidTable {
    return this.table;
  }
}

// =====================================================================
// MatchingResultWriter (avec simulation UNIQUE INDEX idempotence)
// =====================================================================

interface PersistedMatchingResult {
  readonly result: MatchingResultInput;
  readonly entries: ReadonlyArray<MatchingResultEntryInput>;
  superseded: boolean;
}

export class FakeMatchingResultWriter implements MatchingResultWriter {
  private store = new Map<MatchingResultId, PersistedMatchingResult>();
  private activeByBriefId = new Map<string, MatchingResultId>();

  async create(
    result: MatchingResultInput,
    entries: ReadonlyArray<MatchingResultEntryInput>,
  ): Promise<MatchingResultWriteResult> {
    // Simule UNIQUE INDEX partiel : 1 actif par briefId
    const existing = this.activeByBriefId.get(result.briefId);
    if (existing !== undefined) {
      return { kind: 'already_exists' };
    }
    this.store.set(result.id, { result, entries, superseded: false });
    this.activeByBriefId.set(result.briefId, result.id);
    return { kind: 'created', matchingResultId: result.id };
  }

  async markSuperseded(
    previousMatchingResultId: MatchingResultId,
    _newMatchingResultId: MatchingResultId,
    _supersededAt: Date,
  ): Promise<void> {
    const existing = this.store.get(previousMatchingResultId);
    if (!existing) throw new Error(`MR ${previousMatchingResultId} introuvable`);
    existing.superseded = true;
    // Libère le slot actif pour permettre un nouveau MR sur le même briefId
    this.activeByBriefId.delete(existing.result.briefId);
  }

  // helpers pour les tests
  list(): ReadonlyArray<PersistedMatchingResult> {
    return [...this.store.values()];
  }

  countActiveByBriefId(briefId: string): number {
    return this.activeByBriefId.has(briefId) ? 1 : 0;
  }
}

// =====================================================================
// MatchingResultReader (lecture pour query / scheduler)
// =====================================================================

export class FakeMatchingResultReader implements MatchingResultReader {
  constructor(private writer: FakeMatchingResultWriter) {}

  async findActiveByBriefId(briefId: string): Promise<MatchingResultEntity | null> {
    const persisted = this.writer.list().find((p) => p.result.briefId === briefId && !p.superseded);
    if (!persisted) return null;
    return toEntity(persisted);
  }

  async findActiveOkResultsForRevocationScan(
    limit: number,
  ): Promise<ReadonlyArray<MatchingResultEntity>> {
    return this.writer
      .list()
      .filter((p) => !p.superseded && p.result.status === 'ok')
      .slice(0, limit)
      .map(toEntity);
  }
}

function toEntity(p: PersistedMatchingResult): MatchingResultEntity {
  return {
    id: p.result.id,
    briefId: p.result.briefId,
    status: p.result.status,
    matchedCount: p.result.matchedCount,
    algorithmVersion: p.result.algorithmVersion,
    suggestedConseillerId: p.result.suggestedConseillerId,
    boostApplied: p.result.boostApplied,
    computedAt: p.result.computedAt,
    supersededAt: p.superseded ? new Date() : null,
    supersededByMatchingResultId: null,
    entries: p.entries.map((e) => ({
      position: e.position,
      conseillerId: e.conseillerId,
      scoreBrut: e.scoreBrut,
      scoreFinal: e.scoreFinal,
      scoreComponents: e.scoreComponents,
      boosted: e.boosted,
    })),
  };
}

// =====================================================================
// MatchingAuditWriter
// =====================================================================

export class FakeMatchingAuditWriter implements MatchingAuditWriter {
  readonly entries: MatchingAuditEntryInput[] = [];
  async append(entry: MatchingAuditEntryInput): Promise<void> {
    this.entries.push(entry);
  }
  countByEventType(eventType: MatchingAuditEntryInput['eventType']): number {
    return this.entries.filter((e) => e.eventType === eventType).length;
  }
}

// =====================================================================
// MatchingOutboxWriter (avec simulation UNIQUE idempotency_key)
// =====================================================================

export class FakeMatchingOutboxWriter implements MatchingOutboxWriter {
  readonly entries: MatchingOutboxEntryInput[] = [];
  private idempotencyKeys = new Set<string>();
  async enqueue(entry: MatchingOutboxEntryInput): Promise<MatchingOutboxEnqueueResult> {
    if (this.idempotencyKeys.has(entry.idempotencyKey)) {
      return { kind: 'duplicate' };
    }
    this.idempotencyKeys.add(entry.idempotencyKey);
    this.entries.push(entry);
    return { kind: 'enqueued' };
  }
  countByEventType(eventType: MatchingOutboxEntryInput['eventType']): number {
    return this.entries.filter((e) => e.eventType === eventType).length;
  }
}

// =====================================================================
// MetricsRecorder (T086 — capture les appels pour assertion)
// =====================================================================

export class FakeMetricsRecorder implements MetricsRecorder {
  readonly recorded: MatchingComputedMetric[] = [];
  recordMatchingComputed(metric: MatchingComputedMetric): void {
    this.recorded.push(metric);
  }
}

// =====================================================================
// RedisRematchLock
// =====================================================================

export class FakeRedisRematchLock implements RedisRematchLock {
  private held = new Set<string>();
  async acquire(briefId: string, _ttlMs: number): Promise<RematchLockAcquireResult> {
    if (this.held.has(briefId)) return { kind: 'already_held' };
    this.held.add(briefId);
    return { kind: 'acquired' };
  }
  async release(briefId: string): Promise<void> {
    this.held.delete(briefId);
  }
}

// =====================================================================
// Output helpers de l'_id factory pour assertions
// =====================================================================

export function asMatchingResultIdFromUuid(uuid: string): MatchingResultId {
  return uuid as MatchingResultId;
}

export function asAuditIdFromUuid(uuid: string): MatchingAuditEntryId {
  return uuid as MatchingAuditEntryId;
}

export function asOutboxIdFromUuid(uuid: string): MatchingOutboxEntryId {
  return uuid as MatchingOutboxEntryId;
}
