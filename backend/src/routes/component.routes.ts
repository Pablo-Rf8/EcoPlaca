import { Router } from 'express';
import { componentController } from '../controllers/component.controller';

const router = Router();

router.get('/', componentController.getComponents);
router.get('/:id', componentController.getComponentById);
router.post('/', componentController.createComponent);
router.patch('/:id/status', componentController.updateStatus);
router.get('/:id/traceability', componentController.getTraceability);

export default router;
