'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppLayout from '../components/AppLayout';
import { licensesAPI, schoolsAPI } from '../lib/api';

export default function LicensesPage() {
  const [licenses, setLicenses] = useState([]);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLicense, setEditingLicense] = useState(null);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({
    school_id: '', type: 'monthly', expires_at: '', max_boards: 50, notes: ''
  });

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [licRes, schRes] = await Promise.all([
        licensesAPI.list(),
        schoolsAPI.list({ limit: 500 })
      ]);
      setLicenses(licRes.data.licenses || []);
      setSchools(schRes.data.schools || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingLicense) {
        await licensesAPI.update(editingLicense.id, form);
      } else {
        await licensesAPI.create(form);
      }
      setShowModal(false);
      setEditingLicense(null);
      setForm({ school_id: '', type: 'monthly', expires_at: '', max_boards: 50, notes: '' });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Hata oluştu');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bu lisansı silmek istediğinize emin misiniz?')) return;
    try {
      await licensesAPI.delete(id);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Silinemedi');
    }
  };

  const handleSuspend = async (id) => {
    try {
      await licensesAPI.update(id, { status: 'suspended' });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Hata');
    }
  };

  const handleActivate = async (id) => {
    try {
      await licensesAPI.update(id, { status: 'active' });
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Hata');
    }
  };

  const openEdit = (lic) => {
    setEditingLicense(lic);
    setForm({
      school_id: lic.school_id,
      type: lic.type,
      expires_at: lic.expires_at?.slice(0, 10) || '',
      max_boards: lic.max_boards,
      notes: lic.notes || ''
    });
    setShowModal(true);
  };

  const openNew = () => {
    setEditingLicense(null);
    setForm({ school_id: '', type: 'monthly', expires_at: '', max_boards: 50, notes: '' });
    setShowModal(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return '#4ADE80';
      case 'expired': return '#FF6B6B';
      case 'suspended': return '#F59E0B';
      case 'cancelled': return '#94A3B8';
      default: return '#94A3B8';
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'trial': return '🧪 Deneme';
      case 'monthly': return '📅 Aylık';
      case 'yearly': return '📆 Yıllık';
      case 'lifetime': return '♾️ Ömür Boyu';
      default: return type;
    }
  };

  const getRemainingDays = (type, expiresAt) => {
    if (type === 'lifetime') return 'Sınırsız Süre';
    const remaining = Math.ceil((new Date(expiresAt) - Date.now()) / (1000 * 60 * 60 * 24));
    if (remaining < 0) return 'Süresi doldu';
    if (remaining === 0) return 'Bugün doluyor';
    return `${remaining} gün kaldı`;
  };

  const handleTypeChange = (e) => {
    const newType = e.target.value;
    let newExpiresAt = form.expires_at;
    const now = new Date();
    
    if (newType === 'trial') {
      newExpiresAt = new Date(now.setDate(now.getDate() + 3)).toISOString().slice(0, 10);
    } else if (newType === 'monthly') {
      newExpiresAt = new Date(now.setMonth(now.getMonth() + 1)).toISOString().slice(0, 10);
    } else if (newType === 'yearly') {
      newExpiresAt = new Date(now.setFullYear(now.getFullYear() + 1)).toISOString().slice(0, 10);
    } else if (newType === 'lifetime') {
      newExpiresAt = new Date(now.setFullYear(now.getFullYear() + 99)).toISOString().slice(0, 10);
    }
    
    setForm({ ...form, type: newType, expires_at: newExpiresAt });
  };

  const filtered = licenses.filter(l => filter === 'all' || l.status === filter);

  return (
    <AppLayout>
      <div style={{ padding: '32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#fff' }}>🔑 Lisans Yönetimi</h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', marginTop: '4px' }}>
              Okul lisanslarını oluşturun, süre belirleyin, askıya alın
            </p>
          </div>
          <button onClick={openNew} className="btn btn-primary" style={{
            padding: '10px 20px', borderRadius: '10px', border: 'none',
            background: '#6C63FF', color: '#fff', fontWeight: '700',
            fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit'
          }}>
            + Yeni Lisans
          </button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {[
            { key: 'all', label: 'Tümü', count: licenses.length },
            { key: 'active', label: 'Aktif', count: licenses.filter(l => l.status === 'active').length },
            { key: 'expired', label: 'Süresi Dolmuş', count: licenses.filter(l => l.status === 'expired').length },
            { key: 'suspended', label: 'Askıda', count: licenses.filter(l => l.status === 'suspended').length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              style={{
                padding: '6px 14px', borderRadius: '8px', border: '1px solid',
                borderColor: filter === tab.key ? '#6C63FF' : 'rgba(255,255,255,0.1)',
                background: filter === tab.key ? 'rgba(108,99,255,0.15)' : 'rgba(255,255,255,0.04)',
                color: filter === tab.key ? '#6C63FF' : 'rgba(255,255,255,0.5)',
                fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit'
              }}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Toplam Lisans', value: licenses.length, icon: '🔑', color: '#6C63FF' },
            { label: 'Aktif', value: licenses.filter(l => l.status === 'active').length, icon: '✅', color: '#4ADE80' },
            { label: 'Süresi Dolmuş', value: licenses.filter(l => l.status === 'expired').length, icon: '⏰', color: '#FF6B6B' },
            { label: '7 Gün İçinde Dolacak', value: licenses.filter(l => l.status === 'active' && l.type !== 'lifetime' && new Date(l.expires_at) - Date.now() > 0 && new Date(l.expires_at) - Date.now() < 7 * 24 * 60 * 60 * 1000).length, icon: '⚠️', color: '#F59E0B' },
          ].map((stat, i) => (
            <div key={i} style={{
              background: 'rgba(15,23,62,0.6)', borderRadius: '14px',
              border: '1px solid rgba(255,255,255,0.06)', padding: '16px'
            }}>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>{stat.icon} {stat.label}</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* License Cards */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.4)' }}>Yükleniyor...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'rgba(255,255,255,0.3)' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔑</div>
            <div>Lisans bulunamadı</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {filtered.map(lic => (
              <motion.div
                key={lic.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'rgba(15,23,62,0.5)',
                  borderRadius: '14px',
                  border: `1px solid ${lic.status === 'active' ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)'}`,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                  {/* Status Dot */}
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '12px',
                    background: `${getStatusColor(lic.status)}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px'
                  }}>
                    {lic.status === 'active' ? '✅' : lic.status === 'expired' ? '⏰' : '⏸️'}
                  </div>

                  {/* School + License Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: '700', fontSize: '14px' }}>{lic.school?.name || `Okul #${lic.school_id}`}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600',
                        background: `${getStatusColor(lic.status)}20`, color: getStatusColor(lic.status)
                      }}>
                        {lic.status === 'active' ? 'AKTİF' : lic.status === 'expired' ? 'DOLMUŞ' : lic.status === 'suspended' ? 'ASKIDA' : 'İPTAL'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', display: 'flex', gap: '16px' }}>
                      <span>{getTypeLabel(lic.type)}</span>
                      <span>🔑 {lic.license_key}</span>
                      <span>📺 Max {lic.max_boards} tahta</span>
                      <span>{lic.school?.school_code}</span>
                    </div>
                  </div>

                  {/* Expiry */}
                  <div style={{ textAlign: 'right', minWidth: '160px' }}>
                    <div style={{
                      fontSize: '13px', fontWeight: '600',
                      color: lic.type === 'lifetime' ? '#6C63FF' : (new Date(lic.expires_at) < Date.now() ? '#FF6B6B' : 
                             (new Date(lic.expires_at) - Date.now() < 7 * 24 * 60 * 60 * 1000 ? '#F59E0B' : '#4ADE80'))
                    }}>
                      {getRemainingDays(lic.type, lic.expires_at)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>
                      {lic.type === 'lifetime' ? 'Süresiz' : new Date(lic.expires_at).toLocaleDateString('tr-TR')}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', marginLeft: '16px' }}>
                  <button onClick={() => openEdit(lic)} style={{
                    padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)',
                    fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit'
                  }}>Düzenle</button>
                  {lic.status === 'active' ? (
                    <button onClick={() => handleSuspend(lic.id)} style={{
                      padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)',
                      background: 'rgba(245,158,11,0.1)', color: '#F59E0B',
                      fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit'
                    }}>Askıya Al</button>
                  ) : (
                    <button onClick={() => handleActivate(lic.id)} style={{
                      padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(74,222,128,0.2)',
                      background: 'rgba(74,222,128,0.1)', color: '#4ADE80',
                      fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit'
                    }}>Aktifleştir</button>
                  )}
                  <button onClick={() => handleDelete(lic.id)} style={{
                    padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,107,107,0.2)',
                    background: 'rgba(255,107,107,0.1)', color: '#FF6B6B',
                    fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit'
                  }}>Sil</button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Modal */}
        <AnimatePresence>
          {showModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
              }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                style={{
                  background: '#0F173E', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '16px', padding: '28px', width: '480px', maxHeight: '90vh', overflowY: 'auto'
                }}
              >
                <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>
                  {editingLicense ? '✏️ Lisans Düzenle' : '🔑 Yeni Lisans Oluştur'}
                </h3>
                <form onSubmit={handleSubmit}>
                  {!editingLicense && (
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '4px' }}>Okul</label>
                      <select
                        value={form.school_id}
                        onChange={e => setForm({ ...form, school_id: e.target.value })}
                        required
                        style={{
                          width: '100%', padding: '10px 12px', borderRadius: '8px',
                          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff', fontSize: '13px', fontFamily: 'inherit', outline: 'none'
                        }}
                      >
                        <option value="">Okul seçin...</option>
                        {schools.map(s => (
                          <option key={s.id} value={s.id}>{s.school_code} — {s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '4px' }}>Lisans Türü</label>
                      <select
                        value={form.type}
                        onChange={handleTypeChange}
                        style={{
                          width: '100%', padding: '10px 12px', borderRadius: '8px',
                          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff', fontSize: '13px', fontFamily: 'inherit', outline: 'none'
                        }}
                      >
                        <option value="trial">Deneme (3 Gün)</option>
                        <option value="monthly">Aylık</option>
                        <option value="yearly">Yıllık</option>
                        <option value="lifetime">Ömür Boyu</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '4px' }}>Max Tahta Sayısı</label>
                      <input
                        type="number" min="1" max="1000"
                        value={form.max_boards}
                        onChange={e => setForm({ ...form, max_boards: parseInt(e.target.value) })}
                        style={{
                          width: '100%', padding: '10px 12px', borderRadius: '8px',
                          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#fff', fontSize: '13px', fontFamily: 'inherit', outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '4px' }}>Bitiş Tarihi</label>
                    <input
                      type="date"
                      value={form.expires_at}
                      onChange={e => setForm({ ...form, expires_at: e.target.value })}
                      required
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff', fontSize: '13px', fontFamily: 'inherit', outline: 'none',
                        colorScheme: 'dark'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '4px' }}>Notlar</label>
                    <textarea
                      value={form.notes}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                      rows={3}
                      placeholder="Opsiyonel notlar..."
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '8px',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff', fontSize: '13px', fontFamily: 'inherit', outline: 'none', resize: 'vertical'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setShowModal(false)} style={{
                      padding: '10px 18px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                      background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
                      fontSize: '13px', fontFamily: 'inherit'
                    }}>İptal</button>
                    <button type="submit" style={{
                      padding: '10px 18px', borderRadius: '8px', border: 'none',
                      background: '#6C63FF', color: '#fff', fontWeight: '700', cursor: 'pointer',
                      fontSize: '13px', fontFamily: 'inherit'
                    }}>{editingLicense ? 'Güncelle' : 'Oluştur'}</button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
