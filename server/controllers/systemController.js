import { SystemService } from '../services/systemService.js'

export const SystemController = {
  info(req, res) {
    res.json({ success: true, data: SystemService.info(), message: 'بيانات النظام' })
  },
}