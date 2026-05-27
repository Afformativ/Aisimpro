import { Link, useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  Package,
  FileText,
  Shield,
  ClipboardList,
  Network,
  LogOut,
  User,
  ChevronDown,
  UserCog,
  Pickaxe,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/parties', label: 'Parties', icon: Users },
  { path: '/facilities', label: 'Facilities', icon: Building2 },
  { path: '/batches', label: 'Batches', icon: Package },
  { path: '/traceability', label: 'On-Chain', icon: Pickaxe },
  { path: '/documents', label: 'Documents', icon: FileText },
  { path: '/verify', label: 'Verify', icon: Shield },
  { path: '/audit', label: 'Audit Log', icon: ClipboardList },
  { path: '/network', label: 'Network', icon: Network },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, logout, hasAnyRole } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };

    if (profileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileOpen]);

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
          {user && (
            <div className="user-info" ref={dropdownRef}>
              <button 
                className="profile-trigger"
                onClick={() => setProfileOpen(!profileOpen)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <div className="user-avatar">
                    {user.firstName?.[0] || user.email[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div className="user-name">
                      {user.firstName || user.email.split('@')[0]}
                    </div>
                    <div className="user-role-text">
                      {user.roles[0]}
                    </div>
                  </div>
                </div>
                <ChevronDown size={16} style={{ 
                  transition: 'transform 0.2s',
                  transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)'
                }} />
              </button>

              {profileOpen && (
                <div className="profile-dropdown">
                  <Link to="/profile" className="profile-menu-item" onClick={() => setProfileOpen(false)}>
                    <User size={16} />
                    <span>My Profile</span>
                  </Link>
                  {hasAnyRole('ADMIN', 'SUPERADMIN') && (
                    <Link to="/users" className="profile-menu-item" onClick={() => setProfileOpen(false)}>
                      <UserCog size={16} />
                      <span>Manage Users</span>
                    </Link>
                  )}
                  <button className="profile-menu-item" onClick={logout}>
                    <LogOut size={16} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          )}
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
