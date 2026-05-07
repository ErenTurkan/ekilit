const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { SiteRule, School, User } = require('../models');
const { authenticate, authenticateBoard, authorize, schoolScope } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { getIO } = require('../websocket');
const logger = require('../config/logger');

// GET /site-rules/board - Rules for a specific board (board app endpoint)
router.get('/board', authenticateBoard, async (req, res) => {
  try {
    const board = req.board;

    const rules = await SiteRule.findAll({
      where: { school_id: board.school_id },
      attributes: ['id', 'domain', 'type'],
      order: [['type', 'ASC'], ['domain', 'ASC']]
    });

    res.json({ rules });
  } catch (error) {
    logger.error('Get board site rules error:', error);
    res.status(500).json({ error: 'Site kuralları alınamadı' });
  }
});

// Admin routes
router.use(authenticate);
router.use(authorize('superadmin', 'principal'));
router.use(schoolScope);

// GET /site-rules
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 100, type } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (req.schoolId) where.school_id = req.schoolId;
    if (type) where.type = type;

    const { count, rows } = await SiteRule.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['type', 'ASC'], ['domain', 'ASC']],
      include: [
        { model: User, as: 'creator', attributes: ['id', 'full_name'] }
      ]
    });

    res.json({
      rules: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit) }
    });
  } catch (error) {
    logger.error('Get site rules error:', error);
    res.status(500).json({ error: 'Site kuralları alınamadı' });
  }
});

// POST /site-rules
router.post('/', validate(schemas.createSiteRule), async (req, res) => {
  try {
    const school_id = (req.user.role === 'superadmin' && req.body.school_id) 
        ? req.body.school_id 
        : (req.schoolId || req.user.school_id);
    
    if (!school_id) return res.status(400).json({ error: 'Okul seçimi gerekli' });

    // Check if rule already exists
    const existing = await SiteRule.findOne({
      where: { school_id, domain: req.body.domain, type: req.body.type }
    });

    if (existing) {
      return res.status(409).json({ error: 'Bu kural zaten mevcut' });
    }

    const rule = await SiteRule.create({
      school_id,
      domain: req.body.domain,
      type: req.body.type,
      created_by: req.user.id
    });

    // Notify boards to update rules
    const io = getIO();
    if (io) {
      io.to(`school_${school_id}`).emit('board:site-rules-update', { action: 'add', rule });
    }

    logger.info(`Site rule created: ${req.body.type} ${req.body.domain}`);
    res.status(201).json({ message: 'Kural eklendi', rule });
  } catch (error) {
    logger.error('Create site rule error:', error);
    res.status(500).json({ error: 'Kural eklenirken hata oluştu' });
  }
});

// DELETE /site-rules/:id
router.delete('/:id', async (req, res) => {
  try {
    const where = { id: req.params.id };
    if (req.schoolId) where.school_id = req.schoolId;

    const rule = await SiteRule.findOne({ where });
    if (!rule) {
      return res.status(404).json({ error: 'Kural bulunamadı' });
    }

    const school_id = rule.school_id;
    await rule.destroy();

    // Notify boards
    const io = getIO();
    if (io) {
      io.to(`school_${school_id}`).emit('board:site-rules-update', { action: 'remove', rule_id: req.params.id });
    }

    res.json({ message: 'Kural silindi' });
  } catch (error) {
    logger.error('Delete site rule error:', error);
    res.status(500).json({ error: 'Kural silinirken hata oluştu' });
  }
});

module.exports = router;
