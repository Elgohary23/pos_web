import { Router } from 'express'
import multer from 'multer'
import { ProductController } from '../controllers/productController.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { AppError } from '../utils/AppError.js'

const router = Router()

const storage = multer.diskStorage({
  destination: './uploads',
  filename(req, file, cb) {
    const ext = file.originalname.split('.').pop() || 'png'
    cb(null, `${Date.now()}-${Math.round(Math.random() * 99999)}.${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new AppError('VALIDATION_ERROR', 'الملف المرفوع يجب أن يكون صورة'))
    }
  },
})

router.get('/', requireAuth, ProductController.list)
router.get('/:id', requireAuth, ProductController.get)
router.post('/', requireAuth, requireAdmin, upload.single('image'), ProductController.create)
router.put('/:id', requireAuth, requireAdmin, upload.single('image'), ProductController.update)
router.delete('/:id', requireAuth, requireAdmin, ProductController.remove)

export default router