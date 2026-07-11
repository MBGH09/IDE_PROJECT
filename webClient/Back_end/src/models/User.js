import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  avatar_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  display_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('online', 'idle', 'offline'),
    defaultValue: 'offline',
  },
  last_active_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  root_path: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  createdAt: 'created_at',
  updatedAt: false,
});

export default User;
