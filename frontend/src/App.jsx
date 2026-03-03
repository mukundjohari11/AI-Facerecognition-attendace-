import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import {
  FiHome, FiCamera, FiUsers, FiGrid, FiFileText,
  FiUserPlus, FiLogOut, FiMenu
} from 'react-icons/fi';
import { AuthProvider, useAuth } from './context/AuthContext';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import StudentRegister from './pages/StudentRegister';
import AttendanceCapture from './pages/AttendanceCapture';
import Students from './pages/Students';
import Sections from './pages/Sections';
import Records from './pages/Records';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loader"><div className="spinner" /> Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Sidebar() {
  const { user, logout } = useAuth();

  const links = [
    { to: '/', icon: <FiHome />, label: 'Dashboard' },
    { to: '/capture', icon: <FiCamera />, label: 'Capture Attendance' },
    { to: '/students', icon: <FiUsers />, label: 'Students' },
    { to: '/sections', icon: <FiGrid />, label: 'Sections' },
    { to: '/records', icon: <FiFileText />, label: 'Records' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>📸 AttendAI</h1>
        <p>Face Recognition Attendance</p>
      </div>
      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            {link.icon} {link.label}
          </NavLink>
        ))}

        <div style={{ borderTop: '1px solid var(--border-color)', margin: '1rem 0' }} />

        <a href="/register" target="_blank" className="nav-link" style={{ color: 'var(--accent-green)' }}>
          <FiUserPlus /> Student Registration
        </a>
      </nav>

      <div style={{ padding: '0 0.75rem', marginTop: 'auto' }}>
        <div style={{
          padding: '0.75rem 1rem',
          background: 'var(--bg-glass)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '0.5rem'
        }}>
          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{user?.name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {user?.role} • {user?.email}
          </div>
        </div>
        <button className="nav-link" onClick={logout} style={{ color: 'var(--accent-red)' }}>
          <FiLogOut /> Sign Out
        </button>
      </div>
    </aside>
  );
}

function AppLayout() {
  const location = useLocation();
  const isPublicRoute = ['/login', '/register'].includes(location.pathname);
  const { user } = useAuth();

  if (isPublicRoute) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<StudentRegister />} />
      </Routes>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/capture" element={<ProtectedRoute><AttendanceCapture /></ProtectedRoute>} />
          <Route path="/students" element={<ProtectedRoute><Students /></ProtectedRoute>} />
          <Route path="/sections" element={<ProtectedRoute><Sections /></ProtectedRoute>} />
          <Route path="/records" element={<ProtectedRoute><Records /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </AuthProvider>
  );
}
