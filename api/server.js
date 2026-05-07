require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const path = require('path');
const { initializeWebSocket } = require('./src/websocket');
const { sequelize } = require('./src/config/database');
const logger = require('./src/config/logger');
const cronJobs = require('./src/services/cronJobs');

// Import routes
const authRoutes = require('./src/routes/auth');
const schoolRoutes = require('./src/routes/schools');
const userRoutes = require('./src/routes/users');
const boardRoutes = require('./src/routes/boards');
const unlockRoutes = require('./src/routes/unlock');
const usbKeyRoutes = require('./src/routes/usbKeys');
const reportRoutes = require('./src/routes/reports');
const fileRoutes = require('./src/routes/files');
const announcementRoutes = require('./src/routes/announcements');
const siteRuleRoutes = require('./src/routes/siteRules');
const licenseRoutes = require('./src/routes/licenses');
const { checkLicense } = require('./src/middleware/license');

const app = express();
const server = http.createServer(app);

// Initialize WebSocket
initializeWebSocket(server);

// Security middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.CORS_ORIGIN === '*' ? true : process.env.CORS_ORIGIN?.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Board-Token']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.' }
});
app.use(limiter);

// Auth rate limiting (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' }
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'E-Kilit API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// API Routes
app.use('/auth', authLimiter, authRoutes);
app.use('/licenses', licenseRoutes);
app.use('/schools', schoolRoutes);
app.use('/users', checkLicense, userRoutes);
app.use('/boards', checkLicense, boardRoutes);
app.use('/unlock', checkLicense, unlockRoutes);
app.use('/usb-keys', checkLicense, usbKeyRoutes);
app.use('/reports', checkLicense, reportRoutes);
app.use('/files', checkLicense, fileRoutes);
app.use('/announcements', checkLicense, announcementRoutes);
app.use('/site-rules', checkLicense, siteRuleRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint bulunamadı', path: req.path });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', { error: err.message, stack: err.stack, path: req.path });
  
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Doğrulama hatası',
      details: err.errors?.map(e => ({ field: e.path, message: e.message }))
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: 'Bu kayıt zaten mevcut',
      details: err.errors?.map(e => ({ field: e.path, message: e.message }))
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Dosya boyutu çok büyük' });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Sunucu hatası' : err.message
  });
});

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Test database connection with retries (especially for Docker)
    let authenticated = false;
    let retries = 10;
    while (!authenticated && retries > 0) {
      try {
        await sequelize.authenticate();
        authenticated = true;
        logger.info('✅ Veritabanı bağlantısı başarılı');
      } catch (err) {
        retries--;
        if (retries === 0) throw err;
        logger.warn(`⚠️ Veritabanı bağlantısı başarısız, tekrar deneniyor (${retries} deneme kaldı)...`);
        await new Promise(res => setTimeout(res, 5000));
      }
    }

    // Sync database
    await sequelize.sync();
    logger.info('✅ Veritabanı tabloları senkronize edildi');

    // Seed initial data (only if development or empty)
    if (process.env.NODE_ENV === 'development') {
      const { seed } = require('./src/services/seed');
      await seed();
    }

    // Start cron jobs
    cronJobs.start();
    logger.info('✅ Cron job\'lar başlatıldı');

    // Start listening
    server.listen(PORT, () => {
      logger.info(`🚀 E-Kilit API çalışıyor: http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('❌ Sunucu başlatılamadı:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM alındı. Sunucu kapatılıyor...');
  cronJobs.stop();
  await sequelize.close();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  logger.info('SIGINT alındı. Sunucu kapatılıyor...');
  cronJobs.stop();
  await sequelize.close();
  server.close(() => process.exit(0));
});

module.exports = { app, server };
