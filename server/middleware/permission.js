import db from '../database/db.js'
import { AppError } from '../utils/AppError.js'
import { AuditRepository } from '../repositories/auditRepository.js'

const rolePermissions = {
  admin: ['CREATE_SUPPLY_INVOICE', 'CREATE_SALE_INVOICE'],
  employee: ['CREATE_SUPPLY_INVOICE', 'CREATE_SALE_INVOICE'],
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return next(new AppError('UNAUTHORIZED', 'غير مسجل الدخول', 401))
    }
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.session.userId)
    if (!user) {
      return next(new AppError('UNAUTHORIZED', 'غير مسجل الدخول', 401))
    }
    const granted = rolePermissions[user.role] || []
    if (!granted.includes(permission)) {
      AuditRepository.log({
        userId: user.id,
        action: 'PERMISSION_DENIED',
        entity: 'supply_invoice',
        entityId: null,
        details: { permission },
      })
      return next(new AppError('FORBIDDEN', 'ليس لديك صلاحية لتنفيذ هذا الإجراء', 403))
    }
    next()
  }
}