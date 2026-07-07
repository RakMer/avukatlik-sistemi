import { PrismaClient, CaseStatus, HearingStatus, PendingCaseStatus } from '@prisma/client';

const prisma = new PrismaClient();

export interface GeminiOutput {
  belge_turu: string | null;
  dosya_no: string | null;
  mahkeme_kurum: string | null;
  onemli_tarih: string | null;
  tarih_aciklamasi: string | null;
  sure_turu: string | null;
  taraf_bilgisi: string | null;
  guven_seviyesi: 'yüksek' | 'orta' | 'düşük';
  belirsiz_alanlar: string[];
  notlar: string | null;
}

export interface WebhookPayload {
  chat_id: string;
  message_id?: string;
  raw_text?: string;
  gemini_output?: GeminiOutput; // confirm/discard actions don't need this
  onay_gerekli?: boolean;
  action: 'process' | 'pending' | 'confirm' | 'discard';
  pending_case_id?: string;
}

export class WebhookService {
  /**
   * Main router for webhook actions.
   */
  async handleWebhook(payload: WebhookPayload) {
    const { action } = payload;

    switch (action) {
      case 'process':
        return this.processImmediately(payload);
      case 'pending':
        return this.saveAsPending(payload);
      case 'confirm':
        return this.confirmPending(payload);
      case 'discard':
        return this.discardPending(payload);
      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }

  /**
   * Saves the parsed case details directly to the database.
   */
  private async processImmediately(payload: WebhookPayload) {
    const { chat_id } = payload;
    const gemini_output = payload.gemini_output!; // caller guarantees this is present for 'process'

    // 1. Get or Create Lawyer
    let lawyer = await prisma.lawyer.findUnique({
      where: { telegramChatId: chat_id },
    });

    if (!lawyer) {
      lawyer = await prisma.lawyer.create({
        data: {
          fullName: 'Yeni Avukat',
          telegramChatId: chat_id,
        },
      });
    }

    // 2. Get or Create Client
    const clientName = gemini_output.taraf_bilgisi || 'Bilinmeyen Müvekkil';
    let client = await prisma.client.findFirst({
      where: { fullName: clientName },
    });

    if (!client) {
      client = await prisma.client.create({
        data: {
          fullName: clientName,
          notes: `Telegram üzerinden otomatik oluşturuldu.`,
        },
      });
    }

    // 3. Create Case
    const caseNumber = gemini_output.dosya_no || `GEÇİCİ-${Date.now()}`;
    
    // Check if case already exists
    let existingCase = await prisma.case.findUnique({
      where: { caseNumber },
    });

    if (!existingCase) {
      existingCase = await prisma.case.create({
        data: {
          caseNumber,
          courtName: gemini_output.mahkeme_kurum,
          caseType: gemini_output.belge_turu, // Bug fix: case_type doesn't exist on GeminiOutput, use belge_turu
          description: gemini_output.notlar,
          status: CaseStatus.ACTIVE,
          lawyerId: lawyer.id,
          clientId: client.id,
          documentType: gemini_output.belge_turu,
          confidenceLevel: gemini_output.guven_seviyesi,
          rawGeminiOutput: gemini_output as any, // Prisma Json field — pass the object directly, not a stringified version
        },
      });
    }

    // 4. Create Hearing if date is available
    let createdHearing = null;
    if (gemini_output.onemli_tarih) {
      // Parse YYYY-MM-DD
      const dateParts = gemini_output.onemli_tarih.split('-');
      if (dateParts.length === 3) {
        const hearingDate = new Date(
          parseInt(dateParts[0]),
          parseInt(dateParts[1]) - 1,
          parseInt(dateParts[2]),
          10, // default to 10:00 AM
          0
        );

        createdHearing = await prisma.hearing.create({
          data: {
            caseId: existingCase.id,
            hearingDate,
            location: gemini_output.mahkeme_kurum,
            notes: gemini_output.tarih_aciklamasi || 'Duruşma / Tebligat Önemli Tarihi',
            status: HearingStatus.SCHEDULED,
          },
        });
      }
    }

    return {
      success: true,
      lawyer,
      client,
      case: existingCase,
      hearing: createdHearing,
    };
  }

  /**
   * Saves data into pending cases table waiting for user confirmation.
   */
  private async saveAsPending(payload: WebhookPayload) {
    const { chat_id, message_id, raw_text, gemini_output } = payload;

    const pendingCase = await prisma.pendingCase.create({
      data: {
        telegramChatId: chat_id,
        telegramMessageId: message_id ? String(message_id) : null,
        rawInputText: raw_text,
        parsedData: JSON.stringify(gemini_output),
        status: PendingCaseStatus.PENDING_CONFIRMATION,
      },
    });

    return {
      success: true,
      pending_case_id: pendingCase.id,
    };
  }

  /**
   * Confirms a pending case, promoting it to active tables.
   */
  private async confirmPending(payload: WebhookPayload) {
    const { pending_case_id, chat_id } = payload;

    if (!pending_case_id) {
      throw new Error('pending_case_id is required for confirm action.');
    }

    const pendingCase = await prisma.pendingCase.findUnique({
      where: { id: pending_case_id },
    });

    if (!pendingCase) {
      throw new Error(`Pending case with ID ${pending_case_id} not found.`);
    }

    if (pendingCase.status !== PendingCaseStatus.PENDING_CONFIRMATION) {
      throw new Error(`Pending case is already in status: ${pendingCase.status}`);
    }

    // Process using same logic
    // Bug fix: parsedData is a Prisma Json field (already an object at runtime), not a string.
    // JSON.parse on an object would throw "Unexpected token o in JSON at position 0".
    const gemini_output = pendingCase.parsedData as unknown as GeminiOutput;
    const result = await this.processImmediately({
      chat_id: chat_id || pendingCase.telegramChatId,
      gemini_output,
      action: 'process',
    });

    // Update pending case status
    await prisma.pendingCase.update({
      where: { id: pending_case_id },
      data: { status: PendingCaseStatus.CONFIRMED },
    });

    return result;
  }

  /**
   * Discards a pending case.
   */
  private async discardPending(payload: WebhookPayload) {
    const { pending_case_id } = payload;

    if (!pending_case_id) {
      throw new Error('pending_case_id is required for discard action.');
    }

    await prisma.pendingCase.update({
      where: { id: pending_case_id },
      data: { status: PendingCaseStatus.DISCARDED },
    });

    return {
      success: true,
      message: 'Pending case discarded.',
    };
  }
}
