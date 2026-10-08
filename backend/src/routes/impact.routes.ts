import { Router } from 'express';
import { impactController } from '../controllers/impact.controller';

const router = Router();

router.get('/summary', impactController.getImpactSummary);

export default router;
