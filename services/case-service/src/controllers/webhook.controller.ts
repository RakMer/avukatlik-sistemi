import { Request, Response } from 'express';
import { WebhookService, WebhookPayload } from '../services/webhook.service';

const webhookService = new WebhookService();

export class WebhookController {
  async handleTelegramWebhook(req: Request, res: Response) {
    try {
      const payload: WebhookPayload = req.body;

      if (!payload || !payload.action || !payload.chat_id) {
        return res.status(400).json({
          success: false,
          error: 'Invalid payload. chat_id and action are required.',
        });
      }

      console.log(`Processing telegram webhook action: ${payload.action} for chat_id: ${payload.chat_id}`);
      const result = await webhookService.handleWebhook(payload);

      return res.status(200).json(result);
    } catch (error: any) {
      console.error('Error handling Telegram webhook:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error',
      });
    }
  }
}
