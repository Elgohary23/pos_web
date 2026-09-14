import bcrypt from 'bcryptjs'
import { UserRepository } from '../repositories/userRepository.js'
import { AppError } from '../utils/AppError.js'

export const AuthService = {
  login(username, password) {
    if (!username || !password) {
      throw new AppError('VALIDATION_ERROR', 'اسم المستخدم وكلمة السر مطلوبان')
    }
    const user = UserRepository.findByUsername(String(username))
    if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
      throw new AppError('UNAUTHORIZED', 'اسم المستخدم أو كلمة السر غير صحيحة', 401)
    }
    return user
  },

  getSessionUser(userId) {
    const user = UserRepository.findById(userId)
    if (!user) throw new AppError('UNAUTHORIZED', 'غير مسجل الدخول', 401)
    return user
  },

  changePassword(userId, currentPassword, newPassword) {
    if (!currentPassword || !newPassword) {
      throw new AppError('VALIDATION_ERROR', 'كلمة السر الحالية والجديدة مطلوبتان')
    }
    if (String(newPassword).length < 6) {
      throw new AppError('VALIDATION_ERROR', 'كلمة السر الجديدة يجب أن تكون 6 أحرف على الأقل')
    }
    if (String(newPassword) === String(currentPassword)) {
      throw new AppError('VALIDATION_ERROR', 'كلمة السر الجديدة يجب أن تختلف عن الحالية')
    }
    const user = UserRepository.findById(userId)
    if (!user || !bcrypt.compareSync(String(currentPassword), user.password_hash)) {
      throw new AppError('VALIDATION_ERROR', 'كلمة السر الحالية غير صحيحة')
    }
    const passwordHash = bcrypt.hashSync(String(newPassword), 10)
    return UserRepository.updatePassword(user.id, passwordHash)
  },
}