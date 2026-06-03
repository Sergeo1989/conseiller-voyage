// T029 — Barrel des ports applicatifs du module matching.
// 8 ports cœur (Phases 3-5) + 1 port observabilité (T086 Phase 6).
// Les use cases consomment ces interfaces via injection NestJS
// (DI token = `Symbol.for(...)`).

export * from './brief-snapshot-reader.port';
export * from './conseiller-snapshot-reader.port';
export * from './fsa-centroid-reader.port';
export * from './matching-audit-writer.port';
export * from './matching-outbox-writer.port';
export * from './matching-result-reader.port';
export * from './matching-result-writer.port';
export * from './metrics-recorder.port';
export * from './redis-rematch-lock.port';
