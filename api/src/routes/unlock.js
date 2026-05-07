const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Board, UsbKey, User, UnlockLog, MasterKey, School } = require('../models');
const { authenticate, authenticateBoard, authorize, schoolScope } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { getIO } = require('../websocket');
const logger = require('../config/logger');

const normalizeUsbSerial = (keySerial) => {
  const value = (keySerial || '').trim().toLowerCase();
  if (/^[a-f0-9]{64}$/.test(value)) {
    return value;
  }

  return require('crypto').createHash('sha256').update(value).digest('hex');
};

// POST /unlock/usb - USB key unlock (called from board app)
router.post('/usb', authenticateBoard, validate(schemas.unlockUsb), async (req, res) => {
  try {
    const { board_id, key_serial } = req.body;
    const board = req.board;
    const normalizedSerial = normalizeUsbSerial(key_serial);
    const legacySerial = require('crypto').createHash('sha256').update(normalizedSerial).digest('hex');

    if (board.id !== board_id) {
      return res.status(403).json({ error: 'Board ID uyuşmuyor' });
    }

    // Find USB key
    const usbKey = await UsbKey.findOne({
      where: {
        key_serial: {
          [require('sequelize').Op.in]: [normalizedSerial, legacySerial]
        },
        status: 'active',
        school_id: board.school_id
      },
      include: [{ model: User, as: 'user', attributes: ['id', 'full_name', 'email'] }]
    });

    if (!usbKey) {
      // Log failed attempt
      await UnlockLog.create({
        board_id: board.id,
        method: 'usb',
        usb_key_serial: key_serial,
        ip_address: req.ip,
        details: JSON.stringify({ status: 'failed', reason: 'invalid_key' })
      });

      return res.status(403).json({ error: 'Geçersiz veya iptal edilmiş USB anahtarı' });
    }

    // Unlock the board
    await board.update({ status: 'unlocked' });

    // Log successful unlock
    const log = await UnlockLog.create({
      board_id: board.id,
      user_id: usbKey.user_id,
      method: 'usb',
      usb_key_serial: key_serial,
      ip_address: req.ip,
      details: JSON.stringify({ status: 'success', user_name: usbKey.user?.full_name })
    });

    // Notify admin
    const io = getIO();
    if (io) {
      io.to(`school_${board.school_id}`).emit('board:status-change', {
        board_id: board.id,
        status: 'unlocked',
        method: 'usb',
        user: usbKey.user?.full_name,
        timestamp: new Date()
      });
    }

    logger.info(`Board ${board.board_code} unlocked via USB by ${usbKey.user?.full_name}`);

    res.json({
      message: 'Kilit açıldı',
      unlock: {
        method: 'usb',
        user: usbKey.user?.full_name,
        timestamp: log.created_at
      }
    });
  } catch (error) {
    logger.error('USB unlock error:', error);
    res.status(500).json({ error: 'USB ile kilit açma hatası' });
  }
});

// POST /unlock/qr - QR code unlock (called from mobile app)
router.post('/qr', authenticate, authorize('teacher', 'principal', 'superadmin'), validate(schemas.unlockQr), async (req, res) => {
  try {
    const { board_code, qr_token } = req.body;
    const user = req.user;

    // Find board
    const board = await Board.findOne({
      where: { board_code },
      include: [{ model: School, as: 'school' }]
    });

    if (!board) {
      return res.status(404).json({ error: 'Tahta bulunamadı' });
    }

    // Check if user belongs to same school (unless superadmin)
    if (user.role !== 'superadmin' && user.school_id !== board.school_id) {
      return res.status(403).json({ error: 'Bu tahta sizin okulunuza ait değil' });
    }

    // Verify dynamic QR token matches board's current token
    if (!board.qr_token || board.qr_token !== qr_token) {
      return res.status(403).json({ error: 'Geçersiz QR kodu' });
    }

    // Check if QR token has expired (40 min validity)
    if (board.qr_token_expires_at && new Date() > new Date(board.qr_token_expires_at)) {
      return res.status(403).json({ error: 'QR kodunun süresi dolmuş. Lütfen ekrandaki güncel QR kodu okutun.' });
    }

    // Unlock
    await board.update({ status: 'unlocked' });

    const log = await UnlockLog.create({
      board_id: board.id,
      user_id: user.id,
      method: 'qr',
      ip_address: req.ip,
      details: JSON.stringify({ status: 'success', user_name: user.full_name, user_email: user.email })
    });

    // Notify via WebSocket
    const io = getIO();
    if (io) {
      io.to(`school_${board.school_id}`).emit('board:status-change', {
        board_id: board.id,
        status: 'unlocked',
        method: 'qr',
        user: user.full_name,
        timestamp: new Date()
      });

      // Tell board to unlock
      io.to(`board_${board.id}`).emit('board:unlock', {
        method: 'qr',
        user: user.full_name
      });
    }

    logger.info(`Board ${board.board_code} unlocked via QR by ${user.full_name} (${user.email})`);

    res.json({
      message: 'Kilit açıldı',
      board: { id: board.id, name: board.name },
      unlock: { method: 'qr', user: user.full_name, timestamp: log.created_at }
    });
  } catch (error) {
    logger.error('QR unlock error:', error);
    res.status(500).json({ error: 'QR ile kilit açma hatası' });
  }
});

// POST /unlock/remote - Remote unlock by principal
router.post('/remote', authenticate, authorize('principal', 'superadmin'), schoolScope, validate(schemas.unlockRemote), async (req, res) => {
  try {
    const { board_id } = req.body;

    const where = { id: board_id };
    if (req.schoolId) where.school_id = req.schoolId;

    const board = await Board.findOne({ where });
    if (!board) {
      return res.status(404).json({ error: 'Tahta bulunamadı veya yetkiniz yok' });
    }

    // Unlock
    await board.update({ status: 'unlocked' });

    const log = await UnlockLog.create({
      board_id: board.id,
      user_id: req.user.id,
      method: 'remote',
      ip_address: req.ip,
      details: JSON.stringify({ status: 'success', user_name: req.user.full_name })
    });

    // Send unlock command to board via WebSocket
    const io = getIO();
    if (io) {
      io.to(`board_${board.id}`).emit('board:unlock', {
        method: 'remote',
        user: req.user.full_name
      });

      io.to(`school_${board.school_id}`).emit('board:status-change', {
        board_id: board.id,
        status: 'unlocked',
        method: 'remote',
        user: req.user.full_name,
        timestamp: new Date()
      });
    }

    logger.info(`Board ${board.board_code} unlocked remotely by ${req.user.full_name}`);

    res.json({
      message: 'Tahta kilidi uzaktan açıldı',
      unlock: { method: 'remote', timestamp: log.created_at }
    });
  } catch (error) {
    logger.error('Remote unlock error:', error);
    res.status(500).json({ error: 'Uzaktan kilit açma hatası' });
  }
});

// POST /unlock/masterkey - Master key unlock
router.post('/masterkey', validate(schemas.unlockMasterkey), async (req, res) => {
  try {
    const { board_id, master_key } = req.body;

    // Verify master key
    const masterKeys = await MasterKey.findAll({ where: { is_active: true } });
    let validKey = null;

    for (const mk of masterKeys) {
      const isMatch = await bcrypt.compare(master_key, mk.key_hash);
      if (isMatch) {
        validKey = mk;
        break;
      }
    }

    if (!validKey) {
      return res.status(403).json({ error: 'Geçersiz master key' });
    }

    const board = await Board.findByPk(board_id);
    if (!board) {
      return res.status(404).json({ error: 'Tahta bulunamadı' });
    }

    // Unlock
    await board.update({ status: 'unlocked' });

    const log = await UnlockLog.create({
      board_id: board.id,
      method: 'masterkey',
      ip_address: req.ip,
      details: JSON.stringify({ status: 'success', master_key_label: validKey.label })
    });

    // Send unlock command
    const io = getIO();
    if (io) {
      io.to(`board_${board.id}`).emit('board:unlock', {
        method: 'masterkey'
      });

      io.to(`school_${board.school_id}`).emit('board:status-change', {
        board_id: board.id,
        status: 'unlocked',
        method: 'masterkey',
        timestamp: new Date()
      });
    }

    logger.info(`Board ${board.board_code} unlocked with masterkey`);

    res.json({
      message: 'Master key ile kilit açıldı',
      unlock: { method: 'masterkey', timestamp: log.created_at }
    });
  } catch (error) {
    logger.error('Masterkey unlock error:', error);
    res.status(500).json({ error: 'Master key ile kilit açma hatası' });
  }
});

// POST /unlock/lock - Lock a board
router.post('/lock', async (req, res) => {
  try {
    const { board_id } = req.body;

    // Can be called by board itself or by admin
    let board;
    if (req.headers['x-board-token']) {
      // Board is locking itself
      const { authenticateBoard: authBoard } = require('../middleware/auth');
      // Simple inline check
      const { BoardToken } = require('../models');
      const tokenRecord = await BoardToken.findOne({
        where: { token: req.headers['x-board-token'] },
        include: [{ model: Board, as: 'board' }]
      });
      if (!tokenRecord) return res.status(401).json({ error: 'Geçersiz token' });
      board = tokenRecord.board;
    } else {
      // Admin locking
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: 'Yetkilendirme gerekli' });
      board = await Board.findByPk(board_id);
    }

    if (!board) {
      return res.status(404).json({ error: 'Tahta bulunamadı' });
    }

    await board.update({ status: 'locked' });

    // Update last unlock log with locked_at
    const lastLog = await UnlockLog.findOne({
      where: { board_id: board.id, locked_at: null },
      order: [['created_at', 'DESC']]
    });
    if (lastLog) {
      await lastLog.update({ locked_at: new Date() });
    }

    // Notify
    const io = getIO();
    if (io) {
      io.to(`board_${board.id}`).emit('board:lock', {});
      io.to(`school_${board.school_id}`).emit('board:status-change', {
        board_id: board.id,
        status: 'locked',
        timestamp: new Date()
      });
    }

    res.json({ message: 'Tahta kilitlendi' });
  } catch (error) {
    logger.error('Lock error:', error);
    res.status(500).json({ error: 'Kilitleme hatası' });
  }
});

module.exports = router;
