const { purchaseDrop } = require('../services/purchaseService');

async function purchase(req, res, next) {
  try {
    const userIdHeader = req.get('X-User-Id');
    if (userIdHeader === undefined || userIdHeader === null || String(userIdHeader).trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'X-User-Id header is required',
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

    const data = await purchaseDrop({ dropId, userId });

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
  purchase,
};
