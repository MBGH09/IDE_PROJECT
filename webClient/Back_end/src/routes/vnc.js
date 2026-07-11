import express from 'express';
import { getVncPage } from '../controllers/vncController.js';

const router = express.Router();

router.get('/', getVncPage);

export default router;
