const { Sequelize } = require('sequelize');
const logger = require('./logger');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'ekilit',
  process.env.DB_USER || 'root',
  process.env.DB_PASS || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    dialect: process.env.DB_DIALECT || 'mysql',
    storage: process.env.DB_DIALECT === 'sqlite' ? './ekilit_test.sqlite' : undefined,
    logging: (msg) => logger.debug(msg),
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    },
    ...(process.env.DB_DIALECT !== 'sqlite' ? { timezone: '+03:00' } : {})
  }
);

module.exports = { sequelize, Sequelize };
