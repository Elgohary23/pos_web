import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

function suggestedFileName() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `pos-backup-${stamp}.sqlite`
}

export default function BackupPage() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [status, setStatus] = useState(null)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    api
      .get('/api/backup/status')
      .then(setStatus)
      .catch(() => {})
  }, [])

  const takeBackup = async () => {
    setError('')
    setSuccess('')

    let handle = null
    if (window.showSaveFilePicker) {
      try {
        handle = await window.showSaveFilePicker({ suggestedName: suggestedFileName() })
      } catch (err) {
        if (err?.name === 'AbortError') return
        handle = null
      }
    }

    setBusy(true)
    try {
      const { blob, filename } = await api.download('/api/backup/download')
      if (handle) {
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }
      setSuccess('تم إنشاء النسخة الاحتياطية وحفظها بنجاح')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const doRestore = async () => {
    setConfirmRestore(false)
    if (!file) {
      setError('اختر ملف النسخة الاحتياطية أولًا')
      return
    }
    setRestoring(true)
    setError('')
    setSuccess('')
    try {
      const form = new FormData()
      form.append('file', file)
      await api.upload('/api/backup/restore', 'POST', form)
      setSuccess('تمت استعادة النسخة الاحتياطية. سيتم تسجيل الخروج الآن...')
      setTimeout(async () => {
        await logout()
        navigate('/login', { replace: true })
      }, 1500)
    } catch (err) {
      setError(err.message)
      setRestoring(false)
    }
  }

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>النسخ الاحتياطي والاستعادة</h1>
      </div>

      {error && <div className="error-box backup-alert">{error}</div>}
      {success && <div className="success-box backup-alert">{success}</div>}

      {status && !status.hasData && (
        <div className="backup-welcome">
          <h2>يبدو أن قاعدة البيانات فارغة</h2>
          <p>
            إذا كان لديك نسخة احتياطية سابقة، يمكنك استعادتها الآن وسيتم استخدام بياناتها
            مباشرة. هذا هو الوضع المناسب عند تشغيل البرنامج لأول مرة.
          </p>
        </div>
      )}

      <div className="backup-grid">
        <section className="backup-card">
          <h2 className="invoice-card-title">إنشاء نسخة احتياطية</h2>
          <p className="muted">
            أنشئ نسخة كاملة من قاعدة بيانات المنتجات والفواتير والمستخدمين، ثم اختر مكان حفظها
            على جهازك.
          </p>
          {status && (
            <div className="backup-stats">
              <span>المنتجات: {status.counts.products}</span>
              <span>فواتير البيع: {status.counts.sales}</span>
              <span>فواتير التوريد: {status.counts.supply}</span>
            </div>
          )}
          <button type="button" className="btn-primary" onClick={takeBackup} disabled={busy || restoring}>
            {busy ? 'جارٍ تجهيز النسخة...' : '⬇ حفظ نسخة احتياطية'}
          </button>
        </section>

        <section className="backup-card backup-card-danger">
          <h2 className="invoice-card-title">استعادة نسخة احتياطية</h2>
          <p className="muted">
            اختر ملف نسخة احتياطية (بصيغة <code>.sqlite</code> أو <code>.db</code> أو{' '}
            <code>.sql</code>). سيتم استبدال البيانات الحالية بالكامل بالبيانات الموجودة في
            الملف.
          </p>

          <div className="field-group">
            <span className="field-label">ملف النسخة الاحتياطية</span>
            <input
              ref={fileRef}
              type="file"
              className="backup-file-input"
              accept=".sqlite,.sqlite3,.db,.sql,application/octet-stream,application/x-sqlite3"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={restoring}
            />
            {file && <span className="muted backup-file-name">تم اختيار: {file.name}</span>}
          </div>

          <button
            type="button"
            className="btn-danger"
            onClick={() => (file ? setConfirmRestore(true) : setError('اختر ملف النسخة الاحتياطية أولًا'))}
            disabled={busy || restoring}
          >
            {restoring ? 'جارٍ الاستعادة...' : '↺ استعادة النسخة'}
          </button>
        </section>
      </div>

      {confirmRestore && (
        <ConfirmDialog
          title="تأكيد الاستعادة"
          message="سيتم استبدال كل البيانات الحالية (المنتجات، الفواتير، المستخدمين) ببيانات النسخة الاحتياطية. لا يمكن التراجع عن هذه الخطوة. هل أنت متأكد؟"
          confirmLabel="نعم، استعد البيانات"
          busyLabel="جارٍ الاستعادة..."
          onCancel={() => setConfirmRestore(false)}
          onConfirm={doRestore}
        />
      )}
    </div>
  )
}
