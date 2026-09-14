import { useEffect, useState } from 'react'
import { api } from '../api.js'
import EmployeeFormModal from '../components/EmployeeFormModal.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { formatShift12 } from '../utils/time.js'

export default function Employees() {
  const [users, setUsers] = useState(null)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [notice, setNotice] = useState('')

  const loadUsers = async () => {
    setError('')
    try {
      const data = await api.get('/api/users')
      setUsers(data.users)
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (user) => {
    setEditing(user)
    setModalOpen(true)
  }

  const handleSave = async (payload) => {
    if (editing) {
      await api.put(`/api/users/${editing.id}`, payload)
    } else {
      await api.post('/api/users', payload)
    }
    setModalOpen(false)
    await loadUsers()
  }

  const handleDelete = async () => {
    await api.delete(`/api/users/${deleting.id}`)
    setDeleting(null)
    await loadUsers()
  }

  const employees = users?.filter((u) => u.role === 'employee') ?? []

  return (
    <div className="page">
      <div className="page-header">
        <h1>إدارة الموظفين</h1>
        <button className="btn-primary" onClick={openCreate}>
          + إضافة موظف
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {notice && <div className="success-box">{notice}</div>}

      {users === null ? (
        <div className="page-placeholder">جارٍ التحميل...</div>
      ) : employees.length === 0 ? (
        <div className="page-placeholder">
          <p>لا يوجد موظفون بعد. اضغط «إضافة موظف» للبدء.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>اسم المستخدم</th>
                <th>بداية الشيفت</th>
                <th>نهاية الشيفت</th>
                <th>تاريخ الإنشاء</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.username}</td>
                  <td>{formatShift12(u.shiftStart)}</td>
                  <td>{formatShift12(u.shiftEnd)}</td>
                  <td>{u.createdAt}</td>
                  <td className="row-actions">
                    <button className="btn-secondary" onClick={() => openEdit(u)}>
                      تعديل
                    </button>
                    <button className="btn-danger" onClick={() => setDeleting(u)}>
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <EmployeeFormModal
          user={editing}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="حذف حساب الموظف"
          message={`هل أنت متأكد من حذف حساب «${deleting.name}»؟ لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="حذف"
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}