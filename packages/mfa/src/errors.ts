// Erreurs typées du domaine MFA — utilisées par les modules purs et les
// use cases côté apps/api. Toutes héritent d'une base commune pour
// faciliter le filtrage côté contrôleur.

export class MfaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

// Chiffrement / déchiffrement
export class TotpSecretIntegrityError extends MfaError {
  constructor() {
    super('TOTP secret integrity check failed (auth tag invalid)');
  }
}

export class TotpSecretFormatError extends MfaError {
  constructor(reason: string) {
    super(`TOTP secret format invalid: ${reason}`);
  }
}

export class KekInvalidSizeError extends MfaError {
  constructor(actualBytes: number) {
    super(`KEK must be exactly 32 bytes (256 bits), got ${actualBytes}`);
  }
}

export class KekNotConfiguredError extends MfaError {
  constructor() {
    super('MFA_KEK_BASE64 environment variable is not set');
  }
}

// Vérification TOTP / backup
export class InvalidTotpCodeError extends MfaError {
  constructor() {
    super('TOTP code rejected');
  }
}

export class BackupCodeAlreadyConsumedError extends MfaError {
  constructor() {
    super('Backup code already used');
  }
}

// Rate limit
export class MfaRateLimitedError extends MfaError {
  readonly unlockAt: Date;

  constructor(unlockAt: Date) {
    super(`MFA temporarily locked until ${unlockAt.toISOString()}`);
    this.unlockAt = unlockAt;
  }
}

// Enrôlement
export class MfaNotEnrolledError extends MfaError {
  constructor() {
    super('User has no active MFA secret');
  }
}

export class MfaAlreadyEnrolledError extends MfaError {
  constructor() {
    super('User already has an active MFA secret');
  }
}
