const { reserveDrop } = require('../services/reservationService');

/**
 * POST /api/drops/:id/reserve
 * Header: X-User-Id (required)
 * Body (optional): { quantity } — defaults to 1
 */
async function reserve(req, res, next) {
  try {
    const userIdHeader = req.get('X-User-Id');
    if (userIdHeader === undefined || userIdHeader === null || String(userIdHeader).trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'Missing X-User-Id header',
      });
    }

    const userId = Number(userIdHeader);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid X-User-Id',
      });
    }

    const dropId = Number(req.params.id);
    if (!Number.isInteger(dropId) || dropId <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid drop ID',
      });
    }

    // Default quantity to 1 when omitted.
    let quantity = 1;
    if (req.body && req.body.quantity !== undefined && req.body.quantity !== null && req.body.quantity !== '') {
      quantity = Number(req.body.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'quantity must be a positive integer',
        });
      }
    }

    const data = await reserveDrop({ dropId, userId, quantity });

    return res.status(201).json({
      status: 'success',
      data,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        status: 'error',
        message: err.message,
      });
    }
    return next(err);
  }
}

module.exports = {
  reserve,
};
