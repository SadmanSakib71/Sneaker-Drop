const { Drop } = require('../models');
const {
  getLatestPurchasers,
  getLatestPurchasersByDropIds,
} = require('../services/purchaseFeedService');

function formatDrop(drop, latestPurchasers = []) {
  return {
    id: drop.id,
    name: drop.name,
    description: drop.description,
    price: Number(drop.price),
    totalStock: drop.totalStock,
    availableStock: drop.availableStock,
    startsAt: drop.startsAt,
    latestPurchasers,
  };
}

/** availableStock is ignored here — the server always sets it from totalStock. */
function validateCreateBody(body) {
  if (body.name === undefined || body.name === null || String(body.name).trim() === '') {
    return 'name is required';
  }

  if (body.price === undefined || body.price === null || body.price === '') {
    return 'price is required';
  }
  const price = Number(body.price);
  if (Number.isNaN(price) || price < 0) {
    return 'price must be a number greater than or equal to 0';
  }

  if (body.totalStock === undefined || body.totalStock === null || body.totalStock === '') {
    return 'totalStock is required';
  }
  const totalStock = Number(body.totalStock);
  if (!Number.isInteger(totalStock) || totalStock <= 0) {
    return 'totalStock must be an integer greater than 0';
  }

  if (body.startsAt === undefined || body.startsAt === null || body.startsAt === '') {
    return 'startsAt is required';
  }
  const startsAt = new Date(body.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return 'startsAt must be a valid date';
  }

  return null;
}

async function createDrop(req, res, next) {
  try {
    const error = validateCreateBody(req.body || {});
    if (error) {
      return res.status(400).json({ status: 'error', message: error });
    }

    const { name, description, price, totalStock, startsAt } = req.body;
    const stock = Number(totalStock);

    const drop = await Drop.create({
      name: String(name).trim(),
      description: description != null ? String(description) : null,
      price: Number(price),
      totalStock: stock,
      availableStock: stock, // never trust the client for inventory
      startsAt: new Date(startsAt),
    });

    return res.status(201).json({
      status: 'success',
      data: formatDrop(drop, []),
    });
  } catch (err) {
    return next(err);
  }
}

async function getAllDrops(req, res, next) {
  try {
    const drops = await Drop.findAll({
      order: [['startsAt', 'ASC']],
    });

    const purchasersByDropId = await getLatestPurchasersByDropIds(
      drops.map((drop) => drop.id)
    );

    return res.status(200).json({
      status: 'success',
      data: drops.map((drop) =>
        formatDrop(drop, purchasersByDropId[drop.id] || [])
      ),
    });
  } catch (err) {
    return next(err);
  }
}

async function getDropById(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid drop ID',
      });
    }

    const drop = await Drop.findByPk(id);
    if (!drop) {
      return res.status(404).json({
        status: 'error',
        message: 'Drop not found',
      });
    }

    const latestPurchasers = await getLatestPurchasers(drop.id);

    return res.status(200).json({
      status: 'success',
      data: formatDrop(drop, latestPurchasers),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createDrop,
  getAllDrops,
  getDropById,
};
