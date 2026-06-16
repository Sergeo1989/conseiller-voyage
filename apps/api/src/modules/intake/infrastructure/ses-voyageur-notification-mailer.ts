// T016 [017] — SesVoyageurNotificationMailer.
//
// Au moment de l'envoi : (1) charge le brief ; skip si anonymisé (Loi 25,
// FR-010) ; (2) résout l'adresse du voyageur via le contact ; skip si absente ;
// (3) pour `conseillers_prets`, résout prénom + spécialités des conseillers via
// le port public profil (publics + vérifiés uniquement) ; (4) génère un
// magic-link `view_brief_status` (008, renvoyable) ; (5) rend le gabarit FR-CA
// et envoie via SES ca-central-1.
//
// THROW si SES échoue → le job BullMQ retente (backoff). `skipped_*` = issues
// définitives non bloquantes.

import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import {
  VoyageurAdvisorsReadyEmail,
  VoyageurStillSearchingEmail,
} from '@cv/email-templates/intake';
import type { MagicLinkTokenId, VoyageurBriefId, VoyageurContactId } from '@cv/shared/intake';
import {
  CONSEILLER_PUBLIC_DISPLAY_READER,
  type ConseillerPublicDisplayReader,
} from '@cv/shared/profil-public';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { render } from '@react-email/render';
import { sesClient } from '../../../aws/clients';
import { CLOCK, type Clock } from '../../../common/ports/clock.port';
import { UUID_GENERATOR, type UuidGenerator } from '../../../common/ports/uuid-generator.port';
import { env } from '../../../env';
import {
  MAGIC_LINK_TOKEN_WRITER,
  type MagicLinkTokenWriter,
  type SendVoyageurNotificationInput,
  type SendVoyageurNotificationResult,
  VOYAGEUR_BRIEF_READER,
  VOYAGEUR_CONTACT_READER,
  type VoyageurBriefReader,
  type VoyageurContactReader,
  type VoyageurNotificationMailer,
} from '../application/ports';
import { generateClearToken, hashToken } from '../domain/entities/magic-link-token.entity';

const FROM_ADDRESS = 'suivi-noreply@conseiller-voyage.local';
const FROM_ADDRESS_PROD = 'suivi-noreply@cv-mail.example.ca';
const MAGIC_LINK_TTL_DAYS = 7;
const LOCALE = 'fr-CA' as const;

const SUBJECTS: Record<string, string> = {
  conseillers_prets: 'Vos conseillers vérifiés sont prêts',
  recherche_en_cours: 'Votre demande de voyage est en bonne main',
};

@Injectable()
export class SesVoyageurNotificationMailer implements VoyageurNotificationMailer {
  private readonly logger = new Logger(SesVoyageurNotificationMailer.name);

  constructor(
    @Inject(VOYAGEUR_BRIEF_READER) private readonly briefReader: VoyageurBriefReader,
    @Inject(VOYAGEUR_CONTACT_READER) private readonly contactReader: VoyageurContactReader,
    @Inject(MAGIC_LINK_TOKEN_WRITER) private readonly tokenWriter: MagicLinkTokenWriter,
    @Inject(CONSEILLER_PUBLIC_DISPLAY_READER)
    private readonly displayReader: ConseillerPublicDisplayReader,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuid: UuidGenerator,
  ) {}

  async send(input: SendVoyageurNotificationInput): Promise<SendVoyageurNotificationResult> {
    const brief = await this.briefReader.findById(input.briefId as VoyageurBriefId);
    // Loi 25 (FR-010) : un brief effacé/anonymisé ne déclenche plus d'envoi.
    if (!brief || brief.status === 'anonymized' || brief.anonymizedAt !== null) {
      return { kind: 'skipped_anonymized' };
    }

    const contact = await this.contactReader.findById(brief.voyageurContactId as VoyageurContactId);
    const email = contact?.email ?? null;
    if (!email || contact?.anonymizedAt) {
      this.logger.warn(
        `Adresse voyageur introuvable (brief=${input.briefId}) — notification ignorée`,
      );
      return { kind: 'skipped_no_address' };
    }

    const trackingUrl = await this.mintTrackingLink(input.briefId as VoyageurBriefId);
    const { html, text } = await this.renderBody(input, trackingUrl);
    const subject = SUBJECTS[input.type] ?? SUBJECTS.recherche_en_cours;
    const sender = env.NODE_ENV === 'production' ? FROM_ADDRESS_PROD : FROM_ADDRESS;

    const command = new SendEmailCommand({
      FromEmailAddress: sender,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: html, Charset: 'UTF-8' },
            Text: { Data: text, Charset: 'UTF-8' },
          },
        },
      },
    });

    try {
      await sesClient.send(command);
    } catch (err) {
      this.logger.error(
        `SES send failed for voyageur notification=${input.notificationId} → retry job`,
        err,
      );
      throw err;
    }
    return { kind: 'sent' };
  }

  /** Génère + persiste un magic-link `view_brief_status` (renvoyable, 7 j). */
  private async mintTrackingLink(briefId: VoyageurBriefId): Promise<string> {
    const clearToken = generateClearToken();
    const expiresAt = new Date(
      this.clock.now().getTime() + MAGIC_LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.tokenWriter.create({
      id: this.uuid.generate() as MagicLinkTokenId,
      briefId,
      tokenHash: hashToken(clearToken),
      purpose: 'view_brief_status',
      expiresAt,
    });
    const localePath = LOCALE === 'fr-CA' ? 'fr' : 'en';
    return `${env.NEXT_PUBLIC_SITE_URL}/${localePath}/voyage/${clearToken}`;
  }

  private async renderBody(
    input: SendVoyageurNotificationInput,
    trackingUrl: string,
  ): Promise<{ html: string; text: string }> {
    if (input.type === 'conseillers_prets') {
      const displays = await this.displayReader.getPublicDisplay(input.conseillerIds);
      const advisors = displays.map((d) => ({ prenom: d.prenom, specialites: d.specialites }));
      const props = {
        advisors,
        trackingUrl,
        locale: LOCALE,
        partiel: input.outcome === 'partially_matched',
      };
      return {
        html: await render(VoyageurAdvisorsReadyEmail(props)),
        text: await render(VoyageurAdvisorsReadyEmail(props), { plainText: true }),
      };
    }
    // recherche_en_cours (+ fallback)
    const props = { trackingUrl, locale: LOCALE };
    return {
      html: await render(VoyageurStillSearchingEmail(props)),
      text: await render(VoyageurStillSearchingEmail(props), { plainText: true }),
    };
  }
}
