const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { User, Session, School } = require('../models');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const logger = require('../config/logger');

// POST /auth/login
router.post('/login', validate(schemas.login), async (req, res) => {
  try {
    const { email: rawEmail, password, device_info, device_type } = req.body;
    const email = (rawEmail || '').toString().toLowerCase().replace(/\s+/g, '').trim();

    logger.info(`Giriş denemesi: ${email} (Cihaz: ${device_type})`);

    const user = await User.findOne({
      where: { email },
      include: [{ model: School, as: 'school', attributes: ['id', 'name', 'school_code', 'status'] }]
    });

    if (!user) {
      return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Hesabınız devre dışı bırakılmış' });
    }

    // Check school status (if not superadmin)
    if (user.role !== 'superadmin' && user.school && user.school.status === 'suspended') {
      return res.status(403).json({ error: 'Okulunuz askıya alınmış. Yönetici ile iletişime geçin.' });
    }

    const normalizedDevice = (device_type || '').toLowerCase();

    if (normalizedDevice === 'desktop' && user.role === 'teacher') {
      return res.status(403).json({ error: 'Öğretmen hesapları yönetim paneline giriş yapamaz' });
    }

    if (normalizedDevice === 'mobile' && !['superadmin', 'principal', 'teacher'].includes(user.role)) {
      return res.status(403).json({ error: 'Bu hesap mobil uygulamaya giriş yapamaz' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { userId: user.id, role: user.role, schoolId: user.school_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, tokenId: uuidv4() },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create session
    await Session.create({
      user_id: user.id,
      token: accessToken,
      refresh_token: refreshToken,
      device_info: device_info || req.headers['user-agent'],
      device_type: device_type || 'desktop',
      ip_address: req.ip,
      expires_at: expiresAt
    });

    // Update last login
    await user.update({ last_login: new Date() });

    logger.info(`User logged in: ${user.email} (${user.role})`);

    res.json({
      message: 'Giriş başarılı',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        school_id: user.school_id,
        avatar_url: user.avatar_url,
        school: user.school ? {
          id: user.school.id,
          name: user.school.name,
          school_code: user.school.school_code
        } : null
      },
      tokens: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: process.env.JWT_EXPIRES_IN || '15m'
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Giriş yapılırken bir hata oluştu' });
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token gerekli' });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş refresh token' });
    }

    // Find session
    const session = await Session.findOne({
      where: { refresh_token, user_id: decoded.userId }
    });

    if (!session) {
      return res.status(401).json({ error: 'Oturum bulunamadı' });
    }

    // Get user
    const user = await User.findByPk(decoded.userId);
    if (!user || !user.is_active) {
      await session.destroy();
      return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId: user.id, role: user.role, schoolId: user.school_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );

    // Update session
    await session.update({ token: newAccessToken });

    res.json({
      access_token: newAccessToken,
      expires_in: process.env.JWT_EXPIRES_IN || '15m'
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token yenileme hatası' });
  }
});

// POST /auth/logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    await Session.destroy({ where: { token: req.token } });
    res.json({ message: 'Çıkış başarılı' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ error: 'Çıkış yapılırken bir hata oluştu' });
  }
});

// GET /auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password_hash'] },
      include: [{ model: School, as: 'school', attributes: ['id', 'name', 'school_code', 'status', 'logo_url'] }]
    });

    res.json({ user });
  } catch (error) {
    logger.error('Get me error:', error);
    res.status(500).json({ error: 'Kullanıcı bilgileri alınamadı' });
  }
});

// POST /auth/change-password
router.post('/change-password', authenticate, validate(schemas.changePassword), async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    const user = await User.findByPk(req.user.id);
    const isMatch = await bcrypt.compare(current_password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ error: 'Mevcut şifre hatalı' });
    }

    const password_hash = await bcrypt.hash(new_password, 12);
    await user.update({ password_hash });

    // Invalidate all sessions except current
    await Session.destroy({
      where: {
        user_id: user.id,
        token: { [require('sequelize').Op.ne]: req.token }
      }
    });

    res.json({ message: 'Şifre başarıyla değiştirildi' });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ error: 'Şifre değiştirme hatası' });
  }
});

module.exports = router;
