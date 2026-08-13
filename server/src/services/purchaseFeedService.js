const { Purchase, User } = require('../models');

function formatPurchaser(purchase) {
  return {
    userId: purchase.userId,
    username: purchase.User ? purchase.User.name : null,
    purchasedAt: purchase.purchasedAt,
  };
}

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
