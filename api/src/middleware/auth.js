const jwt = require('jsonwebtoken');
const { User, Session, Board, BoardToken } = require('../models');
const logger = require('../config/logger');

/**
 * JWT Authentication Middleware
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Yetkilendirme token\'ı bulunamadı' });
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if session exists
      const session = await Session.findOne({ where: { token, user_id: decoded.userId } });
      if (!session) {
        return res.status(401).json({ error: 'Oturum geçersiz' });
      }

      // Check if session expired
      if (new Date(session.expires_at) < new Date()) {
        await session.destroy();
        return res.status(401).json({ error: 'Oturum süresi dolmuş' });
      }

      // Get user
      const user = await User.findByPk(decoded.userId, {
        attributes: { exclude: ['password_hash'] }
      });

      if (!user || !user.is_active) {
        return res.status(401).json({ error: 'Kullanıcı bulunamadı veya devre dışı' });
      }

      req.user = user;
      req.session = session;
      req.token = token;
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token süresi dolmuş', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Geçersiz token' });
    }
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Kimlik doğrulama hatası' });
  }
};

/**
 * Board Authentication Middleware
 * Boards use X-Board-Token header
 */
const authenticateBoard = async (req, res, next) => {
  try {
    const boardToken = req.headers['x-board-token'];
    if (!boardToken) {
      return res.status(401).json({ error: 'Board token bulunamadı' });
    }

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

    req.board = tokenRecord.board;
    req.boardToken = boardToken;
    next();
  } catch (error) {
    logger.error('Board auth middleware error:', error);
    res.status(500).json({ error: 'Board kimlik doğrulama hatası' });
  }
};

/**
 * Role-based authorization middleware
 * @param  {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Kimlik doğrulaması gerekli' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    }

    next();
  };
};

/**
 * School-scoped access middleware
 * Ensures users can only access their own school's data
 */
const schoolScope = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Kimlik doğrulaması gerekli' });
  }

  // SuperAdmin can access all schools
  if (req.user.role === 'superadmin') {
    return next();
  }

  // For other roles, scope to their school
  req.schoolId = req.user.school_id;
  next();
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password_hash'] }
    });
    if (user && user.is_active) {
      req.user = user;
    }
  } catch (error) {
    // Ignore auth errors for optional auth
  }

  next();
};

module.exports = {
  authenticate,
  authenticateBoard,
  authorize,
  schoolScope,
  optionalAuth
};
