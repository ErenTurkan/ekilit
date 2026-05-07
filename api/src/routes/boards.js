const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { Board, School, Screenshot, BoardToken } = require('../models');
const { authenticate, authenticateBoard, authorize, schoolScope } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { uploadScreenshot } = require('../middleware/upload');
const { getIO } = require('../websocket');
const logger = require('../config/logger');

// ============ BOARD APP ENDPOINTS ============

// POST /boards/register - Board registers itself
router.post('/register', validate(schemas.registerBoard), async (req, res) => {
  try {
    const { school_code, hardware_id, name, os_info, app_version } = req.body;

    // Find school
    const school = await School.findOne({ where: { school_code, status: 'active' } });
    if (!school) {
      return res.status(404).json({ error: 'Okul bulunamadı veya askıda' });
    }

    // Check if already registered
    let board = await Board.findOne({ where: { hardware_id } });

    if (board) {
      // Update existing
      await board.update({
        name,
        os_info,
        app_version,
        ip_address: req.ip,
        status: 'locked',
        is_registered: true,
        last_heartbeat: new Date()
      });
    } else {
      // Create new
      const board_code = `BRD-${school_code}-${uuidv4().slice(0, 6).toUpperCase()}`;
      board = await Board.create({
        school_id: school.id,
        board_code,
        name,
        hardware_id,
        os_info,
        app_version,
        ip_address: req.ip,
        status: 'locked',
        is_registered: true,
        last_heartbeat: new Date()
      });
    }

    // Generate board token (long-lived)
    const token = jwt.sign(
      { boardId: board.id, hardwareId: hardware_id },
      process.env.JWT_SECRET,
      { expiresIn: '365d' }
    );

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    // Upsert board token
    await BoardToken.destroy({ where: { board_id: board.id } });
    await BoardToken.create({ board_id: board.id, token, expires_at: expiresAt });

    logger.info(`Board registered: ${board.board_code} at ${school.name}`);

    res.status(201).json({
      message: 'Tahta başarıyla kayıt oldu',
      board: {
        id: board.id,
        board_code: board.board_code,
        name: board.name,
        school: { id: school.id, name: school.name }
      },
      token
    });
  } catch (error) {
    logger.error('Board register error:', error);
    res.status(500).json({ error: 'Tahta kaydı yapılırken hata oluştu' });
  }
});

// POST /boards/:id/heartbeat - Board sends heartbeat
router.post('/:id/heartbeat', authenticateBoard, async (req, res) => {
  try {
    const board = req.board;
    const { status, app_version, os_info, is_online } = req.body;

    // Board status: locked/unlocked (kilit durumu)
    // Online status: heartbeat varlığı ile belirlenir
    const updateData = {
      last_heartbeat: new Date(),
      ip_address: req.ip,
      status: status || board.status, // locked/unlocked
      app_version: app_version || board.app_version,
      os_info: os_info || board.os_info
    };

    await board.update(updateData);

    // Notify admin panel via WebSocket
    const io = getIO();
    if (io) {
      io.to(`school_${board.school_id}`).emit('board:heartbeat', {
        board_id: board.id,
        status: board.status, // locked/unlocked
        is_online: true,
        last_heartbeat: board.last_heartbeat
      });
    }

    // Return any pending commands
    res.json({
      status: 'ok',
      server_time: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Heartbeat error:', error);
    res.status(500).json({ error: 'Heartbeat hatası' });
  }
});

// POST /boards/:id/screenshot - Board uploads screenshot
router.post('/:id/screenshot', authenticateBoard, uploadScreenshot.single('screenshot'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Screenshot dosyası gerekli' });
    }

    const board = req.board;

    const screenshot = await Screenshot.create({
      board_id: board.id,
      file_path: `/uploads/screenshots/${req.file.filename}`,
      file_size: req.file.size,
      captured_at: new Date()
    });

    await board.update({ last_screenshot_at: new Date() });

    // Notify admin panel
    const io = getIO();
    if (io) {
      io.to(`school_${board.school_id}`).emit('board:screenshot', {
        board_id: board.id,
        screenshot_url: screenshot.file_path,
        captured_at: screenshot.captured_at
      });
    }

    res.json({ message: 'Screenshot yüklendi', screenshot_id: screenshot.id });
  } catch (error) {
    logger.error('Screenshot upload error:', error);
    res.status(500).json({ error: 'Screenshot yüklenirken hata oluştu' });
  }
});

// ============ ADMIN PANEL ENDPOINTS ============

// GET /boards - List boards
router.get('/', authenticate, authorize('superadmin', 'principal'), schoolScope, async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (req.schoolId) where.school_id = req.schoolId;
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { board_code: { [Op.like]: `%${search}%` } }
      ];
    }
    if (status) where.status = status;

    const { count, rows } = await Board.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['last_heartbeat', 'DESC']],
      include: [{ model: School, as: 'school', attributes: ['id', 'name', 'school_code'] }]
    });

    res.json({
      boards: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit) }
    });
  } catch (error) {
    logger.error('Get boards error:', error);
    res.status(500).json({ error: 'Tahtalar alınamadı' });
  }
});

// GET /boards/screenshots/live - Live screenshot grid
router.get('/screenshots/live', authenticate, authorize('superadmin', 'principal'), schoolScope, async (req, res) => {
  try {
    const where = {};
    if (req.schoolId) where.school_id = req.schoolId;

    const boards = await Board.findAll({
      where,
      attributes: ['id', 'name', 'board_code', 'status', 'last_heartbeat', 'last_screenshot_at'],
      order: [['name', 'ASC']]
    });

    // Get latest screenshot for each board
    const boardsWithScreenshots = await Promise.all(
      boards.map(async (board) => {
        const latestScreenshot = await Screenshot.findOne({
          where: { board_id: board.id },
          order: [['captured_at', 'DESC']],
          attributes: ['file_path', 'captured_at']
        });

        return {
          ...board.toJSON(),
          latest_screenshot: latestScreenshot ? {
            url: latestScreenshot.file_path,
            captured_at: latestScreenshot.captured_at
          } : null
        };
      })
    );

    res.json({ boards: boardsWithScreenshots });
  } catch (error) {
    logger.error('Get live screenshots error:', error);
    res.status(500).json({ error: 'Canlı ekranlar alınamadı' });
  }
});

// GET /boards/:id
router.get('/:id', authenticate, authorize('superadmin', 'principal'), schoolScope, async (req, res) => {
  try {
    const where = { id: req.params.id };
    if (req.schoolId) where.school_id = req.schoolId;

    const board = await Board.findOne({
      where,
      include: [{ model: School, as: 'school', attributes: ['id', 'name', 'school_code'] }]
    });

    if (!board) {
      return res.status(404).json({ error: 'Tahta bulunamadı' });
    }

    res.json({ board });
  } catch (error) {
    logger.error('Get board error:', error);
    res.status(500).json({ error: 'Tahta bilgileri alınamadı' });
  }
});

// GET /boards/:id/screenshots
router.get('/:id/screenshots', authenticate, authorize('superadmin', 'principal'), schoolScope, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows } = await Screenshot.findAndCountAll({
      where: { board_id: req.params.id },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['captured_at', 'DESC']]
    });

    res.json({
      screenshots: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit) }
    });
  } catch (error) {
    logger.error('Get screenshots error:', error);
    res.status(500).json({ error: 'Screenshot\'lar alınamadı' });
  }
});

// PUT /boards/:id
router.put('/:id', authenticate, authorize('superadmin', 'principal'), schoolScope, validate(schemas.updateBoard), async (req, res) => {
  try {
    const where = { id: req.params.id };
    if (req.schoolId) where.school_id = req.schoolId;

    const board = await Board.findOne({ where });
    if (!board) {
      return res.status(404).json({ error: 'Tahta bulunamadı' });
    }

    await board.update(req.body);
    res.json({ message: 'Tahta güncellendi', board });
  } catch (error) {
    logger.error('Update board error:', error);
    res.status(500).json({ error: 'Tahta güncellenirken hata oluştu' });
  }
});

// DELETE /boards/:id
router.delete('/:id', authenticate, authorize('superadmin', 'principal'), schoolScope, async (req, res) => {
  try {
    const where = { id: req.params.id };
    if (req.schoolId) where.school_id = req.schoolId;

    const board = await Board.findOne({ where });
    if (!board) {
      return res.status(404).json({ error: 'Tahta bulunamadı' });
    }

    await BoardToken.destroy({ where: { board_id: board.id } });
    await board.destroy();
    logger.info(`Board deleted: ${board.board_code}`);
    res.json({ message: 'Tahta silindi' });
  } catch (error) {
    logger.error('Delete board error:', error);
    res.status(500).json({ error: 'Tahta silinirken hata oluştu' });
  }
});

// POST /boards/:id/qr-token - Board requests a new dynamic QR token (40min valid)
router.post('/:id/qr-token', authenticateBoard, async (req, res) => {
  try {
    const board = req.board;
    const crypto = require('crypto');
    
    // Generate a random token
    const qrToken = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 40 * 60 * 1000); // 40 minutes
    
    await board.update({
      qr_token: qrToken,
      qr_token_expires_at: expiresAt
    });
    
    logger.info(`QR token generated for board ${board.board_code}, expires at ${expiresAt.toISOString()}`);
    
    res.json({
      qr_token: qrToken,
      expires_at: expiresAt.toISOString(),
      board_code: board.board_code
    });
  } catch (error) {
    logger.error('QR token generation error:', error);
    res.status(500).json({ error: 'QR token oluşturulamadı' });
  }
});

module.exports = router;
