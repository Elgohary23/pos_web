import { BackupService } from '../services/backupService.js'
import { ValidationError } from '../utils/errors.js'

export const BackupController = {
  async download(req, res, next) {
    const backup = await BackupService.createBackup()
    res.download(backup.filePath, backup.filename, (err) => {
      if (err) return next(err)
    })
  },

  status(req, res) {
    res.json({ success: true, data: BackupService.status(), message: 'تم جلب حالة قاعدة البيانات' })
  },

  restore(req, res, next) {
    if (!req.file) {
      return next(new ValidationError('يجب اختيار ملف النسخة الاحتياطية'))
    }
    const result = BackupService.restore(req.file.path)
    req.session.destroy((err) => {
      if (err) return next(err)
      res.json({
        success: true,
        data: { restored: true, ...result },
        message: 'تمت استعادة النسخة الاحتياطية بنجاح. من فضلك سجّل الدخول من جديد.',
      })
    })
  },
}
