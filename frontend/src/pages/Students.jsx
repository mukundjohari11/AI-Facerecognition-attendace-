import { useState, useEffect } from 'react';
import { FiUsers, FiSearch, FiCheckCircle, FiXCircle } from 'react-icons/fi';
import { studentAPI, sectionAPI } from '../api/client';

export default function Students() {
    const [students, setStudents] = useState([]);
    const [sections, setSections] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [filter, setFilter] = useState({ section: '', hasEmbedding: '' });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        sectionAPI.list().then((res) => setSections(res.data)).catch(() => { });
    }, []);

    useEffect(() => {
        loadStudents();
    }, [page, filter]);

    const loadStudents = async () => {
        setLoading(true);
        try {
            const params = { page, limit: 20 };
            if (filter.section) params.section = filter.section;
            if (filter.hasEmbedding) params.hasEmbedding = filter.hasEmbedding;
            const res = await studentAPI.list(params);
            setStudents(res.data.students);
            setTotal(res.data.total);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const filtered = search
        ? students.filter(
            (s) =>
                s.name.toLowerCase().includes(search.toLowerCase()) ||
                s.rollNumber.toLowerCase().includes(search.toLowerCase())
        )
        : students;

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2><FiUsers style={{ marginRight: 8 }} /> Students</h2>
                <p>{total} students registered</p>
            </div>

            {/* Filters */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'end' }}>
                    <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                        <label className="form-label"><FiSearch /> Search</label>
                        <input
                            className="form-input"
                            placeholder="Search name or roll number..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="form-group" style={{ minWidth: 180, marginBottom: 0 }}>
                        <label className="form-label">Section</label>
                        <select
                            className="form-select"
                            value={filter.section}
                            onChange={(e) => { setFilter({ ...filter, section: e.target.value }); setPage(1); }}
                        >
                            <option value="">All Sections</option>
                            {sections.map((s) => (
                                <option key={s._id} value={s._id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group" style={{ minWidth: 160, marginBottom: 0 }}>
                        <label className="form-label">Enrollment</label>
                        <select
                            className="form-select"
                            value={filter.hasEmbedding}
                            onChange={(e) => { setFilter({ ...filter, hasEmbedding: e.target.value }); setPage(1); }}
                        >
                            <option value="">All</option>
                            <option value="true">Face Enrolled</option>
                            <option value="false">Not Enrolled</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="card">
                {loading ? (
                    <div className="loader"><div className="spinner" /> Loading...</div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">
                        <FiUsers />
                        <h3>No students found</h3>
                        <p>Students will appear here once they register via the registration page.</p>
                    </div>
                ) : (
                    <>
                        <div className="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Roll Number</th>
                                        <th>Section</th>
                                        <th>Face Enrolled</th>
                                        <th>Registered</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((s) => (
                                        <tr key={s._id}>
                                            <td style={{ fontWeight: 500 }}>{s.name}</td>
                                            <td>{s.rollNumber}</td>
                                            <td>
                                                <span className="badge badge-info">
                                                    {s.section?.name || '—'}
                                                </span>
                                            </td>
                                            <td>
                                                {s.hasEmbedding ? (
                                                    <span className="badge badge-success"><FiCheckCircle /> Enrolled</span>
                                                ) : (
                                                    <span className="badge badge-danger"><FiXCircle /> Pending</span>
                                                )}
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                {new Date(s.createdAt).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
                            <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                                Previous
                            </button>
                            <span style={{ padding: '0.4rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                Page {page} of {Math.ceil(total / 20) || 1}
                            </span>
                            <button className="btn btn-sm btn-outline" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(page + 1)}>
                                Next
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
