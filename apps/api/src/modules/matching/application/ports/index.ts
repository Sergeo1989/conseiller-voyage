// T029 — Barrel des ports applicatifs du module matching.
// 8 ports cœur (Phases 3-5) + 1 port observabilité (T086 Phase 6).
// Les use cases consomment ces interfaces via injection NestJS
// (DI token = `Symbol.for(...)`).

export * from './brief-snapshot-reader.port';
export * from './conseiller-snapshot-reader.port';
export * from './fsa-centroid-reader.port';
export * from './matching-audit-writer.port';
export * from './matching-event-publisher.port';
export * from './matching-outbox-writer.port';
export * from './matching-result-reader.port';
export * from './matching-result-writer.port';
export * from './metrics-recorder.port';
export * from './redis-rematch-lock.port';

// Feature 012 — ports leads (notifications conseiller + machine d'état)
export * from './conseiller-identity-resolver.port';
export * from './consumed-event-store.port';
export * from './lead-brief-summary-reader.port';
export * from './lead-metrics-recorder.port';
export * from './lead-notification-mailer.port';
export * from './lead-notification-outbox.port';
export * from './lead-reader.port';
export * from './lead-writer.port';
