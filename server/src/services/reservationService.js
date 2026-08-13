const { sequelize, User, Drop, Reservation } = require('../models');
const { emitStockUpdated } = require('../sockets/socketEmitter');

async function reserveDrop({ dropId, userId, quantity }) {
  const result = await sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      const err = new Error('User not found');
      err.status = 404;
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

    if (drop.availableStock < quantity) {
      const err = new Error('Not enough stock available');
      err.status = 409;
      throw err;
    }

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

  emitStockUpdated(result.dropId, result.availableStock);

  return result;
}

module.exports = {
  reserveDrop,
};
