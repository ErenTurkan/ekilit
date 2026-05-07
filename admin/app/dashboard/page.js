'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Monitor, Users, Key, FileText, Shield, Activity, Clock, TrendingUp,
  CheckCircle, XCircle, Unlock, Lock as LockIcon
} from 'lucide-react';
import AppLayout from '../components/AppLayout';
import { useAuthStore } from '../lib/store';
import { boardsAPI, reportsAPI, schoolsAPI } from '../lib/api';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } }
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }
};

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [boardsRes, logsRes] = await Promise.all([
        boardsAPI.list({ limit: 100 }),
        reportsAPI.unlockLogs({ limit: 10 })
      ]);

      const boards = boardsRes.data.boards || [];
      const online = boards.filter(b => b.status === 'online' || b.status === 'unlocked').length;
      const locked = boards.filter(b => b.status === 'locked').length;
      const offline = boards.filter(b => b.status === 'offline').length;

      setStats({
        totalBoards: boards.length,
        onlineBoards: online,
        lockedBoards: locked,
        offlineBoards: offline
      });

      setRecentLogs(logsRes.data.logs || []);
    } catch (err) {
      console.error('Dashboard load error:', err);
      // Set demo data on error
      setStats({ totalBoards: 0, onlineBoards: 0, lockedBoards: 0, offlineBoards: 0 });
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Günaydın';
    if (hour < 18) return 'İyi günler';
    return 'İyi akşamlar';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const getMethodLabel = (method) => {
    switch (method) {
      case 'usb': return { label: 'USB Anahtar', icon: Key, color: 'var(--accent-info)' };
      case 'qr': return { label: 'QR Kod', icon: Shield, color: 'var(--accent-secondary)' };
      case 'remote': return { label: 'Uzaktan', icon: Monitor, color: 'var(--accent-primary)' };
      case 'masterkey': return { label: 'Master Key', icon: Shield, color: 'var(--accent-gold)' };
      default: return { label: method, icon: Key, color: 'var(--text-muted)' };
    }
  };

  return (
    <AppLayout>
      <motion.div variants={container} initial="hidden" animate="show">
        {/* Page Header */}
        <motion.div variants={item} className="page-header">
          <h1>{getGreeting()}, {user?.full_name?.split(' ')[0]} 👋</h1>
          <p>E-Kilit Yönetim Paneli — Anlık sistem durumu</p>
        </motion.div>

        {/* Stat Cards */}
        <motion.div variants={item} className="stat-cards">
          <div className="stat-card">
            <div className="stat-card-icon purple">
              <Monitor size={22} />
            </div>
            <div>
              <div className="stat-card-value">{loading ? '—' : stats?.totalBoards}</div>
              <div className="stat-card-label">Toplam Tahta</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-icon green">
              <CheckCircle size={22} />
            </div>
            <div>
              <div className="stat-card-value">{loading ? '—' : stats?.onlineBoards}</div>
              <div className="stat-card-label">Çevrimiçi</div>
              <div className="stat-card-change up">
                <Activity size={12} />
                <span>Aktif</span>
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-icon gold">
              <LockIcon size={22} />
            </div>
            <div>
              <div className="stat-card-value">{loading ? '—' : stats?.lockedBoards}</div>
              <div className="stat-card-label">Kilitli</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-icon red">
              <XCircle size={22} />
            </div>
            <div>
              <div className="stat-card-value">{loading ? '—' : stats?.offlineBoards}</div>
              <div className="stat-card-label">Çevrimdışı</div>
            </div>
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div variants={item} className="table-container">
          <div className="table-header">
            <div>
              <div className="table-header-title">Son Aktiviteler</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Son 10 kilit açma işlemi
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Anlık güncelleniyor</span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Tahta</th>
                <th>Yöntem</th>
                <th>Kullanıcı</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td><div className="skeleton" style={{ height: 16, width: 120 }} /></td>
                    <td><div className="skeleton" style={{ height: 16, width: 100 }} /></td>
                    <td><div className="skeleton" style={{ height: 16, width: 80 }} /></td>
                    <td><div className="skeleton" style={{ height: 16, width: 100 }} /></td>
                    <td><div className="skeleton" style={{ height: 16, width: 60 }} /></td>
                  </tr>
                ))
              ) : recentLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    Henüz aktivite yok
                  </td>
                </tr>
              ) : (
                recentLogs.map((log) => {
                  const method = getMethodLabel(log.method);
                  const MethodIcon = method.icon;
                  return (
                    <tr key={log.id}>
                      <td style={{ color: 'var(--text-primary)' }}>{formatDate(log.created_at)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Monitor size={14} style={{ color: 'var(--accent-primary)', opacity: 0.7 }} />
                          {log.board?.name || 'Bilinmeyen'}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2" style={{ color: method.color }}>
                          <MethodIcon size={14} />
                          {method.label}
                        </div>
                      </td>
                      <td>{log.user?.full_name || 'Sistem'}</td>
                      <td>
                        <span className="badge badge-unlocked">
                          <Unlock size={10} />
                          Açıldı
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </motion.div>
      </motion.div>
    </AppLayout>
  );
}
