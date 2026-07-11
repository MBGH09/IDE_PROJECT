import User from './User.js';
import Project from './Project.js';
import ProjectMember from './ProjectMember.js';

// User hasMany Project (as owner)
User.hasMany(Project, { as: 'OwnedProjects', foreignKey: 'owner_id' });
Project.belongsTo(User, { as: 'Owner', foreignKey: 'owner_id' });

// User hasMany Project (as last editor)
User.hasMany(Project, { as: 'LastEditedProjects', foreignKey: 'last_edited_by' });
Project.belongsTo(User, { as: 'LastEditor', foreignKey: 'last_edited_by' });

// Many-to-Many relation through ProjectMember
User.belongsToMany(Project, { through: ProjectMember, foreignKey: 'user_id' });
Project.belongsToMany(User, { through: ProjectMember, foreignKey: 'project_id' });

export { User, Project, ProjectMember };
