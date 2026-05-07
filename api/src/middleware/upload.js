const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Ensure upload directories exist
const uploadDirs = ['uploads', 'uploads/screenshots', 'uploads/files', 'uploads/avatars', 'uploads/announcements'];
uploadDirs.forEach(dir => {
  const fullPath = path.join(__dirname, '../../', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Screenshot upload config
const screenshotStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/screenshots');
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `screenshot_${Date.now()}_${uuidv4().slice(0, 8)}${ext}`);
  }
});

// General file upload config (50MB max)
const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/files');
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${uuidv4().slice(0, 8)}_${safeName}`);
  }
});

// Avatar upload config
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/avatars');
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `avatar_${Date.now()}_${uuidv4().slice(0, 8)}${ext}`);
  }
});

// Announcement image upload
const announcementStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/announcements');
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `announcement_${Date.now()}_${uuidv4().slice(0, 8)}${ext}`);
  }
});

// File filters
const imageFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Sadece resim dosyaları kabul edilir (JPEG, PNG, WebP, GIF)'), false);
  }
};

const anyFileFilter = (req, file, cb) => {
  // Block dangerous file types
  const blockedExtensions = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.msi'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (blockedExtensions.includes(ext)) {
    cb(new Error('Bu dosya türü desteklenmiyor'), false);
  } else {
    cb(null, true);
  }
};

// Export configured uploaders
const uploadScreenshot = multer({
  storage: screenshotStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for screenshots
  fileFilter: imageFilter
});

const uploadFile = multer({
  storage: fileStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: anyFileFilter
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: imageFilter
});

const uploadAnnouncementImage = multer({
  storage: announcementStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFilter
});

module.exports = {
  uploadScreenshot,
  uploadFile,
  uploadAvatar,
  uploadAnnouncementImage
};
