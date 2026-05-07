const { sequelize, Sequelize } = require('../config/database');
const { DataTypes } = Sequelize;

// ========== SCHOOLS ==========
const School = sequelize.define('schools', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  school_code: { type: DataTypes.STRING(20), unique: true, allowNull: false },
  name: { type: DataTypes.STRING(200), allowNull: false },
  city: { type: DataTypes.STRING(100) },
  district: { type: DataTypes.STRING(100) },
  address: { type: DataTypes.TEXT },
  phone: { type: DataTypes.STRING(20) },
  logo_url: { type: DataTypes.STRING(500) },
  status: { type: DataTypes.ENUM('active', 'suspended'), defaultValue: 'active' }
});

// ========== USERS ==========
const User = sequelize.define('users', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  school_id: { type: DataTypes.INTEGER, allowNull: true },
  email: { type: DataTypes.STRING(255), unique: true, allowNull: false },
  password_hash: { type: DataTypes.STRING(255), allowNull: false },
  full_name: { type: DataTypes.STRING(200), allowNull: false },
  phone: { type: DataTypes.STRING(20) },
  role: { type: DataTypes.ENUM('superadmin', 'principal', 'teacher'), allowNull: false },
  avatar_url: { type: DataTypes.STRING(500) },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  qr_secret: { type: DataTypes.STRING(255) },
  last_login: { type: DataTypes.DATE }
});

// ========== BOARDS ==========
const Board = sequelize.define('boards', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  school_id: { type: DataTypes.INTEGER, allowNull: false },
  board_code: { type: DataTypes.STRING(30), unique: true, allowNull: false },
  name: { type: DataTypes.STRING(200), allowNull: false },
  hardware_id: { type: DataTypes.STRING(255), unique: true },
  status: { type: DataTypes.ENUM('online', 'offline', 'locked', 'unlocked'), defaultValue: 'locked' },
  os_info: { type: DataTypes.STRING(200) },
  app_version: { type: DataTypes.STRING(20) },
  ip_address: { type: DataTypes.STRING(45) },
  last_heartbeat: { type: DataTypes.DATE },
  last_screenshot_at: { type: DataTypes.DATE },
  is_registered: { type: DataTypes.BOOLEAN, defaultValue: false },
  qr_token: { type: DataTypes.STRING(100), comment: 'Dinamik QR token - 40dk geçerli' },
  qr_token_expires_at: { type: DataTypes.DATE, comment: 'QR token son kullanma zamanı' }
});

// ========== USB KEYS ==========
const UsbKey = sequelize.define('usb_keys', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: true },
  school_id: { type: DataTypes.INTEGER, allowNull: false },
  key_serial: { type: DataTypes.STRING(255), unique: true, allowNull: false },
  label: { type: DataTypes.STRING(200) },
  status: { type: DataTypes.ENUM('active', 'revoked', 'lost'), defaultValue: 'active' },
  revoked_at: { type: DataTypes.DATE }
});

// ========== UNLOCK LOGS ==========
const UnlockLog = sequelize.define('unlock_logs', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  board_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: true },
  method: { type: DataTypes.ENUM('usb', 'qr', 'remote', 'masterkey'), allowNull: false },
  usb_key_serial: { type: DataTypes.STRING(255) },
  ip_address: { type: DataTypes.STRING(45) },
  details: { type: DataTypes.TEXT },
  locked_at: { type: DataTypes.DATE }
}, {
  updatedAt: false
});

// ========== SCREENSHOTS ==========
const Screenshot = sequelize.define('screenshots', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  board_id: { type: DataTypes.INTEGER, allowNull: false },
  file_path: { type: DataTypes.STRING(500), allowNull: false },
  file_size: { type: DataTypes.INTEGER },
  captured_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  updatedAt: false
});

// ========== ANNOUNCEMENTS ==========
const Announcement = sequelize.define('announcements', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  school_id: { type: DataTypes.INTEGER, allowNull: true },
  created_by: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING(300), allowNull: false },
  content: { type: DataTypes.TEXT },
  image_url: { type: DataTypes.STRING(500) },
  priority: { type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'), defaultValue: 'normal' },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  starts_at: { type: DataTypes.DATE },
  expires_at: { type: DataTypes.DATE }
});

// ========== FILES ==========
const File = sequelize.define('files', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  school_id: { type: DataTypes.INTEGER, allowNull: false },
  uploaded_by: { type: DataTypes.INTEGER, allowNull: false },
  original_name: { type: DataTypes.STRING(300), allowNull: false },
  stored_path: { type: DataTypes.STRING(500), allowNull: false },
  file_size: { type: DataTypes.INTEGER, allowNull: false },
  mime_type: { type: DataTypes.STRING(100) },
  target_boards: { type: DataTypes.TEXT, comment: 'JSON array of board IDs' },
  status: { type: DataTypes.ENUM('pending', 'transferring', 'completed', 'failed'), defaultValue: 'pending' }
});

// ========== SITE RULES ==========
const SiteRule = sequelize.define('site_rules', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  school_id: { type: DataTypes.INTEGER, allowNull: false },
  domain: { type: DataTypes.STRING(300), allowNull: false },
  type: { type: DataTypes.ENUM('whitelist', 'blacklist'), allowNull: false },
  created_by: { type: DataTypes.INTEGER, allowNull: false }
}, {
  updatedAt: false
});

// ========== SESSIONS ==========
const Session = sequelize.define('sessions', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  token: { type: DataTypes.STRING(500), unique: true, allowNull: false },
  refresh_token: { type: DataTypes.STRING(500), unique: true },
  device_info: { type: DataTypes.STRING(300) },
  device_type: { type: DataTypes.ENUM('desktop', 'mobile', 'board'), defaultValue: 'desktop' },
  ip_address: { type: DataTypes.STRING(45) },
  expires_at: { type: DataTypes.DATE, allowNull: false }
}, {
  updatedAt: false
});

// ========== MASTER KEYS ==========
const MasterKey = sequelize.define('master_keys', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  key_hash: { type: DataTypes.STRING(255), allowNull: false },
  label: { type: DataTypes.STRING(200) },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  updatedAt: false
});

// ========== BOARD TOKENS ==========
const BoardToken = sequelize.define('board_tokens', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  board_id: { type: DataTypes.INTEGER, allowNull: false },
  token: { type: DataTypes.STRING(500), unique: true, allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false }
}, {
  updatedAt: false
});

// ========== LICENSES (LİSANSLAR) ==========
const License = sequelize.define('licenses', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  school_id: { type: DataTypes.INTEGER, allowNull: false },
  license_key: { type: DataTypes.STRING(100), unique: true, allowNull: false },
  type: { type: DataTypes.ENUM('trial', 'monthly', 'yearly', 'lifetime'), defaultValue: 'trial' },
  status: { type: DataTypes.ENUM('active', 'expired', 'suspended', 'cancelled'), defaultValue: 'active' },
  starts_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  max_boards: { type: DataTypes.INTEGER, defaultValue: 50, comment: 'Maksimum tahta sayısı' },
  notes: { type: DataTypes.TEXT, comment: 'SuperAdmin notları' },
  created_by: { type: DataTypes.INTEGER, comment: 'SuperAdmin user id' },
  activated_at: { type: DataTypes.DATE },
  last_check: { type: DataTypes.DATE, comment: 'Son lisans kontrol zamanı' }
});

// ==========================================
//          ASSOCIATIONS / RELATIONS
// ==========================================

// School has many
School.hasMany(User, { foreignKey: 'school_id', as: 'users' });
School.hasMany(Board, { foreignKey: 'school_id', as: 'boards' });
School.hasMany(UsbKey, { foreignKey: 'school_id', as: 'usbKeys' });
School.hasMany(Announcement, { foreignKey: 'school_id', as: 'announcements' });
School.hasMany(File, { foreignKey: 'school_id', as: 'files' });
School.hasMany(SiteRule, { foreignKey: 'school_id', as: 'siteRules' });

// User belongs to School
User.belongsTo(School, { foreignKey: 'school_id', as: 'school' });
User.hasMany(UsbKey, { foreignKey: 'user_id', as: 'usbKeys' });
User.hasMany(UnlockLog, { foreignKey: 'user_id', as: 'unlockLogs' });
User.hasMany(Session, { foreignKey: 'user_id', as: 'sessions' });

// Board belongs to School
Board.belongsTo(School, { foreignKey: 'school_id', as: 'school' });
Board.hasMany(UnlockLog, { foreignKey: 'board_id', as: 'unlockLogs' });
Board.hasMany(Screenshot, { foreignKey: 'board_id', as: 'screenshots' });
Board.hasOne(BoardToken, { foreignKey: 'board_id', as: 'boardToken' });

// USB Key
UsbKey.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
UsbKey.belongsTo(School, { foreignKey: 'school_id', as: 'school' });

// Unlock Logs
UnlockLog.belongsTo(Board, { foreignKey: 'board_id', as: 'board' });
UnlockLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Screenshots
Screenshot.belongsTo(Board, { foreignKey: 'board_id', as: 'board' });

// Announcements
Announcement.belongsTo(School, { foreignKey: 'school_id', as: 'school' });
Announcement.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// Files
File.belongsTo(School, { foreignKey: 'school_id', as: 'school' });
File.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });

// Site Rules
SiteRule.belongsTo(School, { foreignKey: 'school_id', as: 'school' });
SiteRule.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// Sessions
Session.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Board Tokens
BoardToken.belongsTo(Board, { foreignKey: 'board_id', as: 'board' });

// Licenses
School.hasMany(License, { foreignKey: 'school_id', as: 'licenses' });
License.belongsTo(School, { foreignKey: 'school_id', as: 'school' });
License.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

module.exports = {
  School,
  User,
  Board,
  UsbKey,
  UnlockLog,
  Screenshot,
  Announcement,
  File,
  SiteRule,
  Session,
  MasterKey,
  BoardToken,
  License
};
