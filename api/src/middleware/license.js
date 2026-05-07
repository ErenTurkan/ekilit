const { License, School } = require('../models');
const { Op } = require('sequelize');
const logger = require('../config/logger');

/**
 * Lisans kontrol middleware
 * - SuperAdmin her zaman geçer
 * - Principal/Teacher → okulun aktif lisansı olmalı
 * - Board → okulun aktif lisansı olmalı
 */
const checkLicense = async (req, res, next) => {
  try {
    // SuperAdmin lisans kontrolünden muaf
    if (req.user && req.user.role === 'superadmin') {
      return next();
    }

    // Okul ID'sini bul
    let schoolId = null;

    if (req.user && req.user.school_id) {
      schoolId = req.user.school_id;
    } else if (req.board && req.board.school_id) {
      schoolId = req.board.school_id;
    }

    if (!schoolId) {
      return next(); // Okul bağlantısı yoksa (superadmin durumu)
    }

    // Aktif lisansı kontrol et
    const activeLicense = await License.findOne({
      where: {
        school_id: schoolId,
        status: 'active',
        starts_at: { [Op.lte]: new Date() },
        expires_at: { [Op.gt]: new Date() }
      },
      order: [['expires_at', 'DESC']]
    });

    if (!activeLicense) {
      // Süresi dolmuş lisansları otomatik güncelle
      await License.update(
        { status: 'expired' },
        {
          where: {
            school_id: schoolId,
            status: 'active',
            expires_at: { [Op.lt]: new Date() }
          }
        }
      );

      logger.warn(`Lisans süresi dolmuş: Okul ID ${schoolId}`);

      return res.status(403).json({
        error: 'Lisansınız sona ermiş veya aktif bir lisansınız bulunmuyor.',
        code: 'LICENSE_EXPIRED',
        school_id: schoolId
      });
    }

    // Lisans bilgisini request'e ekle
    req.license = activeLicense;

    // Son kontrol zamanını güncelle
    await activeLicense.update({ last_check: new Date() });

    next();
  } catch (error) {
    logger.error('Lisans kontrol hatası:', error);
    // Lisans kontrolü başarısız olursa geçmesine izin ver (graceful degradation)
    next();
  }
};

/**
 * Board için lisans kontrolü
 * Board register ve heartbeat sırasında çağrılır
 */
const checkBoardLicense = async (req, res, next) => {
  try {
    const schoolId = req.board?.school_id;
    if (!schoolId) return next();

    const activeLicense = await License.findOne({
      where: {
        school_id: schoolId,
        status: 'active',
        starts_at: { [Op.lte]: new Date() },
        expires_at: { [Op.gt]: new Date() }
      }
    });

    if (!activeLicense) {
      return res.status(403).json({
        error: 'Bu okulun lisansı sona ermiş. Yöneticinize başvurun.',
        code: 'LICENSE_EXPIRED'
      });
    }

    // Tahta sayısı limiti kontrolü
    const { Board } = require('../models');
    const boardCount = await Board.count({ where: { school_id: schoolId } });

    if (boardCount >= activeLicense.max_boards) {
      return res.status(403).json({
        error: `Maksimum tahta sayısına (${activeLicense.max_boards}) ulaşıldı.`,
        code: 'LICENSE_BOARD_LIMIT'
      });
    }

    req.license = activeLicense;
    next();
  } catch (error) {
    logger.error('Board lisans kontrol hatası:', error);
    next();
  }
};

module.exports = { checkLicense, checkBoardLicense };
