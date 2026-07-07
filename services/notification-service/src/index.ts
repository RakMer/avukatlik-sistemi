import express from 'express';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { PrismaClient, NotificationType, NotificationStatus, HearingStatus } from '@prisma/client';
import http from 'http';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;
const prisma = new PrismaClient();

// n8n reminder webhook endpoint
const N8N_REMINDER_URL = process.env.N8N_REMINDER_URL || 'http://n8n:5678/webhook/reminder';

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'notification-service' });
});

/**
 * Trigger reminders manually for testing
 */
app.post('/api/v1/notifications/trigger', async (req, res) => {
  try {
    console.log('Manually triggering hearing reminders...');
    const result = await checkAndSendReminders();
    res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('Error triggering reminders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Helper to make a POST request to n8n webhook
 */
function sendToN8n(payload: any): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL(N8N_REMINDER_URL);
    const postData = JSON.stringify(payload);

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve(true);
      } else {
        console.error(`n8n returned status code: ${res.statusCode}`);
        resolve(false);
      }
    });

    req.on('error', (e) => {
      console.error(`Problem with request to n8n: ${e.message}`);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Checks for upcoming hearings and sends notifications
 */
async function checkAndSendReminders() {
  const now = new Date();
  
  // Define time windows for 1, 3 and 7 days reminders
  const checkIntervals = [
    { days: 1, type: NotificationType.REMINDER_1D, label: '1 gün' },
    { days: 3, type: NotificationType.REMINDER_3D, label: '3 gün' },
    { days: 7, type: NotificationType.REMINDER_7D, label: '7 gün' },
  ];

  let notificationsSent = 0;
  let notificationsFailed = 0;

  for (const interval of checkIntervals) {
    // Start and end of the target day
    const targetStart = new Date(now);
    targetStart.setDate(now.getDate() + interval.days);
    targetStart.setHours(0, 0, 0, 0);

    const targetEnd = new Date(now);
    targetEnd.setDate(now.getDate() + interval.days);
    targetEnd.setHours(23, 59, 59, 999);

    console.log(`Checking hearings scheduled between ${targetStart.toISOString()} and ${targetEnd.toISOString()} (${interval.label} öncelikli)...`);

    // Fetch scheduled hearings within this range
    const hearings = await prisma.hearing.findMany({
      where: {
        hearingDate: {
          gte: targetStart,
          lte: targetEnd,
        },
        status: HearingStatus.SCHEDULED,
      },
      include: {
        case: {
          include: {
            lawyer: true,
            client: true,
          },
        },
      },
    });

    console.log(`Found ${hearings.length} hearings for ${interval.label} reminder.`);

    for (const hearing of hearings) {
      const caseItem = hearing.case;
      const lawyer = caseItem.lawyer;
      const client = caseItem.client;

      // Ensure lawyer has a telegramChatId
      if (!lawyer.telegramChatId) {
        console.warn(`Lawyer ${lawyer.fullName} has no Telegram Chat ID configured. Skipping notification.`);
        continue;
      }

      // Check if this notification was already sent
      const alreadySent = await prisma.notification.findFirst({
        where: {
          hearingId: hearing.id,
          type: interval.type,
          status: NotificationStatus.SENT,
        },
      });

      if (alreadySent) {
        console.log(`Notification of type ${interval.type} already sent for hearing ${hearing.id}. Skipping.`);
        continue;
      }

      // Create message text
      const dateStr = hearing.hearingDate.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
      const message = `🔔 *DURUŞMA HATIRLATMASI* (${interval.label} Kaldı)\n\n👤 *Müvekkil:* ${client.fullName}\n⚖️ *Mahkeme:* ${caseItem.courtName || 'Belirtilmemiş'}\n📂 *Dosya No:* ${caseItem.caseNumber}\n📅 *Duruşma Zamanı:* ${dateStr}\n📍 *Konum/Salon:* ${hearing.location || 'Belirtilmemiş'}\n📝 *Notlar:* ${hearing.notes || 'Yok'}`;

      // Insert pending notification record
      const dbNotification = await prisma.notification.create({
        data: {
          hearingId: hearing.id,
          lawyerId: lawyer.id,
          type: interval.type,
          status: NotificationStatus.PENDING,
          message,
        },
      });

      // Send payload to n8n webhook
      const n8nPayload = {
        telegram_chat_id: lawyer.telegramChatId,
        message,
        hearing_id: hearing.id,
        notification_type: interval.type,
      };

      console.log(`Sending reminder to n8n webhook for hearing: ${hearing.id}...`);
      const success = await sendToN8n(n8nPayload);

      if (success) {
        await prisma.notification.update({
          where: { id: dbNotification.id },
          data: {
            status: NotificationStatus.SENT,
            sentAt: new Date(),
          },
        });
        notificationsSent++;
        console.log(`Notification sent and updated to SENT for hearing: ${hearing.id}`);
      } else {
        await prisma.notification.update({
          where: { id: dbNotification.id },
          data: { status: NotificationStatus.FAILED },
        });
        notificationsFailed++;
        console.error(`Failed to send notification via n8n for hearing: ${hearing.id}`);
      }
    }
  }

  return {
    sent: notificationsSent,
    failed: notificationsFailed,
  };
}

// Schedule the cron job to run daily at 9:00 AM (Europe/Istanbul time)
// Cron expression: "0 9 * * *"
cron.schedule('0 9 * * *', async () => {
  console.log('⏰ Running scheduled daily hearing reminder cron job (09:00)...');
  try {
    const result = await checkAndSendReminders();
    console.log(`Scheduled reminder cron complete. Sent: ${result.sent}, Failed: ${result.failed}`);
  } catch (error) {
    console.error('CRITICAL: Scheduled reminder cron job failed:', error);
  }
}, {
  timezone: 'Europe/Istanbul'
});

app.listen(PORT, () => {
  console.log(`🚀 notification-service is running on port ${PORT}`);
  console.log('⏰ Hearing reminder cron job is registered.');
});
