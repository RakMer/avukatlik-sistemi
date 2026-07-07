import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller';

const router = Router();
const webhookController = new WebhookController();

// POST /api/v1/webhook/telegram
router.post('/telegram', webhookController.handleTelegramWebhook.bind(webhookController));

export default router;
