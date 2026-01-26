import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  Package,
  FileText,
  Shield,
  ClipboardList,
  Network,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/parties', label: 'Parties', icon: Users },
  { path: '/facilities', label: 'Facilities', icon: Building2 },
  { path: '/batches', label: 'Batches', icon: Package },
  { path: '/documents', label: 'Documents', icon: FileText },
  { path: '/verify', label: 'Verify', icon: Shield },
  { path: '/audit', label: 'Audit Log', icon: ClipboardList },
  { path: '/network', label: 'Network', icon: Network },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">⛏️</span>
            <span className="logo-text">Gold Provenance</span>
          </div>
          <div className="logo-subtitle">Chain-of-Custody Tracker</div>
        </div>
        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="blockchain-badge">
            <Network size={16} />
            <span>Polygon Amoy</span>
          </div>
        </div>
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
