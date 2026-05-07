'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Megaphone, Plus, Edit, Trash2, X, Bell, BellRing, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import AppLayout from '../components/AppLayout';
import { announcementsAPI } from '../lib/api';

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ title: '', content: '', priority: 'normal', starts_at: '', expires_at: '' });

  useEffect(() => { loadAnnouncements(); }, []);

  const loadAnnouncements = async () => {
    try {
      const { data } = await announcementsAPI.list({ limit: 50 });
      setAnnouncements(data.announcements || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      if (!payload.starts_at) delete payload.starts_at;
      if (!payload.expires_at) delete payload.expires_at;

      if (editItem) {
        await announcementsAPI.update(editItem.id, payload);
        toast.success('Duyuru güncellendi');
      } else {
        await announcementsAPI.create(payload);
        toast.success('Duyuru oluşturuldu');
      }
      setShowModal(false);
      setEditItem(null);
      setForm({ title: '', content: '', priority: 'normal', starts_at: '', expires_at: '' });
      loadAnnouncements();
    } catch (err) { toast.error(err.response?.data?.error || 'İşlem hatası'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Duyuruyu silmek istediğinize emin misiniz?')) return;
    try {
      await announcementsAPI.delete(id);
      toast.success('Duyuru silindi');
      loadAnnouncements();
    } catch (err) { toast.error('Silme hatası'); }
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      title: item.title, content: item.content || '', priority: item.priority,
      starts_at: item.starts_at ? item.starts_at.split('T')[0] : '',
      expires_at: item.expires_at ? item.expires_at.split('T')[0] : ''
    });
    setShowModal(true);
  };

  const getPriorityBadge = (p) => {
    switch (p) {
      case 'urgent': return { class: 'badge-locked', text: '🔴 Acil', icon: AlertTriangle };
      case 'high': return { class: 'badge-superadmin', text: '🟠 Yüksek', icon: BellRing };
      case 'normal': return { class: 'badge-principal', text: '🔵 Normal', icon: Bell };
      case 'low': return { class: 'badge-offline', text: '⚪ Düşük', icon: Bell };
      default: return { class: 'badge-offline', text: p, icon: Bell };
    }
  };

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div><h1>Duyurular</h1><p>Akıllı tahtaların kilit ekranında gösterilecek duyurular</p></div>
            <button className="btn btn-primary" onClick={() => { setEditItem(null); setForm({ title: '', content: '', priority: 'normal', starts_at: '', expires_at: '' }); setShowModal(true); }}>
              <Plus size={16} />Yeni Duyuru
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {loading ? Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card skeleton" style={{ height: 100 }} />
          )) : announcements.length === 0 ? (
            <div className="empty-state">
              <Megaphone size={48} style={{ opacity: 0.2 }} />
              <div className="empty-state-title">Duyuru yok</div>
              <div className="empty-state-text">Kilit ekranında gösterilecek duyuru oluşturun</div>
            </div>
          ) : announcements.map(ann => {
            const priority = getPriorityBadge(ann.priority);
            return (
              <motion.div key={ann.id} className="card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div style={{
                      width: 40, height: 40, borderRadius: 'var(--radius-md)',
                      background: ann.is_active ? 'var(--accent-primary-glow)' : 'var(--bg-glass)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Megaphone size={18} style={{ color: ann.is_active ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{ann.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{ann.content?.slice(0, 100)}{ann.content?.length > 100 ? '...' : ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`badge ${priority.class}`}>{priority.text}</span>
                    <span className={`badge ${ann.is_active ? 'badge-active' : 'badge-offline'}`}>{ann.is_active ? 'Aktif' : 'Pasif'}</span>
                    <button className="btn btn-secondary btn-sm btn-icon" onClick={() => openEdit(ann)}><Edit size={14} /></button>
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(ann.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                {(ann.starts_at || ann.expires_at) && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    {ann.starts_at && `Başlangıç: ${new Date(ann.starts_at).toLocaleDateString('tr-TR')}`}
                    {ann.starts_at && ann.expires_at && ' — '}
                    {ann.expires_at && `Bitiş: ${new Date(ann.expires_at).toLocaleDateString('tr-TR')}`}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <motion.div className="modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editItem ? 'Duyuruyu Düzenle' : 'Yeni Duyuru'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="input-group"><label className="input-label">Başlık</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
              <div className="input-group"><label className="input-label">İçerik</label><textarea className="input" rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ resize: 'vertical' }} /></div>
              <div className="input-group"><label className="input-label">Öncelik</label>
                <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Düşük</option><option value="normal">Normal</option><option value="high">Yüksek</option><option value="urgent">Acil</option>
                </select>
              </div>
              <div className="grid-2">
                <div className="input-group"><label className="input-label">Başlangıç (Opsiyonel)</label><input className="input" type="date" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></div>
                <div className="input-group"><label className="input-label">Bitiş (Opsiyonel)</label><input className="input" type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>İptal</button>
                <button type="submit" className="btn btn-primary">{editItem ? 'Güncelle' : 'Yayınla'}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AppLayout>
  );
}
