import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Project = sequelize.define('Project', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  owner_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  visibility: {
    type: DataTypes.ENUM('public', 'private'),
    defaultValue: 'private',
  },
  language: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  template: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  active_session: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  last_edited_by: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  path: {
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

export default Project;
