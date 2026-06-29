import { NavLink, Outlet, useParams, useNavigate } from 'react-router-dom'
import { useStore, selectClass } from '../store/useStore.js'

export default function ClassLayout() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const cls = useStore(selectClass(classId))

  if (!cls) {
    return (
      <div className="shell">
        <p className="empty-title" style={{ marginTop: '3rem' }}>
          That class doesn’t exist.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/')} style={{ marginTop: '1rem' }}>
          ← Back to classes
        </button>
      </div>
    )
  }

  const tabs = [
    { to: 'players', label: 'Players', icon: '👥' },
    { to: 'ranking', label: 'Ranking', icon: '🏆' },
    { to: 'edit', label: 'Edit', icon: '⚙️' },
  ]

  return (
    <div className="shell class-shell">
      <header className="class-head">
        <button className="back-link" onClick={() => navigate('/')}>
          ← Classes
        </button>
        <div className="class-title">
          <span className="class-title-icon" style={{ background: cls.color + '33', color: cls.color }}>
            {cls.icon}
          </span>
          <h1>{cls.name}</h1>
        </div>
        <nav className="tabbar" aria-label="Class views">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <Outlet context={{ cls }} />
    </div>
  )
}
