const Joi = require('joi');

/**
 * Validation middleware factory
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} source - 'body', 'query', or 'params'
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const details = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message.replace(/"/g, '')
      }));

      return res.status(400).json({
        error: 'Doğrulama hatası',
        details
      });
    }

    req[source] = value;
    next();
  };
};

// ========== VALIDATION SCHEMAS ==========

const schemas = {
  // Auth
  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Geçerli bir e-posta adresi girin',
      'any.required': 'E-posta adresi gerekli'
    }),
    password: Joi.string().required().messages({
      'any.required': 'Şifre gerekli'
    }),
    device_info: Joi.string().max(300).optional(),
    device_type: Joi.string().valid('desktop', 'mobile', 'board').optional()
  }),

  changePassword: Joi.object({
    current_password: Joi.string().required(),
    new_password: Joi.string().min(6).required()
  }),

  // Schools
  createSchool: Joi.object({
    school_code: Joi.string().min(3).max(20).required(),
    name: Joi.string().min(3).max(200).required(),
    city: Joi.string().max(100).optional(),
    district: Joi.string().max(100).optional(),
    address: Joi.string().optional(),
    phone: Joi.string().max(20).optional()
  }),

  updateSchool: Joi.object({
    name: Joi.string().min(3).max(200).optional(),
    city: Joi.string().max(100).optional(),
    district: Joi.string().max(100).optional(),
    address: Joi.string().optional(),
    phone: Joi.string().max(20).optional(),
    status: Joi.string().valid('active', 'suspended').optional()
  }),

  // Users
  createUser: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    full_name: Joi.string().min(2).max(200).required(),
    phone: Joi.string().max(20).optional().allow('', null),
    role: Joi.string().valid('principal', 'teacher').optional().default('teacher'),
    school_id: Joi.number().integer().optional().allow('', null)
  }),

  updateUser: Joi.object({
    full_name: Joi.string().min(2).max(200).optional(),
    email: Joi.string().email().optional(),
    phone: Joi.string().max(20).optional(),
    is_active: Joi.boolean().optional(),
    role: Joi.string().valid('principal', 'teacher').optional()
  }),

  // Boards
  registerBoard: Joi.object({
    school_code: Joi.string().required(),
    hardware_id: Joi.string().required(),
    name: Joi.string().min(2).max(200).required(),
    os_info: Joi.string().max(200).optional(),
    app_version: Joi.string().max(20).optional()
  }),

  updateBoard: Joi.object({
    name: Joi.string().min(2).max(200).optional(),
    status: Joi.string().valid('online', 'offline', 'locked', 'unlocked').optional()
  }),

  // USB Keys
  createUsbKey: Joi.object({
    key_serial: Joi.string().required(),
    user_id: Joi.number().integer().optional().allow('', null),
    school_id: Joi.number().integer().optional().allow('', null),
    label: Joi.string().max(200).optional()
  }),

  // Unlock
  unlockUsb: Joi.object({
    board_id: Joi.number().integer().required(),
    key_serial: Joi.string().required()
  }),

  unlockQr: Joi.object({
    board_code: Joi.string().required(),
    qr_token: Joi.string().required()
  }),

  unlockRemote: Joi.object({
    board_id: Joi.number().integer().required()
  }),

  unlockMasterkey: Joi.object({
    board_id: Joi.number().integer().required(),
    master_key: Joi.string().required()
  }),

  // Announcements
  createAnnouncement: Joi.object({
    title: Joi.string().min(3).max(300).required(),
    content: Joi.string().optional(),
    image_url: Joi.string().uri().optional(),
    priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
    school_id: Joi.number().integer().optional().allow('', null),
    starts_at: Joi.date().optional(),
    expires_at: Joi.date().optional()
  }),

  updateAnnouncement: Joi.object({
    title: Joi.string().min(3).max(300).optional(),
    content: Joi.string().optional(),
    image_url: Joi.string().uri().optional().allow('', null),
    priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
    is_active: Joi.boolean().optional(),
    starts_at: Joi.date().optional().allow(null),
    expires_at: Joi.date().optional().allow(null)
  }),

  // Site Rules
  createSiteRule: Joi.object({
    domain: Joi.string().min(3).max(300).required(),
    type: Joi.string().valid('whitelist', 'blacklist').required(),
    school_id: Joi.number().integer().optional().allow('', null)
  }),

  // Query params
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().optional(),
    order: Joi.string().valid('asc', 'desc').default('desc')
  }),

  reportQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
    board_id: Joi.number().integer().optional(),
    user_id: Joi.number().integer().optional(),
    method: Joi.string().valid('usb', 'qr', 'remote', 'masterkey').optional(),
    from: Joi.date().optional(),
    to: Joi.date().optional(),
    sort: Joi.string().optional(),
    order: Joi.string().valid('asc', 'desc').default('desc')
  })
};

module.exports = { validate, schemas };
