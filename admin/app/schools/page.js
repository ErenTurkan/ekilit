'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { School, Plus, Edit, Trash2, Monitor, Users, X, MapPin, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import AppLayout from '../components/AppLayout';
import { schoolsAPI } from '../lib/api';
import { useAuthStore } from '../lib/store';

export default function SchoolsPage() {
  const { user } = useAuthStore();
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ school_code: '', name: '', city: '', district: '', address: '', phone: '' });

  useEffect(() => {
    if (user?.role !== 'superadmin') return;
    loadSchools();
  }, [search, user]);

  const loadSchools = async () => {
    try {
      const { data } = await schoolsAPI.list({ search, limit: 100 });
      setSchools(data.schools || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editItem) {
        const { school_code, ...updateData } = form;
        await schoolsAPI.update(editItem.id, updateData);
        toast.success('Okul güncellendi');
      } else {
        await schoolsAPI.create(form);
        toast.success('Okul oluşturuldu');
      }
      setShowModal(false);
      setEditItem(null);
      setForm({ school_code: '', name: '', city: '', district: '', address: '', phone: '' });
      loadSchools();
    } catch (err) { toast.error(err.response?.data?.error || 'İşlem hatası'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bu okulu ve tüm verilerini silmek istediğinize emin misiniz? Bu işlem geri alınamaz!')) return;
    try {
      await schoolsAPI.delete(id);
      toast.success('Okul silindi');
      loadSchools();
    } catch (err) { toast.error(err.response?.data?.error || 'Silme hatası'); }
  };

  const openEdit = (school) => {
    setEditItem(school);
    setForm({ school_code: school.school_code, name: school.name, city: school.city || '', district: school.district || '', address: school.address || '', phone: school.phone || '' });
    setShowModal(true);
  };

  if (user?.role !== 'superadmin') {
    return <AppLayout><div className="empty-state"><div className="empty-state-title">Erişim Engellendi</div><div className="empty-state-text">Bu sayfaya sadece süper yönetici erişebilir</div></div></AppLayout>;
  }

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div><h1>Okullar</h1><p>Tüm kayıtlı okulları yönetin</p></div>
            <button className="btn btn-primary" onClick={() => { setEditItem(null); setForm({ school_code: '', name: '', city: '', district: '', address: '', phone: '' }); setShowModal(true); }}>
              <Plus size={16} />Yeni Okul
            </button>
          </div>
          <div className="mt-4"><input className="input input-search" placeholder="Okul ara..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 320 }} /></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {loading ? Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card skeleton" style={{ height: 140 }} />
          )) : schools.length === 0 ? (
            <div className="empty-state" style={{ gridColumn: '1/-1' }}>
              <School size={48} style={{ opacity: 0.2 }} />
              <div className="empty-state-title">Okul bulunamadı</div>
            </div>
          ) : schools.map(school => (
            <motion.div key={school.id} className="card" whileHover={{ scale: 1.01 }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--accent-primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <School size={20} style={{ color: 'var(--accent-primary)' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{school.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{school.school_code}</div>
                  </div>
                </div>
                <span className={`badge ${school.status === 'active' ? 'badge-active' : 'badge-suspended'}`}>
                  {school.status === 'active' ? 'Aktif' : 'Askıda'}
                </span>
              </div>

              {(school.city || school.district) && (
                <div className="flex items-center gap-2 mb-4" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  <MapPin size={12} />{school.district && `${school.district}, `}{school.city}
                </div>
              )}

              <div className="flex items-center gap-4" style={{ fontSize: 12 }}>
                <div className="flex items-center gap-1" style={{ color: 'var(--accent-info)' }}>
                  <Monitor size={13} />{school.stats?.total_boards || 0} Tahta
                </div>
                <div className="flex items-center gap-1" style={{ color: 'var(--accent-success)' }}>
                  <Users size={13} />{school.stats?.total_users || 0} Kullanıcı
                </div>
              </div>

              <div className="flex gap-2 mt-4" style={{ borderTop: '1px solid var(--border-glass)', paddingTop: 12 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(school)} style={{ flex: 1 }}><Edit size={13} />Düzenle</button>
                <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(school.id)}><Trash2 size={14} /></button>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <motion.div className="modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editItem ? 'Okulu Düzenle' : 'Yeni Okul'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              {!editItem && (
                <div className="input-group"><label className="input-label">Okul Kodu</label><input className="input" placeholder="Ör: IST001" value={form.school_code} onChange={(e) => setForm({ ...form, school_code: e.target.value.toUpperCase() })} required /></div>
              )}
              <div className="input-group"><label className="input-label">Okul Adı</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div className="grid-2">
                <div className="input-group"><label className="input-label">İl</label><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                <div className="input-group"><label className="input-label">İlçe</label><input className="input" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} /></div>
              </div>
              <div className="input-group"><label className="input-label">Adres</label><textarea className="input" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="input-group"><label className="input-label">Telefon</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>İptal</button>
                <button type="submit" className="btn btn-primary">{editItem ? 'Güncelle' : 'Oluştur'}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AppLayout>
  );
}
