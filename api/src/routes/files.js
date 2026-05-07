const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { File, Board, School } = require('../models');
const { authenticate, authenticateBoard, authorize, schoolScope } = require('../middleware/auth');
const { uploadFile } = require('../middleware/upload');
const logger = require('../config/logger');

// POST /files/upload - Upload file (max 50MB)
router.post('/upload', authenticate, authorize('superadmin', 'principal'), schoolScope, uploadFile.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Dosya gerekli' });
    }

    const school_id = (req.user.role === 'superadmin' && req.body.school_id) 
        ? req.body.school_id 
        : (req.schoolId || req.user.school_id);
    
    if (!school_id) {
      return res.status(400).json({ error: 'Okul kimliği (school_id) gerekli' });
    }
    const { target_boards } = req.body;

    const file = await File.create({
      school_id,
      uploaded_by: req.user.id,
      original_name: req.file.originalname,
      stored_path: `/uploads/files/${req.file.filename}`,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      target_boards: target_boards || '[]',
      status: 'pending'
    });

    logger.info(`File uploaded: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)}MB)`);

    // Notify boards if targets specified
    if (target_boards) {
      const { getIO } = require('../websocket');
      const io = getIO();
      if (io) {
        const boardIds = JSON.parse(target_boards);
        boardIds.forEach(boardId => {
          io.to(`board_${boardId}`).emit('board:file-ready', {
            file_id: file.id,
            original_name: file.original_name,
            file_size: file.file_size
          });
        });
      }
    }

    res.status(201).json({ message: 'Dosya yüklendi', file });
  } catch (error) {
    logger.error('File upload error:', error);
    res.status(500).json({ error: 'Dosya yüklenirken hata oluştu' });
  }
});

// GET /files - List files
router.get('/', authenticate, authorize('superadmin', 'principal'), schoolScope, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (req.schoolId) where.school_id = req.schoolId;

    const { count, rows } = await File.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        { model: School, as: 'school', attributes: ['id', 'name'] },
        {
          model: require('../models').User,
          as: 'uploader',
          attributes: ['id', 'full_name']
        }
      ]
    });

    res.json({
      files: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit) }
    });
  } catch (error) {
    logger.error('Get files error:', error);
    res.status(500).json({ error: 'Dosyalar alınamadı' });
  }
});

// GET /files/:id/download
router.get('/:id/download', async (req, res) => {
  try {
    const file = await File.findByPk(req.params.id);
    if (!file) {
      return res.status(404).json({ error: 'Dosya bulunamadı' });
    }

    const filePath = path.join(__dirname, '../../', file.stored_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Dosya diskte bulunamadı' });
    }

    res.download(filePath, file.original_name);
  } catch (error) {
    logger.error('File download error:', error);
    res.status(500).json({ error: 'Dosya indirme hatası' });
  }
});

// DELETE /files/:id
router.delete('/:id', authenticate, authorize('superadmin', 'principal'), schoolScope, async (req, res) => {
  try {
    const where = { id: req.params.id };
    if (req.schoolId) where.school_id = req.schoolId;

    const file = await File.findOne({ where });
    if (!file) {
      return res.status(404).json({ error: 'Dosya bulunamadı' });
    }

    // Delete from disk
    const filePath = path.join(__dirname, '../../', file.stored_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await file.destroy();
    res.json({ message: 'Dosya silindi' });
  } catch (error) {
    logger.error('Delete file error:', error);
    res.status(500).json({ error: 'Dosya silinirken hata oluştu' });
  }
});

// POST /files/:id/assign - Assign file to boards
router.post('/:id/assign', authenticate, authorize('superadmin', 'principal'), schoolScope, async (req, res) => {
  try {
    const { board_ids } = req.body;
    if (!board_ids || !Array.isArray(board_ids)) {
      return res.status(400).json({ error: 'board_ids dizisi gerekli' });
    }

    const where = { id: req.params.id };
    if (req.schoolId) where.school_id = req.schoolId;

    const file = await File.findOne({ where });
    if (!file) {
      return res.status(404).json({ error: 'Dosya bulunamadı' });
    }

    await file.update({
      target_boards: JSON.stringify(board_ids),
      status: 'pending'
    });

    // Notify boards
    const { getIO } = require('../websocket');
    const io = getIO();
    if (io) {
      board_ids.forEach(boardId => {
        io.to(`board_${boardId}`).emit('board:file-ready', {
          file_id: file.id,
          original_name: file.original_name,
          file_size: file.file_size
        });
      });
    }

    res.json({ message: 'Dosya tahtalara atandı' });
  } catch (error) {
    logger.error('Assign file error:', error);
    res.status(500).json({ error: 'Dosya atama hatası' });
  }
});

// GET /boards/:boardId/pending-files - Get pending files for a board
router.get('/board/:boardId/pending', authenticateBoard, async (req, res) => {
  try {
    const board = req.board;

    const files = await File.findAll({
      where: {
        school_id: board.school_id,
        status: ['pending', 'transferring']
      },
      order: [['created_at', 'DESC']]
    });

    // Filter files targeting this board
    const pendingFiles = files.filter(file => {
      try {
        const targets = JSON.parse(file.target_boards || '[]');
        return targets.length === 0 || targets.includes(board.id);
      } catch {
        return false;
      }
    });

    res.json({ files: pendingFiles });
  } catch (error) {
    logger.error('Get pending files error:', error);
    res.status(500).json({ error: 'Bekleyen dosyalar alınamadı' });
  }
});

module.exports = router;
