const { sequelize, User, Drop, Reservation } = require('../models');
const { emitStockUpdated } = require('../sockets/socketEmitter');

/**
 * Atomically reserve stock for a drop.
 *
 * Concurrency safety comes from SELECT … FOR UPDATE on the drop row:
 * only one transaction can hold the lock at a time, so stock checks and
 * decrements cannot race.
 *
 * Socket.io is notified only AFTER the transaction commits successfully.
 */
async function reserveDrop({ dropId, userId, quantity }) {
  const result = await sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }

    // Lock this drop row until the transaction ends (SELECT … FOR UPDATE).
    const drop = await Drop.findByPk(dropId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!drop) {
      const err = new Error('Drop not found');
      err.status = 404;
      throw err;
    }

    if (drop.availableStock < quantity) {
      const err = new Error('Not enough stock available');
      err.status = 409;
      throw err;
    }

    // One active reservation per user per drop (also enforced by DB unique index).
    const existing = await Reservation.findOne({
      where: {
        userId,
        dropId,
        status: 'active',
      },
      transaction,
    });

    if (existing) {
      const err = new Error('You already have an active reservation for this drop');
      err.status = 409;
      throw err;
    }

    // Server clock only — never trust the client for expiresAt.
    const expiresAt = new Date(Date.now() + 60 * 1000);

    drop.availableStock -= quantity;
    await drop.save({ transaction });

    const reservation = await Reservation.create(
      {
        userId,
        dropId,
        quantity,
        status: 'active',
        expiresAt,
      },
      { transaction }
    );

    return {
      reservationId: reservation.id,
      dropId: reservation.dropId,
      userId: reservation.userId,
      quantity: reservation.quantity,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
      availableStock: drop.availableStock,
    };
  });

  // COMMIT succeeded — broadcast committed stock to drop room clients.
  emitStockUpdated(result.dropId, result.availableStock);

  return result;
}

module.exports = {
  reserveDrop,
};
