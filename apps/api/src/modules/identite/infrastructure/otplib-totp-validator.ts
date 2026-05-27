// Adapter otplib via @cv/mfa/totp.

import { buildKeyUri, generateSecret, verify } from '@cv/mfa';
import { Injectable } from '@nestjs/common';
import type { TotpValidator } from '../application/ports/totp-validator.port';

@Injectable()
export class OtplibTotpValidator implements TotpValidator {
  verify(secret: string, code: string): boolean {
    return verify(secret, code);
  }

  generateSecret(): string {
    return generateSecret();
  }

  buildKeyUri(accountLabel: string, secret: string): string {
    return buildKeyUri(accountLabel, secret);
  }
}
