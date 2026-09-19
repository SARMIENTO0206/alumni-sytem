import { useEffect, useState, useCallback } from 'react';
import { alumniApi } from '../api.js';

const EMPTY = { name: '', batch: '', program: '', status: 'Employed', company: '', title: '', contact: '', studentId: '' };

/** Maps an employment status to its CSS pill class (e.g. "Further Studies" -> status-FurtherStudies). */
const statusClass = (status) => `status-${String(status || '').replace(/\s+/g, '')}`;

export default function AlumniDatabase({ user }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null -> hidden, false -> create, object -> edit
  const [form, setForm] = useState(EMPTY);
  const [notice, setNotice] = useState('');
  const canEdit = user.role === 'admin';

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const load = useCallback(() => {
    setLoading(true);
    alumniApi
      .list()
      .then((res) => setRows(res.alumni))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const startCreate = () => {
    setForm(EMPTY);
    setEditing(false);
  };

  const startEdit = (row) => {
    setForm({
      name: row.name, batch: row.batch, program: row.program, status: row.status,
      company: row.company, title: row.title, contact: row.contact, studentId: row.studentId || ''
    });
    setEditing(row);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      if (editing === false) {
        await alumniApi.create(form);
        setNotice(`Alumnus "${form.name}" added.`);
      } else if (editing) {
        await alumniApi.update(editing.id, form);
        setNotice(`Alumnus "${form.name}" updated.`);
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete record for ${row.name}?`)) return;
    setError('');
    try {
      await alumniApi.remove(row.id);
      setNotice(`Record for ${row.name} deleted.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Alumni Database</h2>
          <p className="sub">Registered alumni records and employment outcomes.</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={startCreate}>
            <i className="fa-solid fa-plus" /> Add Alumnus
          </button>
        )}
      </div>

      {error && <div className="message message-error">{error}</div>}
      {notice && <div className="message message-success">{notice}</div>}
      {loading && <div className="loader">Loading records…</div>}

      {editing !== null && (
        <div className="card md">
          <h3 style={{ marginTop: 0 }}>
            {editing === false ? 'Add New Alumnus' : `Edit — ${form.name}`}
          </h3>
          <form onSubmit={submit} className="grid grid-3">
            <div className="field">
              <label>Full Name *</label>
              <input value={form.name} onChange={set('name')} required />
            </div>
            <div className="field">
              <label>Batch Year</label>
              <input value={form.batch} onChange={set('batch')} placeholder="e.g. 2024" />
            </div>
            <div className="field">
              <label>Program</label>
              <input value={form.program} onChange={set('program')} placeholder="e.g. BS Information Technology" />
            </div>
            <div className="field">
              <label>Employment Status</label>
              <select value={form.status} onChange={set('status')}>
                <option>Employed</option>
                <option>Unemployed</option>
                <option>Freelance</option>
                <option>Further Studies</option>
              </select>
            </div>
            <div className="field">
              <label>Company</label>
              <input value={form.company} onChange={set('company')} />
            </div>
            <div className="field">
              <label>Job Title</label>
              <input value={form.title} onChange={set('title')} />
            </div>
            <div className="field">
              <label>Contact</label>
              <input value={form.contact} onChange={set('contact')} placeholder="+63 917 000 0000" />
            </div>
            <div className="field">
              <label>Student ID</label>
              <input value={form.studentId} onChange={set('studentId')} placeholder="SAA-2024-0000" />
            </div>
            <div className="flex" style={{ alignItems: 'flex-end' }}>
              <button type="submit" className="btn btn-success">{editing === false ? 'Create Record' : 'Save Changes'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
<div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name / Student ID</th>
              <th>Batch</th>
              <th>Program</th>
              <th>Status</th>
              <th>Employer</th>
              {(canEdit || user.role === 'registrar') && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                  <div style={{ fontSize: 10.5, color: '#64748b', fontFamily: 'monospace' }}>
                    {r.studentId || `SAA-${r.batch}-${String(r.id).padStart(4, '0')}`}
                  </div>
                </td>
                <td>{r.batch}</td>
                <td>{r.program}</td>
                <td><span className={`status-pill ${statusClass(r.status)}`}>{r.status}</span></td>
                <td>{r.company || '—'}</td>
                {(canEdit || user.role === 'registrar') && (
                  <td>
                    <div className="flex">
                      {canEdit && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => startEdit(r)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => remove(r)}>Delete</button>
                        </>
                      )}
                      {!canEdit && <span style={{ fontSize: 11, color: '#64748b' }}>Read-only</span>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!loading && !rows.length && (
              <tr><td colSpan="6" className="empty">No alumni records yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}