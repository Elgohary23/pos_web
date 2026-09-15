import { AuditRepository } from '../repositories/auditRepository.js'

export const AuditService = {
  log(payload) {
    AuditRepository.log(payload)
  },
}