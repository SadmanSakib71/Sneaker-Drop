const express = require('express');
const {
  createDrop,
  getAllDrops,
  getDropById,
} = require('../controllers/dropController');

const router = express.Router();

router.post('/', createDrop);
router.get('/', getAllDrops);
router.get('/:id', getDropById);

module.exports = router;
