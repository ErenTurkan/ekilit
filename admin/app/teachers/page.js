'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Plus, Search, Edit, Trash2, UserCheck, UserX, Mail, Phone, X } from 'lucide-react';
import toast from 'react-hot-toast';
import AppLayout from '../components/AppLayout';
import { usersAPI, schoolsAPI } from '../lib/api';
import { useAuthStore } from '../lib/store';

export default function TeachersPage() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });

  const [form, setForm] = useState({
    full_name: '', email: '', password: '', phone: '', role: 'teacher', school_id: ''
  });

  useEffect(() => { loadUsers(); loadSchools(); }, [search, pagination.page]);

  const loadSchools = async () => {
    if (currentUser?.role !== 'superadmin') return;
    try {
      const { data } = await schoolsAPI.list({ limit: 100 });
      setSchools(data.schools || []);
    } catch (err) { console.error(err); }
  };

  const loadUsers = async () => {
    try {
      const { data } = await usersAPI.list({
        page: pagination.page, limit: 20, search,
        role: currentUser?.role === 'principal' ? 'teacher' : undefined
      });
      setUsers(data.users || []);
      setPagination(data.pagination || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        full_name: (form.full_name || '').trim(),
        email: (form.email || '').trim(),
        phone: (form.phone || '').trim(),
        role: currentUser?.role === 'principal' ? 'teacher' : form.role
      };

      if (editUser) {
        const { password, ...updateData } = payload;
        await usersAPI.update(editUser.id, updateData);
        toast.success('Kullanıcı güncellendi');
      } else {
        await usersAPI.create(payload);
        toast.success('Kullanıcı oluşturuldu');
      }
      setShowModal(false);
      setEditUser(null);
      setForm({ full_name: '', email: '', password: '', phone: '', role: 'teacher', school_id: '' });
      loadUsers();
    } catch (err) {
      const details = err.response?.data?.details;
      const detailText = Array.isArray(details)
        ? details.map(d => (typeof d === 'string' ? d : d?.message)).filter(Boolean).join(' | ')
        : null;
      toast.error(detailText || err.response?.data?.error || 'İşlem başarısız');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return;
    try {
      await usersAPI.delete(id);
      toast.success('Kullanıcı silindi');
      loadUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Silme hatası');
    }
  };

  const handleToggleActive = async (usr) => {
    try {
      await usersAPI.update(usr.id, { is_active: !usr.is_active });
      toast.success(usr.is_active ? 'Hesap devre dışı bırakıldı' : 'Hesap aktif edildi');
      loadUsers();
    } catch (err) {
      toast.error('Güncelleme hatası');
    }
  };

  const openEdit = (usr) => {
    setEditUser(usr);
    setForm({ full_name: usr.full_name, email: usr.email, password: '', phone: usr.phone || '', role: usr.role, school_id: usr.school_id || '' });
    setShowModal(true);
  };

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div>
              <h1>{currentUser?.role === 'principal' ? 'Öğretmenler' : 'Kullanıcılar'}</h1>
              <p>{currentUser?.role === 'principal' ? 'Okulunuzdaki öğretmenleri yönetin' : 'Sistemdeki tüm müdür ve öğretmenleri yönetin'}</p>
            </div>
            <button className="btn btn-primary" onClick={() => { setEditUser(null); setForm({ full_name: '', email: '', password: '', phone: '', role: currentUser?.role === 'principal' ? 'teacher' : 'principal', school_id: '' }); setShowModal(true); }}>
              <Plus size={16} />
              Yeni {currentUser?.role === 'principal' ? 'Öğretmen' : 'Kullanıcı'}
            </button>
          </div>
          <div className="mt-4">
            <input className="input input-search" placeholder="İsim, e-posta, telefon ile ara..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }} style={{ maxWidth: 320 }} />
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Ad Soyad</th>
                <th>E-Posta</th>
                <th>Rol</th>
                {currentUser?.role === 'superadmin' && <th>Okul</th>}
                <th>Durum</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: currentUser?.role === 'superadmin' ? 6 : 5 }).map((_, j) => (
                    <td key={j}><div className="skeleton" style={{ height: 16, width: 80 }} /></td>
                  ))}
                </tr>
              )) : users.length === 0 ? (
                <tr><td colSpan={currentUser?.role === 'superadmin' ? 6 : 5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Kullanıcı bulunamadı</td></tr>
              ) : users.map(usr => (
                <tr key={usr.id}>
                  <td style={{ fontWeight: 600 }}>{usr.full_name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{usr.email}</td>
                  <td>
                    <span className={`badge ${usr.role === 'principal' ? 'badge-primary' : 'badge-default'}`}>
                      {usr.role === 'principal' ? 'Müdür' : 'Öğretmen'}
                    </span>
                  </td>
                  {currentUser?.role === 'superadmin' && (
                    <td>{usr.school?.name || <span className="text-muted">Atanmamış</span>}</td>
                  )}
                  <td>
                    <span className={`badge ${usr.is_active ? 'badge-active' : 'badge-suspended'}`}>
                      {usr.is_active ? 'Aktif' : 'Askıda'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-secondary btn-sm btn-icon" onClick={() => openEdit(usr)}><Edit size={14} /></button>
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(usr.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pagination">
            <button className="btn btn-secondary btn-sm" disabled={pagination.page <= 1}
              onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}>Önceki</button>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Sayfa {pagination.page} / {pagination.totalPages || 1}</span>
            <button className="btn btn-secondary btn-sm" disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}>Sonraki</button>
          </div>
        </div>
      </motion.div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <motion.div className="modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editUser ? 'Kullanıcıyı Düzenle' : 'Yeni Kullanıcı'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label className="input-label">Ad Soyad</label>
                <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              </div>
              <div className="input-group">
                <label className="input-label">E-Posta</label>
                <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              {!editUser && (
                <div className="input-group">
                  <label className="input-label">Şifre</label>
                  <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
                </div>
              )}
              <div className="input-group">
                <label className="input-label">Telefon</label>
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              {currentUser?.role === 'superadmin' && (
                <>
                  <div className="input-group">
                    <label className="input-label">Okul</label>
                    <select className="input" value={form.school_id} onChange={(e) => setForm({ ...form, school_id: e.target.value })} required>
                      <option value="">Okul Seçiniz...</option>
                      {schools.map(s => (<option key={s.id} value={s.id}>{s.name} ({s.school_code})</option>))}
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Rol</label>
                    <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                      <option value="teacher">Öğretmen</option>
                      <option value="principal">Müdür</option>
                    </select>
                  </div>
                </>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>İptal</button>
                <button type="submit" className="btn btn-primary">{editUser ? 'Güncelle' : 'Oluştur'}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AppLayout>
  );
}
