const cron = require('node-cron');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

let jobs = [];

function start() {
  // 1. Clean up old unlock logs (90 days)
  const cleanLogs = cron.schedule('0 3 * * *', async () => {
    try {
      const { UnlockLog } = require('../models');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);

      const deleted = await UnlockLog.destroy({
        where: { created_at: { [Op.lt]: cutoff } }
      });

      logger.info(`Cron: ${deleted} eski kilit açma logu temizlendi (90 gün)`);
    } catch (error) {
      logger.error('Cron: Log temizleme hatası:', error);
    }
  }, { timezone: 'Europe/Istanbul' });
  jobs.push(cleanLogs);

  // 2. Clean up old screenshots (30 days)
  const cleanScreenshots = cron.schedule('0 4 * * *', async () => {
    try {
      const { Screenshot } = require('../models');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      const oldScreenshots = await Screenshot.findAll({
        where: { captured_at: { [Op.lt]: cutoff } }
      });

      let deletedFiles = 0;
      for (const ss of oldScreenshots) {
        const filePath = path.join(__dirname, '../../', ss.file_path);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedFiles++;
        }
      }

      const deletedRecords = await Screenshot.destroy({
        where: { captured_at: { [Op.lt]: cutoff } }
      });

      logger.info(`Cron: ${deletedRecords} eski screenshot (${deletedFiles} dosya) temizlendi (30 gün)`);
    } catch (error) {
      logger.error('Cron: Screenshot temizleme hatası:', error);
    }
  }, { timezone: 'Europe/Istanbul' });
  jobs.push(cleanScreenshots);

  // 3. Clean up expired sessions
  const cleanSessions = cron.schedule('0 */6 * * *', async () => {
    try {
      const { Session } = require('../models');
      const deleted = await Session.destroy({
        where: { expires_at: { [Op.lt]: new Date() } }
      });

      logger.info(`Cron: ${deleted} süresi dolmuş oturum temizlendi`);
    } catch (error) {
      logger.error('Cron: Oturum temizleme hatası:', error);
    }
  }, { timezone: 'Europe/Istanbul' });
  jobs.push(cleanSessions);

  // 4. Mark boards as offline if no heartbeat in 5 minutes
  const checkOffline = cron.schedule('*/2 * * * *', async () => {
    try {
      const { Board } = require('../models');
      const cutoff = new Date();
      cutoff.setMinutes(cutoff.getMinutes() - 5);

      const updated = await Board.update(
        { status: 'offline' },
        {
          where: {
            status: { [Op.in]: ['online', 'locked', 'unlocked'] },
            last_heartbeat: { [Op.lt]: cutoff }
          }
        }
      );

      if (updated[0] > 0) {
        logger.info(`Cron: ${updated[0]} tahta çevrimdışı olarak işaretlendi`);
      }
    } catch (error) {
      logger.error('Cron: Offline kontrol hatası:', error);
    }
  }, { timezone: 'Europe/Istanbul' });
  jobs.push(checkOffline);

  // 5. Clean old files (30 days old completed transfers)
  const cleanFiles = cron.schedule('0 5 * * 0', async () => {
    try {
      const { File } = require('../models');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);

      const oldFiles = await File.findAll({
        where: {
          status: 'completed',
          created_at: { [Op.lt]: cutoff }
        }
      });

      let deletedFiles = 0;
      for (const file of oldFiles) {
        const filePath = path.join(__dirname, '../../', file.stored_path);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedFiles++;
        }
      }

      await File.destroy({
        where: {
          status: 'completed',
          created_at: { [Op.lt]: cutoff }
        }
      });

      logger.info(`Cron: ${deletedFiles} eski dosya temizlendi`);
    } catch (error) {
      logger.error('Cron: Dosya temizleme hatası:', error);
    }
  }, { timezone: 'Europe/Istanbul' });
  jobs.push(cleanFiles);

  logger.info('✅ Cron job\'lar başlatıldı (5 görev)');
}

function stop() {
  jobs.forEach(job => job.stop());
  jobs = [];
  logger.info('Cron job\'lar durduruldu');
}

module.exports = { start, stop };
