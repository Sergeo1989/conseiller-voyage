// T037 [TDD GREEN] — Value Object FsaCode.
// Re-export depuis @cv/shared/matching/branded-ids pour éviter la duplication.
// La regex et le parsing sont identiques côté shared (consommé par le frontend
// futur 015) et côté domain (consommé par la fonction pure scoring).

export {
  FSA_REGEX,
  FsaCodeSchema,
  asFsaCode,
  parseFsaFromPostalCode,
  type FsaCode,
} from '@cv/shared/matching/branded-ids';
