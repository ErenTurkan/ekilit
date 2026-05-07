const bcrypt = require('bcryptjs');
const { User, School, MasterKey } = require('../models');
const logger = require('../config/logger');

/**
 * Seeds the database with initial data:
 * - SuperAdmin account
 * - Master key
 * - Demo school (optional)
 */
async function seed() {
  try {
    // 1. Create SuperAdmin if not exists
    const existingSuperAdmin = await User.findOne({ where: { role: 'superadmin' } });
    if (!existingSuperAdmin) {
      const password_hash = await bcrypt.hash('admin123', 12);
      await User.create({
        email: 'admin@e-kilit.com',
        password_hash,
        full_name: 'Sistem Yöneticisi',
        role: 'superadmin',
        is_active: true,
        qr_secret: require('uuid').v4()
      });
      logger.info('✅ SuperAdmin hesabı oluşturuldu: admin@e-kilit.com / admin123');
    }

    // 2. Create Master Key if not exists
    const existingMasterKey = await MasterKey.findOne({ where: { is_active: true } });
    if (!existingMasterKey) {
      const masterKeyValue = 'ekilit-master-2024';
      const key_hash = await bcrypt.hash(masterKeyValue, 12);
      await MasterKey.create({
        key_hash,
        label: 'Varsayılan Master Key',
        is_active: true
      });
      logger.info(`✅ Master key oluşturuldu: ${masterKeyValue}`);
    }

    // 3. Create demo school if not exists
    const existingSchool = await School.findOne({ where: { school_code: 'DEMO001' } });
    if (!existingSchool) {
      const school = await School.create({
        school_code: 'DEMO001',
        name: 'Demo Okulu',
        city: 'İstanbul',
        district: 'Kadıköy',
        address: 'Moda Cad. No:1',
        phone: '0216 000 0000',
        status: 'active'
      });

      // Create demo principal
      const principalHash = await bcrypt.hash('mudur123', 12);
      await User.create({
        school_id: school.id,
        email: 'mudur@demo.e-kilit.com',
        password_hash: principalHash,
        full_name: 'Demo Müdür',
        role: 'principal',
        is_active: true,
        qr_secret: require('uuid').v4()
      });

      // Create demo teacher
      const teacherHash = await bcrypt.hash('ogretmen123', 12);
      await User.create({
        school_id: school.id,
        email: 'ogretmen@demo.e-kilit.com',
        password_hash: teacherHash,
        full_name: 'Demo Öğretmen',
        role: 'teacher',
        is_active: true,
        qr_secret: require('uuid').v4()
      });

      logger.info('✅ Demo okul ve hesaplar oluşturuldu');
    }

    logger.info('✅ Seed işlemi tamamlandı');
  } catch (error) {
    logger.error('Seed hatası:', error);
  }
}

module.exports = { seed };
