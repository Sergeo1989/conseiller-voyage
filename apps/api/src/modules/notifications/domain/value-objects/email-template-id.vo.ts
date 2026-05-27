// T032 — Value Object EmailTemplateId (format '<module>.<template-name>').

const TEMPLATE_ID_REGEX = /^[a-z]+\.[a-z][a-z0-9-]*$/;

export class EmailTemplateId {
  private constructor(public readonly value: string) {}

  static from(value: string): EmailTemplateId {
    if (!TEMPLATE_ID_REGEX.test(value)) {
      throw new Error(
        `Invalid EmailTemplateId format: ${value} (expected '<module>.<template-name>').`,
      );
    }
    return new EmailTemplateId(value);
  }

  get module(): string {
    return (this.value.split('.')[0] as string) ?? '';
  }

  get templateName(): string {
    return (this.value.split('.').slice(1).join('.') as string) ?? '';
  }

  toString(): string {
    return this.value;
  }

  equals(other: EmailTemplateId): boolean {
    return this.value === other.value;
  }
}
