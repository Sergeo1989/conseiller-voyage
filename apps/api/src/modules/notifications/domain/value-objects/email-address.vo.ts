// T030 — Value Object EmailAddress (immutable, validé via Zod).

import { z } from 'zod';

const EmailAddressSchema = z.string().email().max(254);

export class EmailAddress {
  private constructor(public readonly value: string) {}

  static from(value: string): EmailAddress {
    return new EmailAddress(EmailAddressSchema.parse(value));
  }

  toString(): string {
    return this.value;
  }

  equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }
}
