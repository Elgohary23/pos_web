import { AuthService } from '../services/authService.js'
import { publicUser } from '../utils/helpers.js'

export const AuthController = {
  me(req, res) {
    const user = AuthService.getSessionUser(req.session.userId)
    res.json({ success: true, data: { user: publicUser(user) }, message: 'تم جلب بيانات الجلسة' })
  },

  login(req, res) {
    const user = AuthService.login(req.body?.username, req.body?.password)
    req.session.userId = user.id
    req.session.username = user.username
    res.json({ success: true, data: { user: publicUser(user) }, message: 'تم تسجيل الدخول بنجاح' })
  },

  logout(req, res, next) {
    req.session.destroy((err) => {
      if (err) return next(err)
      res.json({ success: true, data: null, message: 'تم تسجيل الخروج' })
    })
  },

  changePassword(req, res) {
    const user = AuthService.changePassword(
      req.session.userId,
      req.body?.currentPassword,
      req.body?.newPassword
    )
    res.json({ success: true, data: { user: publicUser(user) }, message: 'تم تغيير كلمة السر بنجاح' })
  },
}