import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { User } from '../models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const register = async (req, res, next) => {
  try {
    const { username, email, display_name, password } = req.body;
    
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    
    // Create User Folder
    const userFolderName = username.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const storagePath = path.resolve(__dirname, '..', '..', 'projects_storage');
    const userPath = path.join(storagePath, userFolderName);

    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
    if (!fs.existsSync(userPath)) {
      fs.mkdirSync(userPath, { recursive: true });
    }

    const user = await User.create({ 
      username, 
      email, 
      display_name, 
      password_hash,
      status: 'offline',
      root_path: userPath
    });

    res.status(201).json({ message: 'User registered successfully', userId: user.id });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    user.status = 'online';
    user.last_active_at = new Date();
    await user.save();

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'fallback', { expiresIn: '1d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, display_name: user.display_name, status: user.status, avatar_url: user.avatar_url } });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (user) {
      user.status = 'offline';
      user.last_active_at = new Date();
      await user.save();
    }
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};
