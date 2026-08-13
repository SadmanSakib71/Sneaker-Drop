const { Purchase, User } = require('../models');

/** Maps User.name → username for the activity-feed contract. */
function formatPurchaser(purchase) {
  return {
    userId: purchase.userId,
    username: purchase.User ? purchase.User.name : null,
    purchasedAt: purchase.purchasedAt,
  };
}

/** Latest 3 purchasers for one drop, newest first. Never mixes drops. */
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

/** Latest 3 purchasers for each drop (one scoped query per drop). */
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
  getLatestPurchasers,
  getLatestPurchasersByDropIds,
};
