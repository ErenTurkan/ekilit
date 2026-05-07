const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const crypto = require('crypto');
const { UsbKey, User, School } = require('../models');
const { authenticate, authorize, schoolScope } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const logger = require('../config/logger');

const normalizeUsbSerial = (keySerial) => {
  const value = (keySerial || '').trim();
  if (/^[a-f0-9]{64}$/i.test(value)) {
    return value.toLowerCase();
  }

  return crypto.createHash('sha256').update(value).digest('hex');
};

router.use(authenticate);
router.use(authorize('superadmin', 'principal'));
router.use(schoolScope);

// GET /usb-keys
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (req.schoolId) where.school_id = req.schoolId;
    if (search) {
      where[Op.or] = [
        { label: { [Op.like]: `%${search}%` } },
        { key_serial: { [Op.like]: `%${search}%` } }
      ];
    }
    if (status) where.status = status;

    const { count, rows } = await UsbKey.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        { model: User, as: 'user', attributes: ['id', 'full_name', 'email'] },
        { model: School, as: 'school', attributes: ['id', 'name'] }
      ]
    });

    res.json({
      usb_keys: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit) }
    });
  } catch (error) {
    logger.error('Get USB keys error:', error);
    res.status(500).json({ error: 'USB anahtarları alınamadı' });
  }
});

// POST /usb-keys - Create / register USB key
router.post('/', validate(schemas.createUsbKey), async (req, res) => {
  try {
    const { key_serial, user_id, label } = req.body;
    const normalizedSerial = normalizeUsbSerial(key_serial);
    const school_id = (req.user.role === 'superadmin' && req.body.school_id) 
        ? req.body.school_id 
        : (req.schoolId || req.user.school_id);

    // Check if serial already registered
    const existing = await UsbKey.findOne({ where: { key_serial: normalizedSerial } });
    if (existing) {
      return res.status(409).json({ error: 'Bu USB seri numarası zaten kayıtlı' });
    }

    const usbKey = await UsbKey.create({
      key_serial: normalizedSerial,
      user_id,
      school_id,
      label: label || `USB-${normalizedSerial.slice(0, 8)}`
    });

    logger.info(`USB key created: ${usbKey.label} for school ${school_id}`);

    res.status(201).json({
      message: 'USB anahtarı oluşturuldu',
      usb_key: {
        id: usbKey.id,
        label: usbKey.label,
        status: usbKey.status,
        created_at: usbKey.created_at
      }
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Bu USB seri numarası zaten kayıtlı' });
    }

    logger.error('Create USB key error:', error);
    res.status(500).json({ error: 'USB anahtarı oluşturulurken hata oluştu' });
  }
});

// PUT /usb-keys/:id
router.put('/:id', async (req, res) => {
  try {
    const where = { id: req.params.id };
    if (req.schoolId) where.school_id = req.schoolId;

    const usbKey = await UsbKey.findOne({ where });
    if (!usbKey) {
      return res.status(404).json({ error: 'USB anahtarı bulunamadı' });
    }

    const { label, user_id, status } = req.body;
    const updates = {};
    if (label !== undefined) updates.label = label;
    if (user_id !== undefined) updates.user_id = user_id;
    if (status !== undefined) updates.status = status;

    await usbKey.update(updates);
    res.json({ message: 'USB anahtarı güncellendi', usb_key: usbKey });
  } catch (error) {
    logger.error('Update USB key error:', error);
    res.status(500).json({ error: 'USB anahtarı güncellenirken hata oluştu' });
  }
});

// DELETE /usb-keys/:id/revoke
router.delete('/:id/revoke', async (req, res) => {
  try {
    const where = { id: req.params.id };
    if (req.schoolId) where.school_id = req.schoolId;

    const usbKey = await UsbKey.findOne({ where });
    if (!usbKey) {
      return res.status(404).json({ error: 'USB anahtarı bulunamadı' });
    }

    await usbKey.update({ status: 'revoked', revoked_at: new Date() });
    logger.info(`USB key revoked: ${usbKey.label}`);

    res.json({ message: 'USB anahtarı iptal edildi' });
  } catch (error) {
    logger.error('Revoke USB key error:', error);
    res.status(500).json({ error: 'USB anahtarı iptal edilirken hata oluştu' });
  }
});

// POST /usb-keys/delete-key/:id - USB anahtarını sadece veritabanından sil
router.post('/delete-key/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || id === 'undefined') return res.status(400).json({ error: 'Geçersiz USB ID' });

    const where = { id };
    if (req.schoolId) where.school_id = req.schoolId;

    const usbKey = await UsbKey.findOne({ where });
    if (!usbKey) {
      return res.status(404).json({ error: 'USB anahtarı bulunamadı' });
    }

    // Sadece veritabanından sil - Tahtalar zaten senkronize olduğu için anahtar geçersiz kalacak
    await usbKey.destroy();
    logger.info(`USB key veritabanından silindi: ${usbKey.label}`);

    res.json({ 
      message: 'USB anahtarı veritabanından silindi'
    });
  } catch (error) {
    logger.error('Delete USB key error:', error);
    res.status(500).json({ error: 'USB anahtarı silinirken hata oluştu' });
  }
});

// GET /usb-keys/board-cache - Board-specific USB cache (no auth required, uses board token)
router.get('/board-cache', async (req, res) => {
  try {
    const boardToken = req.headers['x-board-token'];
    if (!boardToken) {
      return res.status(401).json({ error: 'Board token gerekli' });
    }

    // Verify board token
    const { BoardToken, Board } = require('../models');
    const tokenRecord = await BoardToken.findOne({
      where: { token: boardToken },
      include: [{ model: Board, as: 'board' }]
    });

    if (!tokenRecord || !tokenRecord.board) {
      return res.status(401).json({ error: 'Geçersiz board token' });
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Board token süresi dolmuş' });
    }

    const board = tokenRecord.board;
    
    // Get active USB keys for this board's school
    const { UsbKey, User } = require('../models');
    const usbKeys = await UsbKey.findAll({
      where: {
        school_id: board.school_id,
        status: 'active'
      },
      include: [
        { model: User, as: 'user', attributes: ['id', 'full_name', 'email'] }
      ],
      attributes: ['id', 'key_serial', 'label', 'user_id']
    });

    res.json({
      usb_keys: usbKeys.map(key => ({
        id: key.id,
        key_serial: key.key_serial,
        label: key.label,
        user: key.user ? {
          id: key.user.id,
          full_name: key.user.full_name,
          email: key.user.email
        } : null
      })),
      synced_at: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Board USB cache error:', error);
    res.status(500).json({ error: 'USB cache alınamadı' });
  }
});

module.exports = router;
