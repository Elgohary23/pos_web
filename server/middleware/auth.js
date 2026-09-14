import db from '../database/db.js'
import { AppError } from '../utils/AppError.js'

export function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return next(new AppError('UNAUTHORIZED', 'غير مسجل الدخول', 401))
  }
  next()
}

export function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return next(new AppError('UNAUTHORIZED', 'غير مسجل الدخول', 401))
  }
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId)
  if (!user || user.role !== 'admin') {
    return next(new AppError('FORBIDDEN', 'ليس لديك صلاحية للوصول لهذه الصفحة', 403))
  }
  next()
}