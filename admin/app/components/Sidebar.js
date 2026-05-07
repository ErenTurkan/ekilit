'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Monitor,
  Users,
  Key,
  KeyRound,
  FileText,
  Upload,
  Megaphone,
  Globe,
  School,
  Settings,
  LogOut,
  Shield,
  ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../lib/store';

const menuItems = [
  { section: 'Genel' },
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/boards', icon: Monitor, label: 'Tahtalar' },
  { section: 'Yönetim' },
  { path: '/teachers', icon: Users, label: 'Öğretmenler' },
  { path: '/usb-keys', icon: Key, label: 'USB Anahtarları' },
  { path: '/reports', icon: FileText, label: 'Raporlar' },
  { section: 'İçerik' },
  { path: '/files', icon: Upload, label: 'Dosya Aktarımı' },
  { path: '/announcements', icon: Megaphone, label: 'Duyurular' },
  { path: '/site-rules', icon: Globe, label: 'Site Kuralları' },
  { section: 'Sistem', role: 'superadmin' },
  { path: '/schools', icon: School, label: 'Okullar', role: 'superadmin' },
  { path: '/licenses', icon: KeyRound, label: 'Lisanslar', role: 'superadmin' },
  { path: '/settings', icon: Settings, label: 'Ayarlar' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'superadmin': return { text: 'Süper Yönetici', class: 'badge-superadmin' };
      case 'principal': return { text: 'Müdür', class: 'badge-principal' };
      case 'teacher': return { text: 'Öğretmen', class: 'badge-teacher' };
      default: return { text: role, class: '' };
    }
  };

  const roleBadge = getRoleBadge(user.role);

  return (
    <motion.aside
      className="sidebar"
      initial={{ x: -260 }}
      animate={{ x: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Shield size={20} />
        </div>
        <span className="sidebar-logo-text">E-Kilit</span>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {menuItems.map((item, idx) => {
          // Section label
          if (item.section) {
            if (item.role && user.role !== item.role) return null;
            return (
              <div key={`section-${idx}`} className="sidebar-section-label">
                {item.section}
              </div>
            );
          }

          // Skip items with role restriction
          if (item.role && user.role !== item.role) return null;

          const isActive = pathname === item.path || pathname?.startsWith(item.path + '/');
          const Icon = item.icon;

          return (
            <Link key={item.path} href={item.path} className={`sidebar-item ${isActive ? 'active' : ''}`}>
              <Icon className="sidebar-item-icon" size={18} />
              <span>{item.label}</span>
              {isActive && (
                <ChevronRight size={14} style={{ marginLeft: 'auto', opacity: 0.5 }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="sidebar-user">
        <div className="sidebar-user-avatar">
          {getInitials(user.full_name)}
        </div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{user.full_name}</div>
          <div className="sidebar-user-role">{roleBadge.text}</div>
        </div>
        <button
          onClick={handleLogout}
          className="btn btn-icon"
          style={{ background: 'var(--bg-glass)', color: 'var(--text-muted)', border: 'none', marginLeft: 'auto' }}
          title="Çıkış Yap"
        >
          <LogOut size={16} />
        </button>
      </div>
    </motion.aside>
  );
}
