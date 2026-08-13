const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

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
