import { useEffect, useState } from 'react';
import { reportsApi } from '../api.js';

export default function Dashboard({ user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    reportsApi.summary().then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="gradient-card md">
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <span className="brand-location">Caritas et Scientia</span>
            <h2>Welcome back, {user.name}!</h2>
            <p>Alumni Management System overview · signed in as {user.role}.</p>
          </div>
          <span className="badge badge-green">
            <i className="fa-solid fa-circle-check" /> Live data
          </span>
        </div>
      </div>

      {error && <div className="message message-error">{error}</div>}
      {!data && !error && <div className="loader">Loading dashboard…</div>}

      {data && (
        <>
          <div className="grid grid-4">
            <div className="stat-card">
              <div className="label">Total Alumni</div>
              <div className="value">{data.alumni.total}</div>
              <div className="meta">{data.alumni.employed} employed</div>
            </div>
            <div className="stat-card">
              <div className="label">Transcript Requests</div>
              <div className="value">{data.transcriptRequests.total}</div>
              <div className="meta">{data.transcriptRequests.pending} pending</div>
            </div>
            <div className="stat-card">
              <div className="label">Placements Logged</div>
              <div className="value">{data.placements}</div>
              <div className="meta">{data.reprints} reprint requests</div>
            </div>
            <div className="stat-card">
              <div className="label">Events &amp; Reunions</div>
              <div className="value">{data.events + data.reunions}</div>
              <div className="meta">{data.notifications} notifications logged</div>
            </div>
          </div>

          <div className="grid grid-3 mt">
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Donation Records</h3>
              <p style={{ fontSize: 26, fontWeight: 800, margin: '6px 0' }}>{data.donations}</p>
              <p className="sub" style={{ margin: 0 }}>recorded contributions</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Newsletters</h3>
              <p style={{ fontSize: 26, fontWeight: 800, margin: '6px 0' }}>{data.newsletters}</p>
              <p className="sub" style={{ margin: 0 }}>published editions</p>
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Feedback</h3>
              <p style={{ fontSize: 26, fontWeight: 800, margin: '6px 0' }}>{data.feedback}</p>
              <p className="sub" style={{ margin: 0 }}>survey responses collected</p>
            </div>
          </div>
        </>
      )}

      <p className="footer-note">
        St. Agnes Academy of Caloocan — Alumni Management System
      </p>
    </div>
  );
}