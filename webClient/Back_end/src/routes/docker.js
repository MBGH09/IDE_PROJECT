import express from 'express';
import { runContainer, stopContainer } from '../controllers/dockerController.js';

const router = express.Router();

router.post('/run', runContainer);
router.post('/stop', stopContainer);

export default router;
