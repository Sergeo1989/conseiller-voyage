// Barrel des ports applicatifs du module intake (T023).
// 10 ports — pas plus, pas moins. Les use cases Phase 3 (US1) consomment
// ces interfaces via injection NestJS (DI token = `Symbol.for(...)`).

export * from './brief-enrichment-query.port';
export * from './brief-enrichment-repository.port';
export * from './disposable-email-checker.port';
export * from './enrichment-metrics-recorder.port';
export * from './intake-audit-log-writer.port';
export * from './llm-provider.port';
export * from './intake-outbox-writer.port';
export * from './intake-rate-limiter.port';
export * from './magic-link-mailer.port';
export * from './magic-link-token-writer.port';
export * from './voyageur-brief-reader.port';
export * from './voyageur-notification-outbox.port';
export * from './voyageur-brief-writer.port';
export * from './voyageur-contact-reader.port';
export * from './voyageur-contact-writer.port';
