import { useEffect, useState, useCallback } from 'react';
import { eventsApi } from '../api.js';

export default function Events({ user }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    eventsApi
      .list()
      .then((res) => setRows(res.events))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const toggleRsvp = async (id) => {
    setError('');
    try {
      const res = await eventsApi.rsvp(id);
      const event = res && res.event;
      setNotice(event.registered ? `RSVP confirmed for "${event.title}".` : `RSVP cancelled for "${event.title}".`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Alumni Events</h2>
          <p className="sub">School events, homecomings and batch reunions.</p>
        </div>
      </div>

      {error && <div className="message message-error">{error}</div>}
      {notice && <div className="message message-success">{notice}</div>}
      {loading && <div className="loader">Loading events…</div>}

      <div className="grid grid-3">
        {rows.map((ev) => (
          <div key={ev.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div className="flex" style={{ justifyContent: 'space-between' }}>
                <span className={`badge ${ev.status === 'Completed' ? 'badge-green' : 'badge-amber'}`}>{ev.status}</span>
                <span style={{ fontSize: 11, color: '#64748b' }}><i className="fa-solid fa-users" /> {ev.rsvps}</span>
              </div>
              <h3 style={{ margin: '10px 0 4px', fontSize: 16 }}>{ev.title}</h3>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                <i className="fa-regular fa-clock" /> {ev.date}
              </p>
              <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 12px' }}>
                <i className="fa-solid fa-location-dot" /> {ev.location}
              </p>
            </div>
            {user.role !== 'registrar' && (
              <div>
                <button
                  className={`btn ${ev.registered ? 'btn-secondary' : 'btn-primary'}`}
                  style={{ width: 'auto' }}
                  onClick={() => toggleRsvp(ev.id)}
                >
                  <i className={`fa-solid ${ev.registered ? 'fa-check' : 'fa-calendar-plus'}`} />
                  {ev.registered ? 'Registered' : 'Confirm RSVP'}
                </button>
              </div>
            )}
          </div>
        ))}
        {!loading && !rows.length && <div className="empty">No events yet.</div>}
      </div>
    </div>
  );
}