import { useState } from 'react';
import { login } from '../api.js';

export default function Login({ onAuthed }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fillDemo = (u, p) => {
    setUsername(u);
    setPassword(p);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(username.trim(), password);
      onAuthed(user);
    } catch (err) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand">
          <div className="brand-mark">SAA</div>
          <div>
            <h1>St. Agnes Academy</h1>
            <p className="sub">Alumni Management System</p>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
              autoComplete="username"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <span className="loader">Signing in…</span> : 'Sign In'}
          </button>
        </form>

        <div className="demo-hint">
          Demo accounts:
          <br />
          <button type="button" className="btn btn-secondary btn-sm mt" onClick={() => fillDemo('admin', 'admin123')}>Admin</button>{' '}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fillDemo('alumni', 'alumni123')}>Alumni</button>{' '}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fillDemo('registrar', 'registrar123')}>Registrar</button>
        </div>
      </div>
    </div>
  );
}