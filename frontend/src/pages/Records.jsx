import { useState, useEffect } from 'react';
import { FiFileText, FiCalendar } from 'react-icons/fi';
import { attendanceAPI } from '../api/client';
import { useNavigate } from 'react-router-dom';

export default function Records() {
    const [records, setRecords] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [dateFilter, setDateFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        loadRecords();
    }, [page, dateFilter, statusFilter]);

    const loadRecords = async () => {
        setLoading(true);
        try {
            const params = { page, limit: 15 };
            if (dateFilter) params.date = dateFilter;
            if (statusFilter) params.status = statusFilter;
            const res = await attendanceAPI.list(params);
            setRecords(res.data.records);
            setTotal(res.data.total);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2><FiFileText style={{ marginRight: 8 }} /> Attendance Records</h2>
                <p>View and manage all attendance records</p>
            </div>

            {/* Filters */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
                    <div className="form-group" style={{ minWidth: 180, marginBottom: 0 }}>
                        <label className="form-label"><FiCalendar /> Date</label>
                        <input
                            className="form-input"
                            type="date"
                            value={dateFilter}
                            onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
                        />
                    </div>
                    <div className="form-group" style={{ minWidth: 150, marginBottom: 0 }}>
                        <label className="form-label">Status</label>
                        <select
                            className="form-select"
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                        >
                            <option value="">All</option>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>
                    {(dateFilter || statusFilter) && (
                        <button className="btn btn-sm btn-outline" onClick={() => { setDateFilter(''); setStatusFilter(''); }}>
                            Clear Filters
                        </button>
                    )}
                </div>
            </div>

            <div className="card">
                {loading ? (
                    <div className="loader"><div className="spinner" /> Loading...</div>
                ) : records.length === 0 ? (
                    <div className="empty-state">
                        <FiFileText />
                        <h3>No records found</h3>
                        <p>Attendance records will appear here after processing.</p>
                    </div>
                ) : (
                    <>
                        <div className="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Sections</th>
                                        <th>Present</th>
                                        <th>Low Conf.</th>
                                        <th>Unknown</th>
                                        <th>Total Faces</th>
                                        <th>Status</th>
                                        <th>Teacher</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {records.map((r) => (
                                        <tr key={r._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/attendance/${r._id}`)}>
                                            <td>{new Date(r.date).toLocaleDateString()}</td>
                                            <td>{r.sections?.map((s) => s.name).join(', ') || '—'}</td>
                                            <td style={{ fontWeight: 600, color: 'var(--accent-green)' }}>
                                                {r.presentStudents?.length || 0}
                                            </td>
                                            <td style={{ color: 'var(--accent-amber)' }}>
                                                {r.lowConfidenceMatches?.length || 0}
                                            </td>
                                            <td style={{ color: 'var(--accent-red)' }}>{r.unknownFaces || 0}</td>
                                            <td>{r.totalDetected || 0}</td>
                                            <td>
                                                <span className={`badge badge-${r.status === 'approved' ? 'success' : r.status === 'pending' ? 'warning' : 'danger'}`}>
                                                    {r.status}
                                                </span>
                                            </td>
                                            <td>{r.teacher?.name || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
                            <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                            <span style={{ padding: '0.4rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Page {page} of {Math.ceil(total / 15) || 1}
                            </span>
                            <button className="btn btn-sm btn-outline" disabled={page >= Math.ceil(total / 15)} onClick={() => setPage(page + 1)}>Next</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
