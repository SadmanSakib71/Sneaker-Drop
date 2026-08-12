const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Drop = sequelize.define(
  'Drop',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    totalStock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    availableStock: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 0,
        isNotGreaterThanTotal(value) {
          if (value > this.totalStock) {
            throw new Error('availableStock cannot be greater than totalStock');
          }
        },
      },
    },
    startsAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: 'drops',
  }
);

module.exports = Drop;
