import db from '../database/db.js'

export const UserRepository = {
  findById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  },

  findByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username)
  },

  list() {
    return db.prepare('SELECT * FROM users ORDER BY role DESC, id').all()
  },

  create({ username, passwordHash, role, name, shiftStart, shiftEnd }) {
    const result = db
      .prepare(
        `INSERT INTO users (username, password_hash, role, name, shift_start, shift_end)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(username, passwordHash, role, name, shiftStart, shiftEnd)
    return this.findById(result.lastInsertRowid)
  },

  update(id, { username, name, shiftStart, shiftEnd, passwordHash }) {
    const values = { username, name, shift_start: shiftStart, shift_end: shiftEnd }
    if (passwordHash) values.password_hash = passwordHash
    const columns = Object.keys(values)
    const sql = `UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`
    db.prepare(sql).run(...columns.map((c) => values[c]), id)
    return this.findById(id)
  },

  updatePassword(id, passwordHash) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id)
    return this.findById(id)
  },

  delete(id) {
    db.prepare('DELETE FROM users WHERE id = ?').run(id)
  },
}