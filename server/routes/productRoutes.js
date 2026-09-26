import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { ProductController } from '../controllers/productController.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { AppError } from '../utils/AppError.js'

const router = Router()

// Must be absolute: under the Windows service the working directory is the
// app root, so a relative './uploads' would write outside server\ and the
// files would never be served by express.static.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: uploadsDir,
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