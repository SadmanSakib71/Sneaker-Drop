const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Reservation = sequelize.define(
  'Reservation',
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
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1,
      },
    },
    status: {
      type: DataTypes.ENUM('active', 'completed', 'expired', 'cancelled'),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: 'reservations',
  }
);

module.exports = Reservation;
