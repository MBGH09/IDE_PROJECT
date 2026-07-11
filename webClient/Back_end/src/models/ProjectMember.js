import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const ProjectMember = sequelize.define('ProjectMember', {
  role: {
    type: DataTypes.ENUM('owner', 'editor', 'viewer'),
    allowNull: false,
    defaultValue: 'viewer',
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted'),
    allowNull: false,
    defaultValue: 'pending',
  }
}, {  
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default ProjectMember;
