import { logout } from '../api.js';

const NAV = {
  admin: [
    { label: 'Manage', items: [
      { key: 'dashboard', icon: 'fa-chart-line', text: 'Dashboard' },
      { key: 'alumni', icon: 'fa-users-viewfinder', text: 'Alumni Database' },
      { key: 'transcripts', icon: 'fa-file-invoice', text: 'Transcript Requests' },
      { key: 'tracking', icon: 'fa-chart-pie', text: 'Graduate Tracking' },
      { key: 'events', icon: 'fa-calendar-check', text: 'Alumni Events' }
    ]}
  ],
  registrar: [
    { label: 'Registrar', items: [
      { key: 'dashboard', icon: 'fa-chart-line', text: 'Dashboard' },
      { key: 'transcripts', icon: 'fa-file-invoice', text: 'Transcript Requests' },
      { key: 'tracking', icon: 'fa-chart-pie', text: 'Graduate Tracking' },
      { key: 'alumni', icon: 'fa-users-viewfinder', text: 'Alumni Database' },
      { key: 'events', icon: 'fa-calendar-check', text: 'Alumni Events' }
    ]}
  ],
  alumni: [
    { label: 'Alumni', items: [
      { key: 'dashboard', icon: 'fa-chart-line', text: 'Dashboard' },
      { key: 'events', icon: 'fa-calendar-check', text: 'Alumni Events' },
      { key: 'transcripts', icon: 'fa-file-invoice', text: 'Transcript Requests' },
      { key: 'tracking', icon: 'fa-chart-pie', text: 'Graduate Tracking' }
    ]}
  ]
};

export default function Layout({ user, view, setView, children }) {
  const groups = NAV[user.role] || NAV.alumni;

  const handleLogout = async () => {
    await logout();
    window.location.hash = '#/';
    window.location.reload();
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">
            <img src="/logo.jpeg" alt="St. Agnes Academy logo" />
          </div>
          <div>
            <h2>St. Agnes Academy</h2>
            <p>Alumni Management System</p>
          </div>
        </div>

        <nav className="nav">
          {groups.map((group) => (
            <div key={group.label}>
              <div className="av-section">{group.label}</div>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  className={view === item.key ? 'active' : ''}
                  onClick={() => setView(item.key)}
                >
                  <i className={`fa-solid ${item.icon}`} style={{ width: 18 }} />
                  <span>{item.text}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <button className="logout" onClick={handleLogout}>
          <i className="fa-solid fa-right-from-bracket" /> Sign out ({user.role})
        </button>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}