import { Router } from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { BackupController } from '../controllers/backupController.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backupsDir = path.join(__dirname, '..', 'backups')

if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: backupsDir,
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || '.sqlite'
    cb(null, `restore-upload-${Date.now()}-${Math.round(Math.random() * 99999)}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
})

const router = Router()

router.use(requireAuth, requireAdmin)

router.get('/status', BackupController.status)
router.get('/download', asyncHandler(BackupController.download))
router.post('/restore', upload.single('file'), asyncHandler(BackupController.restore))

export default router
