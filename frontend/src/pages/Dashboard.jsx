import { useState, useEffect } from 'react';
import { FiUsers, FiCamera, FiCheckCircle, FiClock, FiActivity } from 'react-icons/fi';
import { studentAPI, attendanceAPI, sectionAPI } from '../api/client';

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalStudents: 0,
        enrolledStudents: 0,
        totalSections: 0,
        pendingRecords: 0,
        todayRecords: 0,
    });
    const [recentRecords, setRecentRecords] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboard();
    }, []);

    const loadDashboard = async () => {
        try {
            const [studentsRes, sectionsRes, attendanceRes] = await Promise.all([
                studentAPI.list({ limit: 1 }),
                sectionAPI.list(),
                attendanceAPI.list({ limit: 5 }),
            ]);

            const total = studentsRes.data.total || 0;
            const sections = sectionsRes.data;
            const records = attendanceRes.data.records || [];

            // Count enrolled students (with embeddings)
            const enrolledRes = await studentAPI.list({ hasEmbedding: true, limit: 1 });

            const today = new Date().toISOString().split('T')[0];
            const todayRecords = records.filter(
                (r) => r.date && r.date.startsWith(today)
            );

            setStats({
                totalStudents: total,
                enrolledStudents: enrolledRes.data.total || 0,
                totalSections: sections.length,
                pendingRecords: records.filter((r) => r.status === 'pending').length,
                todayRecords: todayRecords.length,
            });
            setRecentRecords(records);
        } catch (err) {
            console.error('Dashboard load error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="loader">
                <div className="spinner" /> Loading dashboard...
            </div>
        );
    }

    return (
        <div className="fade-in">
            <div className="page-header">
                <h2>Dashboard</h2>
                <p>Overview of your attendance system</p>
            </div>

            {/* Stats */}
            <div className="grid grid-4" style={{ marginBottom: '2rem' }}>
                <div className="card stat-card">
                    <FiUsers style={{ fontSize: '1.5rem', color: 'var(--accent-blue)', marginBottom: '0.5rem' }} />
                    <div className="stat-value">{stats.totalStudents}</div>
                    <div className="stat-label">Total Students</div>
                </div>
                <div className="card stat-card">
                    <FiCamera style={{ fontSize: '1.5rem', color: 'var(--accent-green)', marginBottom: '0.5rem' }} />
                    <div className="stat-value">{stats.enrolledStudents}</div>
                    <div className="stat-label">Faces Enrolled</div>
                </div>
                <div className="card stat-card">
                    <FiActivity style={{ fontSize: '1.5rem', color: 'var(--accent-purple)', marginBottom: '0.5rem' }} />
                    <div className="stat-value">{stats.totalSections}</div>
                    <div className="stat-label">Sections</div>
                </div>
                <div className="card stat-card">
                    <FiClock style={{ fontSize: '1.5rem', color: 'var(--accent-amber)', marginBottom: '0.5rem' }} />
                    <div className="stat-value">{stats.pendingRecords}</div>
                    <div className="stat-label">Pending Approval</div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">Recent Attendance Records</h3>
                </div>
                {recentRecords.length === 0 ? (
                    <div className="empty-state">
                        <FiCheckCircle />
                        <h3>No records yet</h3>
                        <p>Capture your first attendance to see records here.</p>
                    </div>
                ) : (
                    <div className="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Sections</th>
                                    <th>Present</th>
                                    <th>Detected</th>
                                    <th>Status</th>
                                    <th>Teacher</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentRecords.map((r) => (
                                    <tr key={r._id}>
                                        <td>{new Date(r.date).toLocaleDateString()}</td>
                                        <td>{r.sections?.map((s) => s.name).join(', ') || '—'}</td>
                                        <td>{r.presentStudents?.length || 0}</td>
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
                )}
            </div>
        </div>
    );
}
