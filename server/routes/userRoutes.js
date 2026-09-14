import { Router } from 'express'
import { UserController } from '../controllers/userController.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'

const router = Router()

router.use(requireAuth, requireAdmin)

router.get('/', UserController.list)
router.post('/', UserController.create)
router.put('/:id', UserController.update)
router.delete('/:id', UserController.remove)

export default router