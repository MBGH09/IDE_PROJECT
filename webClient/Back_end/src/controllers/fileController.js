import fs from 'fs';
import path from 'path';
import { Project, ProjectMember } from '../models/index.js';

const getProjectRoot = async (req) => {
  const projectId = req.headers['x-project-id'] || req.query.projectId;
  if (!projectId) throw new Error('Project ID is required');

  const project = await Project.findByPk(projectId);
  if (!project) throw new Error('Project not found');

  // Verify access
  const member = await ProjectMember.findOne({ where: { user_id: req.user.id, project_id: projectId } });
  if (!member && project.visibility !== 'public') {
    throw new Error('Access denied');
  }

  return project.path;
};

// 🔹 Build file tree
function buildTree(dir, base = "") {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map(name => {
    const fullPath = path.join(dir, name);
    const relativePath = path.join(base, name);
    const isDir = fs.statSync(fullPath).isDirectory();

    return {
      id: relativePath,
      name,
      isFolder: isDir,
      children: isDir ? buildTree(fullPath, relativePath) : undefined
    };
  });
}

// 📂 Get tree
export const getFiles = async (req, res, next) => {
  try {
    const ROOT = await getProjectRoot(req);
    res.json(buildTree(ROOT));
  } catch (error) {
    next(error);
  }
};

// 📄 Read file
export const readFile = async (req, res, next) => {
  try {
    const ROOT = await getProjectRoot(req);
    const filePath = path.join(ROOT, req.query.path);
    
    // Security check
    if (!filePath.startsWith(ROOT)) return res.status(403).send('Forbidden');

    res.send(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    next(error);
  }
};

// 💾 Save file
export const saveFile = async (req, res, next) => {
  try {
    const ROOT = await getProjectRoot(req);
    const { path: filePath, content } = req.body;
    const fullPath = path.join(ROOT, filePath);

    // Security check
    if (!fullPath.startsWith(ROOT)) return res.status(403).send('Forbidden');

    fs.writeFileSync(fullPath, content);
    res.sendStatus(200);
  } catch (error) {
    next(error);
  }
};
