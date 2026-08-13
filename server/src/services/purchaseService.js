const { UniqueConstraintError } = require('sequelize');
const { sequelize, User, Drop, Reservation, Purchase } = require('../models');
const {
  emitStockUpdated,
  emitPurchaseFeedUpdated,
} = require('../sockets/socketEmitter');
const { getLatestPurchasers } = require('./purchaseFeedService');

async function purchaseDrop({ dropId, userId }) {
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        const err = new Error('User not found');
        err.status = 404;
        throw err;
      }

      const dropExists = await Drop.findByPk(dropId, { transaction });
      if (!dropExists) {
        const err = new Error('Drop not found');
        err.status = 404;
        throw err;
      }

      const reservation = await Reservation.findOne({
        where: {
          userId,
          dropId,
          status: 'active',
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!reservation) {
        const alreadyPurchased = await Purchase.findOne({
          where: { userId, dropId },
          transaction,
        });
        const completedReservation = await Reservation.findOne({
          where: { userId, dropId, status: 'completed' },
          transaction,
        });

        if (alreadyPurchased || completedReservation) {
          const err = new Error('Reservation has already been purchased');
          err.status = 409;
          throw err;
        }

        const expiredReservation = await Reservation.findOne({
          where: { userId, dropId, status: 'expired' },
          transaction,
        });
        if (expiredReservation) {
          const err = new Error('Reservation has expired');
          err.status = 410;
          throw err;
        }

        const err = new Error('No active reservation found');
        err.status = 400;
        throw err;
      }

      if (reservation.status !== 'active') {
        if (reservation.status === 'completed') {
          const err = new Error('Reservation has already been purchased');
          err.status = 409;
          throw err;
        }
        const err = new Error('No active reservation found');
        err.status = 400;
        throw err;
      }

      if (reservation.expiresAt <= new Date()) {
        const err = new Error('Reservation has expired');
        err.status = 410;
        throw err;
      }

      const drop = await Drop.findByPk(dropId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!drop) {
        const err = new Error('Drop not found');
        err.status = 404;
        throw err;
      }

      const purchase = await Purchase.create(
        {
          dropId,
          userId,
          reservationId: reservation.id,
          quantity: reservation.quantity,
          purchasedAt: new Date(),
        },
        { transaction }
      );

      reservation.status = 'completed';
      await reservation.save({ transaction });

      return {
        purchaseId: purchase.id,
        dropId: purchase.dropId,
        userId: purchase.userId,
        reservationId: purchase.reservationId,
        quantity: purchase.quantity,
        purchasedAt: purchase.purchasedAt,
        availableStock: drop.availableStock,
      };
    });

    emitStockUpdated(result.dropId, result.availableStock);

    const purchasers = await getLatestPurchasers(result.dropId);
    emitPurchaseFeedUpdated(result.dropId, purchasers);

    return result;
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      const conflict = new Error('Reservation has already been purchased');
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  }
}

module.exports = {
  purchaseDrop,
};
