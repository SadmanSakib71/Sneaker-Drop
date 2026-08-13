const sequelize = require('../config/database');
const User = require('./User');
const Drop = require('./Drop');
const Reservation = require('./Reservation');
const Purchase = require('./Purchase');

User.hasMany(Reservation, { foreignKey: 'userId' });
User.hasMany(Purchase, { foreignKey: 'userId' });

Drop.hasMany(Reservation, { foreignKey: 'dropId' });
Drop.hasMany(Purchase, { foreignKey: 'dropId' });

Reservation.belongsTo(User, { foreignKey: 'userId' });
Reservation.belongsTo(Drop, { foreignKey: 'dropId' });
Reservation.hasOne(Purchase, { foreignKey: 'reservationId' });

Purchase.belongsTo(User, { foreignKey: 'userId' });
Purchase.belongsTo(Drop, { foreignKey: 'dropId' });
Purchase.belongsTo(Reservation, { foreignKey: 'reservationId' });

module.exports = {
  sequelize,
  User,
  Drop,
  Reservation,
  Purchase,
};
