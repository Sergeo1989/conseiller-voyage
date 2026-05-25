// Port UuidGenerator pour la testabilité des use cases (Principe VI).
// CryptoUuidGenerator utilise crypto.randomUUID() en prod ; tests
// utilisent FakeUuidGenerator pour des IDs déterministes.

export interface UuidGenerator {
  generate(): string;
}

export const UUID_GENERATOR = Symbol.for('UuidGenerator');
