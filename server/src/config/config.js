const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

/**
 * Sequelize CLI config (migrations).
 * Uses the same Neon DATABASE_URL as the app runtime connection.
 */
const shared = {
  url: process.env.DATABASE_URL,
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
  logging: false,
};

module.exports = {
  development: shared,
  test: shared,
  production: shared,
};
