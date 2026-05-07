'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Download, Filter, Calendar, Monitor, Key, Shield, User, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import AppLayout from '../components/AppLayout';
import { reportsAPI } from '../lib/api';

export default function ReportsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ method: '', from: '', to: '' });

  useEffect(() => { loadLogs(); }, [pagination.page, filters]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = { page: pagination.page, limit: 30, ...filters };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const { data } = await reportsAPI.unlockLogs(params);
      setLogs(data.logs || []);
      setPagination(prev => ({ ...prev, ...data.pagination }));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleExport = async () => {
    try {
      const { data } = await reportsAPI.export({ ...filters, format: 'csv' });
      const url = window.URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapor_${Date.now()}.csv`;
      a.click();
      toast.success('Rapor indirildi');
    } catch (err) { toast.error('Dışa aktarma hatası'); }
  };

  const getMethodInfo = (method) => {
    switch (method) {
      case 'usb': return { label: 'USB', icon: Key, color: 'var(--accent-info)' };
      case 'qr': return { label: 'QR', icon: Shield, color: 'var(--accent-secondary)' };
      case 'remote': return { label: 'Uzaktan', icon: Monitor, color: 'var(--accent-primary)' };
      case 'masterkey': return { label: 'Master', icon: Shield, color: 'var(--accent-gold)' };
      default: return { label: method, icon: Key, color: 'var(--text-muted)' };
    }
  };

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div><h1>Raporlar</h1><p>Kilit açma logları ve kullanım raporları — 90 günde bir otomatik temizlenir</p></div>
            <button className="btn btn-primary" onClick={handleExport}><Download size={16} />CSV İndir</button>
          </div>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <select className="input" value={filters.method} onChange={(e) => setFilters({ ...filters, method: e.target.value })} style={{ maxWidth: 180 }}>
              <option value="">Tüm Yöntemler</option>
              <option value="usb">USB Anahtar</option>
              <option value="qr">QR Kod</option>
              <option value="remote">Uzaktan</option>
              <option value="masterkey">Master Key</option>
            </select>
            <input className="input" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} style={{ maxWidth: 170 }} />
            <input className="input" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} style={{ maxWidth: 170 }} />
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead><tr><th>Tarih/Saat</th><th>Tahta</th><th>Yöntem</th><th>Kullanıcı</th><th>IP</th><th>Kilitlenme</th></tr></thead>
            <tbody>
              {loading ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j}><div className="skeleton" style={{ height: 16, width: 90 }} /></td>))}</tr>
              )) : logs.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Kayıt bulunamadı</td></tr>
              ) : logs.map(log => {
                const method = getMethodInfo(log.method);
                const Icon = method.icon;
                return (
                  <tr key={log.id}>
                    <td style={{ color: 'var(--text-primary)' }}>{new Date(log.created_at).toLocaleString('tr-TR')}</td>
                    <td><div className="flex items-center gap-2"><Monitor size={14} style={{ color: 'var(--accent-primary)', opacity: 0.6 }} />{log.board?.name || '-'}</div></td>
                    <td><div className="flex items-center gap-2" style={{ color: method.color }}><Icon size={14} />{method.label}</div></td>
                    <td>{log.user?.full_name || <span style={{ color: 'var(--text-muted)' }}>Sistem</span>}</td>
                    <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{log.ip_address || '-'}</td>
                    <td>{log.locked_at ? new Date(log.locked_at).toLocaleString('tr-TR') : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pagination.totalPages > 1 && (
            <div className="table-pagination">
              <span>Toplam {pagination.total} kayıt</span>
              <div className="flex gap-2">
                <button className="btn btn-secondary btn-sm" disabled={pagination.page <= 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}>Önceki</button>
                <span style={{ padding: '6px 12px', fontSize: 12 }}>{pagination.page} / {pagination.totalPages}</span>
                <button className="btn btn-secondary btn-sm" disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}>Sonraki</button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AppLayout>
  );
}
