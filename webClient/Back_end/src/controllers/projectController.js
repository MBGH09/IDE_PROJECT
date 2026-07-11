import { Project, User, ProjectMember } from '../models/index.js';
import { Op } from 'sequelize';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createProject = async (req, res, next) => {
  try {
    const { name, description, visibility, language, template } = req.body;
    
    let user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Lazy folder creation for existing users
    if (!user.root_path) {
      const userFolderName = user.username.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const storagePath = path.resolve(__dirname, '..', '..', 'projects_storage');
      const userPath = path.join(storagePath, userFolderName);

      if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });
      if (!fs.existsSync(userPath)) fs.mkdirSync(userPath, { recursive: true });

      user.root_path = userPath;
      await user.save();
    }

    const projectFolderName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + Date.now();
    const projectPath = path.join(user.root_path, projectFolderName);

    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    const project = await Project.create({ 
      name, 
      description, 
      owner_id: req.user.id,
      visibility: visibility || 'private',
      language,
      template,
      active_session: false,
      path: projectPath
    });
    
    await ProjectMember.create({
      user_id: req.user.id,
      project_id: project.id,
      role: 'owner',
      status: 'accepted'
    });
    
    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
};

export const getProjects = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: {
        model: Project,
        include: [{ model: User, attributes: ['id', 'username', 'display_name', 'avatar_url'] }]
      }
    });
    res.json(user.Projects || []);
  } catch (error) {
    next(error);
  }
};

export const getProjectById = async (req, res, next) => {
  try {
    const project = await Project.findByPk(req.params.id, {
      include: [{ model: User, attributes: ['id', 'username', 'display_name', 'avatar_url', 'status'] }]
    });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    
    const isMember = await ProjectMember.findOne({ where: { user_id: req.user.id, project_id: project.id }});
    if (!isMember && project.visibility !== 'public') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    res.json(project);
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (req, res, next) => {
  try {
    const { name, description, visibility, language, active_session } = req.body;
    const project = await Project.findByPk(req.params.id);
    
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const member = await ProjectMember.findOne({ where: { user_id: req.user.id, project_id: project.id }});
    if (!member || (member.role !== 'owner' && member.role !== 'editor')) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await project.update({
      name, description, visibility, language, active_session,
      last_edited_by: req.user.id
    });
    
    res.json(project);
  } catch (error) {
    next(error);
  }
};

export const inviteUser = async (req, res, next) => {
  try {
    const { identifier, role } = req.body; // role: editor or viewer
    const projectId = req.params.id;

    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const currentMember = await ProjectMember.findOne({ where: { user_id: req.user.id, project_id: project.id }});
    if (!currentMember || currentMember.role !== 'owner') {
      return res.status(403).json({ message: 'Only the owner can invite members' });
    }

    const userToInvite = await User.findOne({
      where: { [Op.or]: [{ username: identifier }, { email: identifier }] }
    });

    if (!userToInvite) return res.status(404).json({ message: 'User not found' });

    const [member, created] = await ProjectMember.findOrCreate({
      where: { user_id: userToInvite.id, project_id: project.id },
      defaults: { role: role || 'viewer', status: 'pending' }
    });

    if (!created) {
      return res.status(400).json({ message: 'User is already invited or a member of this project' });
    }

    res.json({ message: 'User invited successfully' });
  } catch (error) {
    next(error);
  }
};

export const removeMember = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const userIdToRemove = req.params.userId;

    const project = await Project.findByPk(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const currentMember = await ProjectMember.findOne({ where: { user_id: req.user.id, project_id: project.id }});
    if (!currentMember || currentMember.role !== 'owner') {
      return res.status(403).json({ message: 'Only the owner can remove members' });
    }

    if (userIdToRemove === project.owner_id) {
      return res.status(400).json({ message: 'Cannot remove the owner' });
    }

    await ProjectMember.destroy({ where: { user_id: userIdToRemove, project_id: project.id }});
    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    next(error);
  }
};

export const acceptInvitation = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const member = await ProjectMember.findOne({ where: { user_id: req.user.id, project_id: projectId }});
    
    if (!member || member.status !== 'pending') {
      return res.status(404).json({ message: 'Pending invitation not found' });
    }
    
    await member.update({ status: 'accepted' });
    res.json({ message: 'Invitation accepted' });
  } catch (error) {
    next(error);
  }
};

export const rejectInvitation = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const member = await ProjectMember.findOne({ where: { user_id: req.user.id, project_id: projectId }});
    
    if (!member || member.status !== 'pending') {
      return res.status(404).json({ message: 'Pending invitation not found' });
    }
    
    await member.destroy();
    res.json({ message: 'Invitation rejected' });
  } catch (error) {
    next(error);
  }
};
