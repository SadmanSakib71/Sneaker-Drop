'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('reservations', {
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
      quantity: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      status: {
        type: Sequelize.ENUM('active', 'completed', 'expired', 'cancelled'),
        allowNull: false,
      },
      expiresAt: {
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

    await queryInterface.addConstraint('reservations', {
      fields: ['quantity'],
      type: 'check',
      name: 'reservations_quantity_positive',
      where: {
        quantity: {
          [Sequelize.Op.gt]: 0,
        },
      },
    });

    // Useful lookup indexes for reservation flows
    await queryInterface.addIndex('reservations', ['dropId'], {
      name: 'reservations_drop_id_idx',
    });
    await queryInterface.addIndex('reservations', ['userId'], {
      name: 'reservations_user_id_idx',
    });
    await queryInterface.addIndex('reservations', ['status'], {
      name: 'reservations_status_idx',
    });
    await queryInterface.addIndex('reservations', ['expiresAt'], {
      name: 'reservations_expires_at_idx',
    });

    // One active reservation per user per drop (partial unique index)
    await queryInterface.addIndex('reservations', ['userId', 'dropId'], {
      unique: true,
      name: 'reservations_user_drop_active_unique',
      where: {
        status: 'active',
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('reservations');
    // ENUM type is left behind in Postgres unless removed explicitly
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_reservations_status";'
    );
  },
};
