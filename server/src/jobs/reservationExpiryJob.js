const { expireDueReservations } = require('../services/reservationExpiryService');

const INTERVAL_MS = 1500;

let isRunning = false;
let intervalId = null;

async function tick() {
  if (isRunning) {
    return;
  }

  isRunning = true;
  try {
    await expireDueReservations();
  } catch (err) {
    console.error('Reservation expiry job error:', err.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the periodic expiry worker. Safe to call once after DB is connected.
 * Only one interval is created per process.
 */
function startReservationExpiryJob() {
  if (intervalId !== null) {
    return;
  }

  console.log(`Reservation expiry job started (every ${INTERVAL_MS}ms).`);
  intervalId = setInterval(tick, INTERVAL_MS);
}

module.exports = {
  startReservationExpiryJob,
};
