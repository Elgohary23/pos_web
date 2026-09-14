import { UserService } from '../services/userService.js'
import { publicUser } from '../utils/helpers.js'

export const UserController = {
  list(req, res) {
    const users = UserService.findAll()
    res.json({ success: true, data: { users: users.map(publicUser) }, message: 'تم جلب المستخدمين' })
  },

  create(req, res) {
    const { username, password, name, shiftStart, shiftEnd } = req.body || {}
    const user = UserService.createEmployee({ username, password, name, shiftStart, shiftEnd })
    res.json({ success: true, data: { user: publicUser(user) }, message: 'تم إنشاء حساب الموظف بنجاح' })
  },

  update(req, res) {
    const { username, password, name, shiftStart, shiftEnd } = req.body || {}
    const user = UserService.updateEmployee(req.params.id, {
      username,
      password,
      name,
      shiftStart,
      shiftEnd,
    })
    res.json({ success: true, data: { user: publicUser(user) }, message: 'تم تعديل البيانات بنجاح' })
  },

  remove(req, res) {
    UserService.deleteEmployee(req.params.id, req.session.userId)
    res.json({ success: true, data: null, message: 'تم حذف الحساب' })
  },
}