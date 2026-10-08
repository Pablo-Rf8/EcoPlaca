import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.post('/login', authController.login);
router.get('/profile', authenticateToken, authController.getProfile);

export default router;
