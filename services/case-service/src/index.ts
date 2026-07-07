import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import webhookRouter from './routes/webhook.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/v1/webhook', webhookRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'case-service' });
});

app.listen(PORT, () => {
  console.log(`🚀 case-service is running on port ${PORT}`);
});
