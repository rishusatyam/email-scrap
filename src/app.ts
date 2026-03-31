import express, { Express } from 'express';
import { authRoutes } from './auth';
import { webhookRoutes } from './webhook';
import { subscriptionRoutes } from './subscriptions';
import { normalizerRoutes } from './email-normalizer';
import { mapperRoutes } from './mapper';
import { pdfRoutes } from './pdf-extractor';
import { pdfMapperRoutes } from './mapper/pdfmapper';

const app: Express = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/auth', authRoutes);
app.use('/webhook', webhookRoutes);
app.use('/subscriptions', subscriptionRoutes);
app.use('/email', normalizerRoutes);
app.use('/mapper', mapperRoutes);
app.use('/mapper/pdfmapper', pdfMapperRoutes);
app.use('/pdf', pdfRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;
