import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Home() {
  const [info, setInfo] = useState(null)

  useEffect(() => {
    let active = true
    api
      .get('/api/system')
      .then((data) => {
        if (active) setInfo(data)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="page-placeholder">
      <h1>أهلًا بك</h1>
      <p>اختر صفحة من القائمة الجانبية للبدء.</p>
      {info && info.addresses?.length > 0 && (
        <div className="lan-card">
          <h3>الدخول من الموبايل</h3>
          <p>أصل الجهاز والموبايل بنفس الشبكة ثم افتح المتصفح على أحد الروابط:</p>
          <ul>
            {info.addresses.map((ip) => (
              <li key={ip}>
                <a href={`http://${ip}:${info.port}`} target="_blank" rel="noreferrer">
                  http://{ip}:{info.port}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}