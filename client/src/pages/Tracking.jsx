import { useEffect, useState, useCallback } from 'react';
import { trackingApi, reportsApi } from '../api.js';

export default function Tracking({ user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ id: '', status: 'Employed', company: '', title: '' });

  const load = useCallback(() => {
    trackingApi.summary().then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  // When data arrives and the current user is an alumnus, preselect their record.
  useEffect(() => {
    if (!data || !data.alumni || !data.alumni.length) return;
    if (user.role === 'alumni') {
      const mine = data.alumni.find(
        (a) => a.name.toLowerCase() === user.name.toLowerCase() || (user.studentId && a.studentId === user.studentId)
      );
      if (mine) setForm((f) => ({ ...f, id: String(mine.id) }));
    } else if (!form.id) {
      setForm((f) => ({ ...f, id: String(data.alumni[0].id) }));
    }
  }, [data, user, form.id]);

  const canUpdate = ['admin', 'registrar'].includes(user.role) || user.role === 'alumni';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await trackingApi.updateEmployment(Number(form.id), {
        status: form.status,
        company: form.company,
        title: form.title
      });
      setNotice(`Employment record updated for graduate #${form.id}.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadTracer = async () => {
    setError('');
    try {
      await reportsApi.downloadTracerStudy();
      setNotice('CHED Tracer Study report downloaded (CSV).');
    } catch (err) {
      setError(err.message);
    }
  };

  const s = data ? data.summary : null;
  const distribution = [
    { label: 'Employed', value: s ? s.employed : 0, cls: 'status-Employed' },
    { label: 'Freelance', value: s ? s.freelance : 0, cls: 'status-Freelance' },
    { label: 'Unemployed', value: s ? s.unemployed : 0, cls: 'status-Unemployed' }
  ];

  const target = (data && data.alumni ? data.alumni : []).find((a) => String(a.id) === String(form.id));

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Graduate Tracking</h2>
          <p className="sub">Employment outcomes, profile freshness, and CHED tracer study compliance.</p>
        </div>
        <button className="btn btn-secondary" onClick={downloadTracer}>
          <i className="fa-solid fa-graduation-cap" /> CHED Tracer Study (CSV)
        </button>
      </div>

      {error && <div className="message message-error">{error}</div>}
      {notice && <div className="message message-success">{notice}</div>}
      {!data && !error && <div className="loader">Loading tracking data…</div>}
{s && (
        <>
          <div className="grid grid-4">
            <div className="stat-card"><div className="label">Employment Rate</div><div className="value">{s.employmentRate}%</div></div>
            <div className="stat-card"><div className="label">Field Alignment</div><div className="value">{s.fieldAlignment}%</div></div>
            <div className="stat-card"><div className="label">Profile Freshness</div><div className="value">{s.freshness}%</div></div>
            <div className="stat-card"><div className="label">Stale Profiles</div><div className="value">{s.staleCount}</div><div className="meta">need a 6-month update</div></div>
          </div>

          <div className="card mt">
            <h3 style={{ marginTop: 0 }}>Employment Distribution</h3>
            <div className="grid grid-3">
              {distribution.map((d) => (
                <div key={d.label} className="stat-card">
                  <div className="value">{d.value}</div>
                  <div className="label"><span className={`status-pill ${d.cls}`}>{d.label}</span></div>
                </div>
              ))}
            </div>
          </div>

          {canUpdate && (
            <div className="card mt">
              <h3 style={{ marginTop: 0 }}>Update Graduate Record</h3>
              <form onSubmit={submit} className="grid grid-3">
                <div className="field">
                  <label>Alumnus</label>
                  <select
                    value={form.id}
                    onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                    disabled={user.role === 'alumni'}
                  >
                    {(data.alumni || []).map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.batch})</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Employment Status</label>
                  <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                    <option>Employed</option>
                    <option>Unemployed</option>
                    <option>Freelance</option>
                    <option>Further Studies</option>
                  </select>
                </div>
                {form.status === 'Employed' && (
                  <>
                    <div className="field">
                      <label>Company</label>
                      <input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
                    </div>
                    <div className="field">
                      <label>Job Title</label>
                      <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                    </div>
                  </>
                )}
                <div className="flex" style={{ alignItems: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={busy}>
                    {busy ? 'Saving…' : 'Save & Update'}
                  </button>
                </div>
              </form>
              {target && (
                <p className="sub" style={{ marginBottom: 0 }}>
                  Current: <b>{target.status}</b>
                  {target.company ? ` · ${target.company}` : ''}
                  {target.title ? ` · ${target.title}` : ''} · last updated {target.lastUpdated || 'never'}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}