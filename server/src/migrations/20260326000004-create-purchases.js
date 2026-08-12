'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('purchases', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      dropId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'drops',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      reservationId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'reservations',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      purchasedAt: {
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

    await queryInterface.addConstraint('purchases', {
      fields: ['quantity'],
      type: 'check',
      name: 'purchases_quantity_positive',
      where: {
        quantity: {
          [Sequelize.Op.gt]: 0,
        },
      },
    });

    await queryInterface.addIndex('purchases', ['dropId'], {
      name: 'purchases_drop_id_idx',
    });
    await queryInterface.addIndex('purchases', ['purchasedAt'], {
      name: 'purchases_purchased_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('purchases');
  },
};
