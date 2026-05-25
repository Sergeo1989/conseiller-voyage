// Implémentation crypto.randomUUID() (Node 22 LTS) du port UuidGenerator.

import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { UuidGenerator } from '../ports/uuid-generator.port';

@Injectable()
export class CryptoUuidGenerator implements UuidGenerator {
  generate(): string {
    return randomUUID();
  }
}
