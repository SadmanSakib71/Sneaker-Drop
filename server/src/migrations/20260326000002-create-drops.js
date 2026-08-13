'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('drops', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      totalStock: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      availableStock: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      startsAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addConstraint('drops', {
      fields: ['totalStock'],
      type: 'check',
      name: 'drops_total_stock_non_negative',
      where: {
        totalStock: {
          [Sequelize.Op.gte]: 0,
        },
      },
    });

    await queryInterface.addConstraint('drops', {
      fields: ['availableStock'],
      type: 'check',
      name: 'drops_available_stock_non_negative',
      where: {
        availableStock: {
          [Sequelize.Op.gte]: 0,
        },
      },
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE drops
      ADD CONSTRAINT drops_available_lte_total
      CHECK ("availableStock" <= "totalStock");
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('drops');
  },
};
