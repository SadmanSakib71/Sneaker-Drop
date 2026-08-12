const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Purchase = sequelize.define(
  'Purchase',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    dropId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    reservationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
      },
    },
    purchasedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: 'purchases',
  }
);

module.exports = Purchase;
