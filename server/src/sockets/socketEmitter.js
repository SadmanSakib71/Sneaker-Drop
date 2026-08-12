const { getIO } = require('./socket');

/**
 * Broadcast the latest available stock for a drop to its room.
 * Call ONLY after a successful database COMMIT.
 */
function emitStockUpdated(dropId, availableStock) {
  const io = getIO();
  if (!io) {
    return;
  }

  io.to(`drop:${dropId}`).emit('stock_updated', {
    dropId,
    availableStock,
  });
}

/**
 * Broadcast the latest 3 purchasers for a drop to its room.
 * Call ONLY after a successful purchase COMMIT.
 */
function emitPurchaseFeedUpdated(dropId, purchasers) {
  const io = getIO();
  if (!io) {
    return;
  }

  io.to(`drop:${dropId}`).emit('purchase_feed_updated', {
    dropId,
    purchasers,
  });
}

module.exports = {
  emitStockUpdated,
  emitPurchaseFeedUpdated,
};
