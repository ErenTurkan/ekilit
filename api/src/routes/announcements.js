const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Announcement, School, User } = require('../models');
const { authenticate, authenticateBoard, authorize, schoolScope } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { getIO } = require('../websocket');
const logger = require('../config/logger');

// GET /announcements/active - Active announcements for boards
router.get('/active', authenticateBoard, async (req, res) => {
  try {
    const board = req.board;
    const now = new Date();

    const announcements = await Announcement.findAll({
      where: {
        is_active: true,
        [Op.or]: [
          { school_id: board.school_id },
          { school_id: null }
        ],
        [Op.and]: [
          { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: now } }] },
          { [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gte]: now } }] }
        ]
      },
      order: [['priority', 'DESC'], ['created_at', 'DESC']],
      attributes: ['id', 'title', 'content', 'image_url', 'priority']
    });

    res.json({ announcements });
  } catch (error) {
    logger.error('Get active announcements error:', error);
    res.status(500).json({ error: 'Duyurular alınamadı' });
  }
});

// All other routes require admin auth
router.use(authenticate);
router.use(authorize('superadmin', 'principal'));
router.use(schoolScope);

// GET /announcements
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (req.schoolId) {
      where[Op.or] = [
        { school_id: req.schoolId },
        { school_id: null }
      ];
    }

    const { count, rows } = await Announcement.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        { model: School, as: 'school', attributes: ['id', 'name'] },
        { model: User, as: 'creator', attributes: ['id', 'full_name'] }
      ]
    });

    res.json({
      announcements: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit) }
    });
  } catch (error) {
    logger.error('Get announcements error:', error);
    res.status(500).json({ error: 'Duyurular alınamadı' });
  }
});

// POST /announcements
router.post('/', validate(schemas.createAnnouncement), async (req, res) => {
  try {
    const data = {
      ...req.body,
      created_by: req.user.id
    };

    // Principals can only create for their school
    if (req.user.role === 'principal') {
      data.school_id = req.user.school_id;
    }

    const announcement = await Announcement.create(data);

    // Notify boards via WebSocket
    const io = getIO();
    if (io) {
      if (announcement.school_id) {
        io.to(`school_${announcement.school_id}`).emit('board:announcement', {
          id: announcement.id,
          title: announcement.title,
          content: announcement.content,
          priority: announcement.priority
        });
      } else {
        io.emit('board:announcement', {
          id: announcement.id,
          title: announcement.title,
          content: announcement.content,
          priority: announcement.priority
        });
      }
    }

    logger.info(`Announcement created: ${announcement.title}`);
    res.status(201).json({ message: 'Duyuru oluşturuldu', announcement });
  } catch (error) {
    logger.error('Create announcement error:', error);
    res.status(500).json({ error: 'Duyuru oluşturulurken hata oluştu' });
  }
});

// PUT /announcements/:id
router.put('/:id', validate(schemas.updateAnnouncement), async (req, res) => {
  try {
    const where = { id: req.params.id };
    if (req.schoolId) where.school_id = req.schoolId;

    const announcement = await Announcement.findOne({ where });
    if (!announcement) {
      return res.status(404).json({ error: 'Duyuru bulunamadı' });
    }

    await announcement.update(req.body);
    res.json({ message: 'Duyuru güncellendi', announcement });
  } catch (error) {
    logger.error('Update announcement error:', error);
    res.status(500).json({ error: 'Duyuru güncellenirken hata oluştu' });
  }
});

// DELETE /announcements/:id
router.delete('/:id', async (req, res) => {
  try {
    const where = { id: req.params.id };
    if (req.schoolId) where.school_id = req.schoolId;

    const announcement = await Announcement.findOne({ where });
    if (!announcement) {
      return res.status(404).json({ error: 'Duyuru bulunamadı' });
    }

    await announcement.destroy();
    res.json({ message: 'Duyuru silindi' });
  } catch (error) {
    logger.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Duyuru silinirken hata oluştu' });
  }
});

module.exports = router;
