import { useEffect, useState, useCallback } from 'react';
import { transcriptApi } from '../api.js';

const STATUS_STYLE = {
  Pending: 'status-Pending',
  Approved: 'status-Approved',
  Rejected: 'status-Rejected',
  Released: 'status-Released'
};

export default function Transcripts({ user }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canProcess = ['admin', 'registrar'].includes(user.role);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ purpose: '', type: 'Transcript of Records', contact: user.contact || '' });

  const load = useCallback(() => {
    setLoading(true);
    transcriptApi
      .list()
      .then((res) => setRows(res.requests))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await transcriptApi.create({
        name: user.name,
        email: user.email || '',
        contact: form.contact,
        purpose: form.purpose,
        type: form.type
      });
      setNotice('Request submitted. Status will be updated by the Registrar.');
      setShowForm(false);
      setForm({ purpose: '', type: 'Transcript of Records', contact: user.contact || '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const setStatus = async (id, status) => {
    setError('');
    try {
      await transcriptApi.setStatus(id, status);
      setNotice(`Request #${id} marked as ${status}.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Transcript Requests</h2>
          <p className="sub">Document request tracking and registrar workflow.</p>
        </div>
        {!canProcess && (
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowForm((v) => !v)}>
            <i className="fa-solid fa-file-circle-plus" /> Request Document
          </button>
        )}
      </div>

      {error && <div className="message message-error">{error}</div>}
      {notice && <div className="message message-success">{notice}</div>}

      {showForm && (
        <div className="card md">
          <h3 style={{ marginTop: 0 }}>New Document Request</h3>
          <form onSubmit={submit} className="grid grid-3">
            <div className="field">
              <label>Purpose *</label>
              <input value={form.purpose} onChange={set('purpose')} placeholder="e.g. Employment, PRC Board Exam…" required />
            </div>
            <div className="field">
              <label>Document Type</label>
              <select value={form.type} onChange={set('type')}>
                <option>Transcript of Records</option>
                <option>Certificate of Graduation</option>
                <option>Diploma Copy</option>
              </select>
            </div>
            <div className="field">
              <label>Contact Number</label>
              <input value={form.contact} onChange={set('contact')} placeholder="+63 917 000 0000" />
            </div>
            <div className="flex" style={{ alignItems: 'flex-end' }}>
              <button type="submit" className="btn btn-success">Submit Request</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading && <div className="loader">Loading requests…</div>}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Requester</th>
              <th>Date</th>
              <th>Purpose</th>
              <th>Status</th>
              {canProcess && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 700 }}>{r.name}<div style={{ fontSize: 10.5, color: '#64748b' }}>{r.type}</div></td>
                <td>{r.date}</td>
                <td>{r.purpose || 'Official Record'}</td>
                <td><span className={`status-pill ${STATUS_STYLE[r.status] || 'status-Pending'}`}>{r.status}</span></td>
                {canProcess && (
                  <td>
                    <div className="flex">
                      {r.status === 'Pending' && (
                        <>
                          <button className="btn btn-success btn-sm" onClick={() => setStatus(r.id, 'Approved')}>Approve</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setStatus(r.id, 'Rejected')}>Reject</button>
                        </>
                      )}
                      {r.status === 'Approved' && (
                        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setStatus(r.id, 'Released')}>
                          Mark Released
                        </button>
                      )}
                      {r.status !== 'Pending' && r.status !== 'Approved' && <span style={{ fontSize: 11, color: '#64748b' }}>—</span>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!loading && !rows.length && <tr><td colSpan="5" className="empty">No transcript requests yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}