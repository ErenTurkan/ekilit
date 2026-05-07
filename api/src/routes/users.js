const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const { User, School } = require('../models');
const { authenticate, authorize, schoolScope } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const logger = require('../config/logger');

router.use(authenticate);

// GET /users
router.get('/', authorize('superadmin', 'principal'), schoolScope, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (req.schoolId) where.school_id = req.schoolId;
    if (search) {
      where[Op.or] = [
        { full_name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }
    if (role) where.role = role;

    // Principals can only see teachers; superadmin sees all
    if (req.user.role === 'principal') {
      where.role = 'teacher';
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password_hash'] },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [{ model: School, as: 'school', attributes: ['id', 'name', 'school_code'] }]
    });

    res.json({
      users: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit) }
    });
  } catch (error) {
    logger.error('Get users error:', error);
    res.status(500).json({ error: 'Kullanıcılar alınamadı' });
  }
});

// POST /users
router.post('/', authorize('superadmin', 'principal'), validate(schemas.createUser), async (req, res) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const { password, full_name, phone } = req.body;
    let role = req.body.role;

    // Determine final school_id
    let final_school_id;
    if (req.user.role === 'principal') {
      // Principals can only create teachers in their own school
      role = 'teacher';
      final_school_id = req.user.school_id;

      if (!final_school_id) {
        return res.status(400).json({ error: 'Müdür hesabı bir okula bağlı değil. Lütfen sistem yöneticisi ile iletişime geçin.' });
      }
    } else {
      // Superadmins use the school_id from body
      final_school_id = req.body.school_id || null;
      role = role || 'teacher';
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'Bu e-posta adresi zaten kullanılıyor' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const qr_secret = uuidv4();

    const user = await User.create({
      email,
      password_hash,
      full_name,
      phone,
      role,
      school_id: final_school_id,
      qr_secret
    });

    const result = user.toJSON();
    delete result.password_hash;

    logger.info(`User created: ${email} (${role}) at school ${final_school_id}`);
    res.status(201).json({ message: 'Kullanıcı başarıyla oluşturuldu', user: result });
  } catch (error) {
    logger.error('Create user error:', error);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ error: 'Doğrulama hatası', details: error.errors.map(e => e.message) });
    }
    res.status(500).json({ error: 'Kullanıcı oluşturulurken hata oluştu' });
  }
});

// GET /users/:id
router.get('/:id', authorize('superadmin', 'principal'), schoolScope, async (req, res) => {
  try {
    const where = { id: req.params.id };
    if (req.schoolId) where.school_id = req.schoolId;

    const user = await User.findOne({
      where,
      attributes: { exclude: ['password_hash'] },
      include: [{ model: School, as: 'school', attributes: ['id', 'name', 'school_code'] }]
    });

    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    res.json({ user });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Kullanıcı bilgileri alınamadı' });
  }
});

// PUT /users/:id
router.put('/:id', authorize('superadmin', 'principal'), schoolScope, validate(schemas.updateUser), async (req, res) => {
  try {
    const where = { id: req.params.id };
    if (req.schoolId) where.school_id = req.schoolId;

    const user = await User.findOne({ where });
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    // Normalize email if provided
    if (req.body.email) {
      req.body.email = req.body.email.toLowerCase().trim();
    }

    // Principals cannot change role
    if (req.user.role === 'principal' && req.body.role) {
      delete req.body.role;
    }

    await user.update(req.body);
    const result = user.toJSON();
    delete result.password_hash;

    res.json({ message: 'Kullanıcı başarıyla güncellendi', user: result });
  } catch (error) {
    logger.error('Update user error:', error);
    res.status(500).json({ error: 'Kullanıcı güncellenirken hata oluştu' });
  }
});

// DELETE /users/:id
router.delete('/:id', authorize('superadmin', 'principal'), schoolScope, async (req, res) => {
  try {
    const where = { id: req.params.id };
    if (req.schoolId) where.school_id = req.schoolId;

    const user = await User.findOne({ where });
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz' });
    }

    await user.destroy();
    logger.info(`User deleted: ${user.email}`);
    res.json({ message: 'Kullanıcı başarıyla silindi' });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({ error: 'Kullanıcı silinirken hata oluştu' });
  }
});

module.exports = router;
