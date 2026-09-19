import { useState } from 'react';
import { getStoredUser, clearSession } from './api.js';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import AlumniDatabase from './pages/AlumniDatabase.jsx';
import Transcripts from './pages/Transcripts.jsx';
import Tracking from './pages/Tracking.jsx';
import Events from './pages/Events.jsx';

const VIEWS = ['dashboard', 'alumni', 'transcripts', 'tracking', 'events'];

export default function App() {
  const [user, setUser] = useState(() => getStoredUser());
  const [view, setView] = useState('dashboard');

  if (!user) {
    return (
      <Login
        onAuthed={(u) => {
          setUser(u);
          setView('dashboard');
        }}
      />
    );
  }

  const props = { user, view, setView };
  const active = VIEWS.includes(view) ? view : 'dashboard';

  return (
    <Layout {...props}>
      {active === 'dashboard' && <Dashboard {...props} />}
      {active === 'alumni' && <AlumniDatabase {...props} />}
      {active === 'transcripts' && <Transcripts {...props} />}
      {active === 'tracking' && <Tracking {...props} />}
      {active === 'events' && <Events {...props} />}
    </Layout>
  );
}