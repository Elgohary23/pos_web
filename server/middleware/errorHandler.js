import { AppError } from '../utils/AppError.js'

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'المسار غير موجود' },
  })
}

export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message },
    })
  }
  if (err?.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'حجم الصورة يتجاوز الحد الأقصى (2MB)'
      : 'خطأ في رفع الملف'
    return res.status(400).json({
      success: false,
      error: { code: 'UPLOAD_ERROR', message },
    })
  }
  console.error(err)
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'حدث خطأ غير متوقع' },
  })
}