const { getIO } = require('./socket');

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
