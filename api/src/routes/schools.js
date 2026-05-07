const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { School, User, Board, License } = require('../models');
const { authenticate, authorize, schoolScope } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const logger = require('../config/logger');

// All routes require authentication
router.use(authenticate);

// GET /schools
router.get('/', authorize('superadmin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { school_code: { [Op.like]: `%${search}%` } },
        { city: { [Op.like]: `%${search}%` } }
      ];
    }
    if (status) where.status = status;

    const { count, rows } = await School.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        { model: Board, as: 'boards', attributes: ['id', 'status'] },
        { model: User, as: 'users', attributes: ['id', 'role'] },
        { model: License, as: 'licenses', attributes: ['id', 'type', 'status', 'expires_at', 'max_boards'] }
      ]
    });

    // Calculate stats for each school
    const schools = rows.map(school => {
      const data = school.toJSON();
      data.stats = {
        total_boards: data.boards?.length || 0,
        online_boards: data.boards?.filter(b => b.status === 'online' || b.status === 'unlocked').length || 0,
        total_users: data.users?.length || 0,
        principals: data.users?.filter(u => u.role === 'principal').length || 0,
        teachers: data.users?.filter(u => u.role === 'teacher').length || 0
      };
      delete data.boards;
      delete data.users;
      return data;
    });

    res.json({
      schools,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    logger.error('Get schools error:', error);
    res.status(500).json({ error: 'Okullar alınırken hata oluştu' });
  }
});

// POST /schools
router.post('/', authorize('superadmin'), validate(schemas.createSchool), async (req, res) => {
  try {
    const school = await School.create(req.body);

    // Otomatik 3 günlük trial lisans oluştur
    const { v4: uuidv4 } = require('uuid');
    const license_key = `EK-TRI-${Date.now().toString(36).toUpperCase()}-${uuidv4().slice(0, 8).toUpperCase()}`;
    const trialLicense = await License.create({
      school_id: school.id,
      license_key,
      type: 'trial',
      status: 'active',
      starts_at: new Date(),
      expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      max_boards: 10,
      notes: 'Otomatik 3 günlük deneme lisansı',
      created_by: req.user.id,
      activated_at: new Date()
    });

    logger.info(`School created: ${school.name} (${school.school_code}) + Trial license: ${license_key}`);
    res.status(201).json({ message: 'Okul ve 3 günlük deneme lisansı oluşturuldu', school, license: trialLicense });
  } catch (error) {
    logger.error('Create school error:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Bu okul kodu zaten kullanılıyor' });
    }
    res.status(500).json({ error: 'Okul oluşturulurken hata oluştu' });
  }
});

// GET /schools/:id
router.get('/:id', authorize('superadmin', 'principal'), schoolScope, async (req, res) => {
  try {
    const where = { id: req.params.id };
    if (req.schoolId) where.id = req.schoolId;

    const school = await School.findOne({ where });
    if (!school) {
      return res.status(404).json({ error: 'Okul bulunamadı' });
    }

    res.json({ school });
  } catch (error) {
    logger.error('Get school error:', error);
    res.status(500).json({ error: 'Okul bilgileri alınamadı' });
  }
});

// GET /schools/:id/stats
router.get('/:id/stats', authorize('superadmin', 'principal'), schoolScope, async (req, res) => {
  try {
    const schoolId = req.schoolId || req.params.id;

    const [boardCount, onlineCount, userCount, teacherCount] = await Promise.all([
      Board.count({ where: { school_id: schoolId } }),
      Board.count({ where: { school_id: schoolId, status: { [Op.in]: ['online', 'unlocked'] } } }),
      User.count({ where: { school_id: schoolId } }),
      User.count({ where: { school_id: schoolId, role: 'teacher' } })
    ]);

    res.json({
      stats: {
        total_boards: boardCount,
        online_boards: onlineCount,
        offline_boards: boardCount - onlineCount,
        total_users: userCount,
        teachers: teacherCount,
        principals: userCount - teacherCount
      }
    });
  } catch (error) {
    logger.error('Get school stats error:', error);
    res.status(500).json({ error: 'İstatistikler alınamadı' });
  }
});

// PUT /schools/:id
router.put('/:id', authorize('superadmin'), validate(schemas.updateSchool), async (req, res) => {
  try {
    const school = await School.findByPk(req.params.id);
    if (!school) {
      return res.status(404).json({ error: 'Okul bulunamadı' });
    }

    await school.update(req.body);
    res.json({ message: 'Okul başarıyla güncellendi', school });
  } catch (error) {
    logger.error('Update school error:', error);
    res.status(500).json({ error: 'Okul güncellenirken hata oluştu' });
  }
});

// DELETE /schools/:id
router.delete('/:id', authorize('superadmin'), async (req, res) => {
  try {
    const school = await School.findByPk(req.params.id);
    if (!school) {
      return res.status(404).json({ error: 'Okul bulunamadı' });
    }

    await school.destroy();
    logger.info(`School deleted: ${school.name}`);
    res.json({ message: 'Okul başarıyla silindi' });
  } catch (error) {
    logger.error('Delete school error:', error);
    res.status(500).json({ error: 'Okul silinirken hata oluştu' });
  }
});

module.exports = router;
