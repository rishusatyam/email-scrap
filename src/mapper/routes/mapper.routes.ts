import { Router } from 'express';
import { MapperController } from '../controllers/mapper.controller';

const router = Router();
const mapperController = new MapperController();

router.post('/map-email', mapperController.mapEmail);

export default router;
