const { Purchase, User } = require('../models');

/**
 * Shape a purchase + user into the activity-feed purchaser payload.
 * Maps User.name → username for the API contract.
 */
function formatPurchaser(purchase) {
  return {
    userId: purchase.userId,
    username: purchase.User ? purchase.User.name : null,
    purchasedAt: purchase.purchasedAt,
  };
}

/**
 * Latest 3 successful purchasers for a single drop (newest first).
 * Scoped by dropId — never mixes purchasers across drops.
 */
async function getLatestPurchasers(dropId) {
  const purchases = await Purchase.findAll({
    where: { dropId },
    include: [
      {
        model: User,
        attributes: ['id', 'name'],
      },
    ],
    order: [['purchasedAt', 'DESC']],
    limit: 3,
  });

  return purchases.map(formatPurchaser);
}

/**
 * Latest 3 purchasers for each drop in the list.
 * Uses one scoped query per drop — simple and correct for a small drop catalog.
 */
async function getLatestPurchasersByDropIds(dropIds) {
  const map = {};

  await Promise.all(
    dropIds.map(async (dropId) => {
      map[dropId] = await getLatestPurchasers(dropId);
    })
  );

  return map;
}

module.exports = {
  formatPurchaser,
  getLatestPurchasers,
  getLatestPurchasersByDropIds,
};
