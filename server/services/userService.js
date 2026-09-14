import bcrypt from 'bcryptjs'
import { UserRepository } from '../repositories/userRepository.js'
import { AppError } from '../utils/AppError.js'

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function validateTime(time) {
  if (time === null || time === undefined || time === '') return null
  if (typeof time !== 'string' || !TIME_RE.test(time)) {
    throw new AppError('VALIDATION_ERROR', 'صيغة الساعة غير صحيحة (يُستخدم تنسيق 24 ساعة)')
  }
  return time
}

export const UserService = {
  findAll() {
    return UserRepository.list()
  },

  createEmployee({ username, password, name, shiftStart, shiftEnd }) {
    const uname = username !== undefined ? String(username).trim() : ''
    const fullName = name !== undefined ? String(name).trim() : ''
    if (!uname) throw new AppError('VALIDATION_ERROR', 'اسم المستخدم مطلوب')
    if (!fullName) throw new AppError('VALIDATION_ERROR', 'الاسم مطلوب')
    if (!password || String(password).length < 6) {
      throw new AppError('VALIDATION_ERROR', 'كلمة السر يجب أن تكون 6 أحرف على الأقل')
    }
    if (UserRepository.findByUsername(uname)) {
      throw new AppError('CONFLICT', 'اسم المستخدم موجود بالفعل', 409)
    }
    const passwordHash = bcrypt.hashSync(String(password), 10)
    return UserRepository.create({
      username: uname,
      passwordHash,
      role: 'employee',
      name: fullName,
      shiftStart: validateTime(shiftStart),
      shiftEnd: validateTime(shiftEnd),
    })
  },

  updateEmployee(id, { username, password, name, shiftStart, shiftEnd }) {
    const user = UserRepository.findById(Number(id))
    if (!user) throw new AppError('NOT_FOUND', 'المستخدم غير موجود', 404)
    if (user.role === 'admin') {
      throw new AppError('FORBIDDEN', 'لا يمكن تعديل حساب الأدمن من هنا', 403)
    }

    const uname = username !== undefined ? String(username).trim() : user.username
    if (!uname) throw new AppError('VALIDATION_ERROR', 'اسم المستخدم مطلوب')
    if (uname !== user.username && UserRepository.findByUsername(uname)) {
      throw new AppError('CONFLICT', 'اسم المستخدم موجود بالفعل', 409)
    }
    if (password && String(password).length < 6) {
      throw new AppError('VALIDATION_ERROR', 'كلمة السر يجب أن تكون 6 أحرف على الأقل')
    }

    const passwordHash = password ? bcrypt.hashSync(String(password), 10) : undefined
    return UserRepository.update(user.id, {
      username: uname,
      name: name !== undefined ? String(name).trim() : user.name,
      shiftStart: validateTime(shiftStart !== undefined ? shiftStart : user.shift_start),
      shiftEnd: validateTime(shiftEnd !== undefined ? shiftEnd : user.shift_end),
      passwordHash,
    })
  },

  deleteEmployee(id, actorId) {
    const user = UserRepository.findById(Number(id))
    if (!user) throw new AppError('NOT_FOUND', 'المستخدم غير موجود', 404)
    if (user.role === 'admin') {
      throw new AppError('FORBIDDEN', 'لا يمكن حذف حساب الأدمن', 403)
    }
    if (Number(id) === Number(actorId)) {
      throw new AppError('VALIDATION_ERROR', 'لا يمكنك حذف حسابك الحالي')
    }
    UserRepository.delete(user.id)
    return user
  },
}