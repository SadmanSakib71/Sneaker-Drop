const express = require('express');
const {
  createDrop,
  getAllDrops,
  getDropById,
} = require('../controllers/dropController');
const { reserve } = require('../controllers/reservationController');

const router = express.Router();

router.post('/', createDrop);
router.get('/', getAllDrops);
router.post('/:id/reserve', reserve);
router.get('/:id', getDropById);

module.exports = router;
