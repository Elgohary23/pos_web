import { Router } from 'express'
import { CategoryController } from '../controllers/categoryController.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth, CategoryController.list)
router.get('/:id', requireAuth, CategoryController.get)
router.post('/', requireAuth, requireAdmin, CategoryController.create)
router.put('/:id', requireAuth, requireAdmin, CategoryController.update)
router.delete('/:id', requireAuth, requireAdmin, CategoryController.remove)

export default router