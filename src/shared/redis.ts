import { ConnectionOptions } from 'bullmq';
import dotenv from 'dotenv';

dotenv.config();

// Shared Redis connection options used by all queues and workers
export const redisConnection: ConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379
};
