import { Router } from 'express';
import { reservationController } from '../controllers/reservation.controller';

const router = Router();

router.get('/', reservationController.getReservations);
router.post('/', reservationController.createReservation);
router.patch('/:id/status', reservationController.updateReservationStatus);

export default router;
