import { useState, useEffect } from 'react';
import { FiPlus, FiEdit2, FiTrash2, FiGrid } from 'react-icons/fi';
import { sectionAPI } from '../api/client';

export default function Sections() {
    const [sections, setSections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ name: '', year: '', department: '' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        loadSections();
    }, []);

    const loadSections = async () => {
        try {
            const res = await sectionAPI.list();
            setSections(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const data = { ...form, year: parseInt(form.year) };
            if (editId) {
                await sectionAPI.update(editId, data);
                setSuccess('Section updated');
            } else {
                await sectionAPI.create(data);
                setSuccess('Section created');
            }
            setShowForm(false);
            setEditId(null);
            setForm({ name: '', year: '', department: '' });
            loadSections();
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed');
        }
    };

    const handleEdit = (s) => {
        setForm({ name: s.name, year: s.year.toString(), department: s.department });
        setEditId(s._id);
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this section?')) return;
        try {
            await sectionAPI.delete(id);
            loadSections();
        } catch (err) {
            setError(err.response?.data?.error || 'Delete failed');
        }
    };

    return (
        <div className="fade-in">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                    <h2><FiGrid style={{ marginRight: 8 }} /> Sections</h2>
                    <p>Manage class sections and departments</p>
                </div>
                <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '', year: '', department: '' }); }}>
                    <FiPlus /> Add Section
                </button>
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {showForm && (
                <div className="card fade-in" style={{ marginBottom: '1.5rem', maxWidth: 500 }}>
                    <h3 className="card-title" style={{ marginBottom: '1rem' }}>
                        {editId ? 'Edit Section' : 'New Section'}
                    </h3>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label">Section Name *</label>
                            <input
                                className="form-input"
                                placeholder="e.g. CSE-A"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Department *</label>
                            <input
                                className="form-input"
                                placeholder="e.g. Computer Science"
                                value={form.department}
                                onChange={(e) => setForm({ ...form, department: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Year *</label>
                            <select
                                className="form-select"
                                value={form.year}
                                onChange={(e) => setForm({ ...form, year: e.target.value })}
                                required
                            >
                                <option value="">Select year</option>
                                <option value="1">1st Year</option>
                                <option value="2">2nd Year</option>
                                <option value="3">3rd Year</option>
                                <option value="4">4th Year</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn btn-primary" type="submit">
                                {editId ? 'Update' : 'Create'}
                            </button>
                            <button className="btn btn-outline" type="button" onClick={() => setShowForm(false)}>
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="card">
                {loading ? (
                    <div className="loader"><div className="spinner" /> Loading...</div>
                ) : sections.length === 0 ? (
                    <div className="empty-state">
                        <FiGrid />
                        <h3>No sections yet</h3>
                        <p>Create your first section to start enrolling students.</p>
                    </div>
                ) : (
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Department</th>
                                    <th>Year</th>
                                    <th>Students</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sections.map((s) => (
                                    <tr key={s._id}>
                                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                                        <td>{s.department}</td>
                                        <td>Year {s.year}</td>
                                        <td>{s.studentCount || 0}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button className="btn btn-sm btn-outline" onClick={() => handleEdit(s)}>
                                                    <FiEdit2 />
                                                </button>
                                                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(s._id)}>
                                                    <FiTrash2 />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
