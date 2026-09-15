import db from '../database/db.js'

export const AuditRepository = {
  log({ userId, action, entity = null, entityId = null, details = null }) {
    const payload = details === null || details === undefined ? null : JSON.stringify(details)
    db.prepare(
      'INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)'
    ).run(userId ?? null, action, entity, entityId, payload)
  },
}