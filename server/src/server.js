const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = require('./app');
const sequelize = require('./config/database');
const { startReservationExpiryJob } = require('./jobs/reservationExpiryJob');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established (Neon PostgreSQL via Sequelize).');

    // Start after DB is ready — never before authenticate() succeeds.
    startReservationExpiryJob();

    app.listen(PORT, () => {
      console.log(`SneakerDrop API listening on http://localhost:${PORT}`);
      console.log(`Health check: GET http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('Unable to start server — database connection failed:');
    console.error(error.message);
    process.exit(1);
  }
}

start();
