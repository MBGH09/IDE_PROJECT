import { Project, User } from './src/models/index.js';
import sequelize from './src/config/db.js';

const projectId = '48025e2f-6806-4853-b7db-b6279b9becd3';

async function check() {
  try {
    const project = await Project.findByPk(projectId, {
      include: [{ model: User, as: 'Owner' }]
    });
    console.log('Project:', JSON.stringify(project, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sequelize.close();
  }
}

check();
