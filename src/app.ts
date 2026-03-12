import express, { Express } from 'express';
import { authRoutes } from './auth';
import { webhookRoutes } from './webhook';
import { subscriptionRoutes } from './subscriptions';
import { normalizerRoutes } from './email-normalizer';

const app: Express = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/auth', authRoutes);
app.use('/webhook', webhookRoutes);
app.use('/subscriptions', subscriptionRoutes);
app.use('/email', normalizerRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;
