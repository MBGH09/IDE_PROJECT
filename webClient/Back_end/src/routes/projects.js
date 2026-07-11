import express from 'express';
import { createProject, getProjects, getProjectById, updateProject, inviteUser, removeMember, acceptInvitation, rejectInvitation } from '../controllers/projectController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.post('/', createProject);
router.get('/', getProjects);
router.get('/:id', getProjectById);
router.put('/:id', updateProject);
router.post('/:id/invite', inviteUser);
router.post('/:id/accept', acceptInvitation);
router.post('/:id/reject', rejectInvitation);
router.delete('/:id/members/:userId', removeMember);

export default router;
