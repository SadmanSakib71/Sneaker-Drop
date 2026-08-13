const { Op } = require('sequelize');
const { sequelize, Drop, Reservation } = require('../models');
const { emitStockUpdated } = require('../sockets/socketEmitter');

async function expireOneReservation(reservationId) {
  const result = await sequelize.transaction(async (transaction) => {
    const reservation = await Reservation.findByPk(reservationId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!reservation) {
      return null;
    }

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

  if (result) {
    emitStockUpdated(result.dropId, result.availableStock);
  }

  return result;
}

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
  expireDueReservations,
};
