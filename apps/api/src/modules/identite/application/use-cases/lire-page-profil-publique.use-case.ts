// T078 — LirePageProfilPubliqueUseCase (feature 007 US2).
//
// Wrapper d'application autour de ProfilPublicReader (T034 + T044).
// Garde le pattern "use case = orchestration", même si la majeure
// partie de la logique vit côté adapter Prisma (jointures + format).
//
// Anti-énumération SC-003 : retourne null pour TOUS les cas non-visibles.
// Le caller (page Next.js) déclenche notFound() sans distinction.

import { Inject, Injectable } from '@nestjs/common';
import {
  PROFIL_PUBLIC_READER,
  type ProfilPublicPayload,
  type ProfilPublicReader,
} from '../ports/profil-public-reader.port';

export interface LirePageProfilPubliqueInput {
  readonly slug: string;
}

@Injectable()
export class LirePageProfilPubliqueUseCase {
  constructor(
    @Inject(PROFIL_PUBLIC_READER)
    private readonly reader: ProfilPublicReader,
  ) {}

  async execute(input: LirePageProfilPubliqueInput): Promise<ProfilPublicPayload | null> {
    return this.reader.lireParSlug(input.slug);
  }

  async lireSlugsPubliables(): Promise<readonly string[]> {
    return this.reader.lireSlugsPubliables();
  }
}
