import bcrypt from 'bcryptjs'

export function isDefaultPassword(passwordHash) {
  return bcrypt.compareSync('admin', passwordHash)
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    shiftStart: user.shift_start,
    shiftEnd: user.shift_end,
    createdAt: user.created_at,
    isDefaultPassword: isDefaultPassword(user.password_hash),
  }
}