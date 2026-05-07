const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { UnlockLog, Board, User, School } = require('../models');
const { authenticate, authorize, schoolScope } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const logger = require('../config/logger');

router.use(authenticate);
router.use(authorize('superadmin', 'principal'));
router.use(schoolScope);

// GET /reports/unlock-logs
router.get('/unlock-logs', validate(schemas.reportQuery, 'query'), async (req, res) => {
  try {
    const { page = 1, limit = 50, board_id, user_id, method, from, to } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (board_id) where.board_id = board_id;
    if (user_id) where.user_id = user_id;
    if (method) where.method = method;
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(from);
      if (to) where.created_at[Op.lte] = new Date(to);
    }

    // School scope for boards
    const boardWhere = {};
    if (req.schoolId) boardWhere.school_id = req.schoolId;

    const { count, rows } = await UnlockLog.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Board, as: 'board',
          attributes: ['id', 'name', 'board_code'],
          where: boardWhere,
          include: [{ model: School, as: 'school', attributes: ['id', 'name'] }]
        },
        { model: User, as: 'user', attributes: ['id', 'full_name', 'email'] }
      ]
    });

    res.json({
      logs: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit) }
    });
  } catch (error) {
    logger.error('Get unlock logs error:', error);
    res.status(500).json({ error: 'Raporlar alınamadı' });
  }
});

// GET /reports/board-usage - Board usage stats
router.get('/board-usage', async (req, res) => {
  try {
    const { from, to, board_id } = req.query;

    const where = {};
    if (board_id) where.board_id = board_id;
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(from);
      if (to) where.created_at[Op.lte] = new Date(to);
    }

    const boardWhere = {};
    if (req.schoolId) boardWhere.school_id = req.schoolId;

    const logs = await UnlockLog.findAll({
      where,
      attributes: [
        'board_id',
        'method',
        [require('sequelize').fn('COUNT', require('sequelize').col('unlock_logs.id')), 'count']
      ],
      group: ['board_id', 'method'],
      include: [{
        model: Board, as: 'board',
        attributes: ['name', 'board_code'],
        where: boardWhere
      }]
    });

    res.json({ usage: logs });
  } catch (error) {
    logger.error('Board usage report error:', error);
    res.status(500).json({ error: 'Kullanım raporu alınamadı' });
  }
});

// GET /reports/teacher-activity
router.get('/teacher-activity', async (req, res) => {
  try {
    const { from, to } = req.query;

    const where = {};
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(from);
      if (to) where.created_at[Op.lte] = new Date(to);
    }

    const userWhere = {};
    if (req.schoolId) userWhere.school_id = req.schoolId;

    const logs = await UnlockLog.findAll({
      where: { ...where, user_id: { [Op.ne]: null } },
      attributes: [
        'user_id',
        'method',
        [require('sequelize').fn('COUNT', require('sequelize').col('unlock_logs.id')), 'count']
      ],
      group: ['user_id', 'method'],
      include: [{
        model: User, as: 'user',
        attributes: ['full_name', 'email', 'role'],
        where: userWhere
      }]
    });

    res.json({ activity: logs });
  } catch (error) {
    logger.error('Teacher activity report error:', error);
    res.status(500).json({ error: 'Aktivite raporu alınamadı' });
  }
});

// GET /reports/export - Export to CSV
router.get('/export', async (req, res) => {
  try {
    const { from, to, format = 'csv' } = req.query;

    const where = {};
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(from);
      if (to) where.created_at[Op.lte] = new Date(to);
    }

    const boardWhere = {};
    if (req.schoolId) boardWhere.school_id = req.schoolId;

    const logs = await UnlockLog.findAll({
      where,
      order: [['created_at', 'DESC']],
      include: [
        { model: Board, as: 'board', attributes: ['name', 'board_code'], where: boardWhere },
        { model: User, as: 'user', attributes: ['full_name', 'email'] }
      ]
    });

    if (format === 'csv') {
      const csvHeader = 'Tarih,Tahta,Tahta Kodu,Yöntem,Kullanıcı,E-posta\n';
      const csvRows = logs.map(log => {
        return [
          new Date(log.created_at).toLocaleString('tr-TR'),
          log.board?.name || '',
          log.board?.board_code || '',
          log.method,
          log.user?.full_name || 'Sistem',
          log.user?.email || ''
        ].join(',');
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=rapor_${Date.now()}.csv`);
      res.send('\uFEFF' + csvHeader + csvRows); // BOM for Excel UTF-8
    } else {
      res.json({ logs });
    }
  } catch (error) {
    logger.error('Export error:', error);
    res.status(500).json({ error: 'Dışa aktarma hatası' });
  }
});

module.exports = router;
