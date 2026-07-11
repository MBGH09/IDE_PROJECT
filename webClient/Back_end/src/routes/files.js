import express from 'express';
import { getFiles, readFile, saveFile } from '../controllers/fileController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', getFiles);
router.get('/file', readFile);
router.post('/file', saveFile);

export default router;
