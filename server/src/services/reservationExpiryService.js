const { Op } = require('sequelize');
const { sequelize, Drop, Reservation } = require('../models');

/**
 * Expire one reservation and restore its stock, atomically.
 *
 * SELECT … FOR UPDATE on both rows + status re-check means a concurrent
 * purchase (or another expiry attempt) cannot double-restore stock or
 * expire a reservation that is no longer active.
 */
async function expireOneReservation(reservationId) {
  return sequelize.transaction(async (transaction) => {
    const reservation = await Reservation.findByPk(reservationId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!reservation) {
      return null;
    }

    // Re-check after lock — another process may have completed/cancelled/expired it.
    if (reservation.status !== 'active') {
      return null;
    }

    if (reservation.expiresAt > new Date()) {
      return null;
    }

    const drop = await Drop.findByPk(reservation.dropId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!drop) {
      throw new Error(`Drop ${reservation.dropId} not found for reservation ${reservationId}`);
    }

    reservation.status = 'expired';
    await reservation.save({ transaction });

    drop.availableStock += reservation.quantity;
    await drop.save({ transaction });

    return {
      reservationId: reservation.id,
      dropId: drop.id,
      quantity: reservation.quantity,
      availableStock: drop.availableStock,
    };
  });
}

/**
 * Find active reservations past expiresAt and expire each one safely.
 * Candidate lookup is outside the transaction; each expire re-checks under lock.
 */
async function expireDueReservations() {
  const due = await Reservation.findAll({
    where: {
      status: 'active',
      expiresAt: { [Op.lte]: new Date() },
    },
    attributes: ['id'],
  });

  let expiredCount = 0;

  for (const row of due) {
    const result = await expireOneReservation(row.id);
    if (result) {
      console.log(
        `Reservation ${result.reservationId} expired. Restored ${result.quantity} unit(s) to drop ${result.dropId}.`
      );
      expiredCount += 1;
    }
  }

  return expiredCount;
}

module.exports = {
  expireOneReservation,
  expireDueReservations,
};
