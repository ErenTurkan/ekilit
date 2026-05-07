const router = require('express').Router();
const { License, School, User } = require('../models');
const { Op } = require('sequelize');
const { authenticate, authorize } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

// ============================================================
// GET /licenses — Tüm lisansları listele (SuperAdmin)
// ============================================================
router.get('/', authenticate, authorize('superadmin'), async (req, res) => {
  try {
    const { status, school_id, type } = req.query;
    const where = {};
    if (status) where.status = status;
    if (school_id) where.school_id = school_id;
    if (type) where.type = type;

    const licenses = await License.findAll({
      where,
      include: [
        { model: School, as: 'school', attributes: ['id', 'school_code', 'name', 'city'] },
        { model: User, as: 'creator', attributes: ['id', 'full_name', 'email'] }
      ],
      order: [['created_at', 'DESC']]
    });

    // Süresi dolmuşları otomatik güncelle
    const now = new Date();
    for (const lic of licenses) {
      if (lic.status === 'active' && lic.expires_at < now) {
        await lic.update({ status: 'expired' });
        lic.status = 'expired';
      }
    }

    res.json({ licenses });
  } catch (error) {
    logger.error('Lisans listeleme hatası:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// ============================================================
// POST /licenses — Yeni lisans oluştur (SuperAdmin)
// ============================================================
router.post('/', authenticate, authorize('superadmin'), async (req, res) => {
  try {
    const { school_id, type, starts_at, expires_at, max_boards, notes } = req.body;

    // Okul kontrolü
    const school = await School.findByPk(school_id);
    if (!school) {
      return res.status(404).json({ error: 'Okul bulunamadı' });
    }

    // Benzersiz lisans anahtarı
    const license_key = `EK-${type?.toUpperCase()?.slice(0, 3) || 'TRI'}-${Date.now().toString(36).toUpperCase()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    const license = await License.create({
      school_id,
      license_key,
      type: type || 'monthly',
      status: 'active',
      starts_at: starts_at || new Date(),
      expires_at: expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default 30 gün
      max_boards: max_boards || 50,
      notes,
      created_by: req.user.id,
      activated_at: new Date()
    });

    // Okulun eski süresi dolmuş lisanslarını temizle
    await License.update(
      { status: 'expired' },
      {
        where: {
          school_id,
          id: { [Op.ne]: license.id },
          status: 'active',
          expires_at: { [Op.lt]: new Date() }
        }
      }
    );

    logger.info(`Yeni lisans oluşturuldu: ${license_key} → Okul ${school.name}`);

    res.status(201).json({
      message: 'Lisans başarıyla oluşturuldu',
      license: {
        ...license.toJSON(),
        school
      }
    });
  } catch (error) {
    logger.error('Lisans oluşturma hatası:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// ============================================================
// PUT /licenses/:id — Lisans güncelle (SuperAdmin)
// ============================================================
router.put('/:id', authenticate, authorize('superadmin'), async (req, res) => {
  try {
    const license = await License.findByPk(req.params.id);
    if (!license) {
      return res.status(404).json({ error: 'Lisans bulunamadı' });
    }

    const { type, status, expires_at, max_boards, notes } = req.body;

    await license.update({
      ...(type && { type }),
      ...(status && { status }),
      ...(expires_at && { expires_at }),
      ...(max_boards && { max_boards }),
      ...(notes !== undefined && { notes })
    });

    logger.info(`Lisans güncellendi: ${license.license_key}`);
    res.json({ message: 'Lisans güncellendi', license });
  } catch (error) {
    logger.error('Lisans güncelleme hatası:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// ============================================================
// DELETE /licenses/:id — Lisans sil (SuperAdmin)
// ============================================================
router.delete('/:id', authenticate, authorize('superadmin'), async (req, res) => {
  try {
    const license = await License.findByPk(req.params.id);
    if (!license) {
      return res.status(404).json({ error: 'Lisans bulunamadı' });
    }

    await license.destroy();
    logger.info(`Lisans silindi: ${license.license_key}`);
    res.json({ message: 'Lisans silindi' });
  } catch (error) {
    logger.error('Lisans silme hatası:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// ============================================================
// GET /licenses/check — Mevcut kullanıcının okulunun lisansını kontrol et
// ============================================================
router.get('/check', authenticate, async (req, res) => {
  try {
    // SuperAdmin her zaman geçerli
    if (req.user.role === 'superadmin') {
      return res.json({ valid: true, type: 'superadmin', message: 'Süper yönetici — sınırsız erişim' });
    }

    const schoolId = req.user.school_id;
    if (!schoolId) {
      return res.status(400).json({ valid: false, error: 'Okul bağlantısı yok' });
    }

    const activeLicense = await License.findOne({
      where: {
        school_id: schoolId,
        status: 'active',
        starts_at: { [Op.lte]: new Date() },
        expires_at: { [Op.gt]: new Date() }
      },
      include: [{ model: School, as: 'school', attributes: ['name', 'school_code'] }],
      order: [['expires_at', 'DESC']]
    });

    if (!activeLicense) {
      // Süresi dolmuş mı kontrol et
      const expiredLicense = await License.findOne({
        where: { school_id: schoolId },
        order: [['expires_at', 'DESC']]
      });

      return res.json({
        valid: false,
        expired: !!expiredLicense,
        expired_at: expiredLicense?.expires_at,
        message: 'Lisansınız sona ermiş veya aktif bir lisansınız bulunmuyor.'
      });
    }

    // Kalan gün
    const remainingMs = new Date(activeLicense.expires_at) - Date.now();
    const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

    res.json({
      valid: true,
      license: {
        key: activeLicense.license_key,
        type: activeLicense.type,
        expires_at: activeLicense.expires_at,
        remaining_days: remainingDays,
        max_boards: activeLicense.max_boards,
        school: activeLicense.school
      }
    });
  } catch (error) {
    logger.error('Lisans kontrol hatası:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// ============================================================
// POST /licenses/create-trial — Yeni okul kaydında 3 günlük trial oluştur
// Bu endpoint okul oluşturma sırasında otomatik çağrılır
// ============================================================
router.post('/create-trial', authenticate, async (req, res) => {
  try {
    const { school_id } = req.body;

    const school = await School.findByPk(school_id);
    if (!school) {
      return res.status(404).json({ error: 'Okul bulunamadı' });
    }

    // Zaten lisansı var mı?
    const existing = await License.findOne({ where: { school_id } });
    if (existing) {
      return res.status(400).json({ error: 'Bu okulun zaten bir lisansı var' });
    }

    const license_key = `EK-TRI-${Date.now().toString(36).toUpperCase()}-${uuidv4().slice(0, 8).toUpperCase()}`;

    const license = await License.create({
      school_id,
      license_key,
      type: 'trial',
      status: 'active',
      starts_at: new Date(),
      expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 gün
      max_boards: 10, // Trial'da 10 tahta limiti
      notes: 'Otomatik oluşturulan 3 günlük deneme lisansı',
      created_by: req.user?.id || null,
      activated_at: new Date()
    });

    logger.info(`Trial lisans oluşturuldu: ${license_key} → Okul ${school.name}`);

    res.status(201).json({ message: '3 günlük deneme lisansı oluşturuldu', license });
  } catch (error) {
    logger.error('Trial lisans hatası:', error);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

module.exports = router;
