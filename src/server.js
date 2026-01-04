import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import cron from 'node-cron';
import config from './config/index.js';
import { testConnection, closePool } from './config/database.js';
import logger from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Import routes
import authRoutes from './routes/auth.routes.js';
import clientRoutes from './routes/client.routes.js';
import fileRoutes from './routes/file.routes.js';
import shareRoutes from './routes/share.routes.js';
import usageRoutes from './routes/usage.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import adminRoutes from './routes/admin.routes.js';
import activityRoutes from './routes/activity.routes.js';
import storageRoutes from './routes/storage.routes.js';
import browseRoutes from './routes/browse.routes.js';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors(config.cors)); // CORS
app.use(compression()); // Compress responses
app.use(express.json({ limit: '10mb' })); // Parse JSON
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } })); // Logging

// Handle OPTIONS requests explicitly for CORS preflight
app.options('*', cors(config.cors));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: config.env,
    version: config.apiVersion
  });
});

// API routes
const apiPrefix = `/api/${config.apiVersion}`;
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/clients`, clientRoutes);
app.use(`${apiPrefix}/client`, clientRoutes); // Alias for singular
app.use(`${apiPrefix}/files`, fileRoutes);
app.use(`${apiPrefix}/share`, shareRoutes);
app.use(`${apiPrefix}/usage`, usageRoutes);
app.use(`${apiPrefix}/settings`, settingsRoutes);
app.use(`${apiPrefix}/admin`, adminRoutes);
app.use(`${apiPrefix}/activity`, activityRoutes);
app.use(`${apiPrefix}/storage`, storageRoutes);
app.use(`${apiPrefix}/browse`, browseRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Cron jobs
// Reset monthly egress on the 1st of each month at 00:00
cron.schedule('0 0 1 * *', async () => {
  try {
    logger.info('Running monthly egress reset cron job');
    const { query } = await import('./config/database.js');
    await query('CALL reset_monthly_egress()');
    logger.info('Monthly egress reset completed successfully');
  } catch (error) {
    logger.error('Monthly egress reset failed:', error);
  }
});

// Clean up expired sessions daily at 02:00
cron.schedule('0 2 * * *', async () => {
  try {
    logger.info('Cleaning up expired sessions');
    const { query } = await import('./config/database.js');
    await query('DELETE FROM user_sessions WHERE expires_at < NOW()');
    logger.info('Session cleanup completed');
  } catch (error) {
    logger.error('Session cleanup failed:', error);
  }
});

// Start server
async function startServer() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    // Start listening
    const server = app.listen(config.port, () => {
      logger.info(`🚀 TrueBackup Backend Server Started`);
      logger.info(`📍 Environment: ${config.env}`);
      logger.info(`🌐 Port: ${config.port}`);
      logger.info(`🔗 API Base: http://localhost:${config.port}${apiPrefix}`);
      logger.info(`✅ Ready to accept connections`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        await closePool();
        logger.info('Graceful shutdown complete');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;
