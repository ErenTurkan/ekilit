'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe, Plus, Trash2, Shield, ShieldOff, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import AppLayout from '../components/AppLayout';
import { siteRulesAPI, schoolsAPI } from '../lib/api';
import { useAuthStore } from '../lib/store';

export default function SiteRulesPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [schools, setSchools] = useState([]);
  const { user: currentUser } = useAuthStore();
  const [form, setForm] = useState({ domain: '', type: 'whitelist', school_id: '' });

  useEffect(() => { loadRules(); loadSchools(); }, [tab]);

  const loadSchools = async () => {
    if (currentUser?.role !== 'superadmin') return;
    try {
      const { data } = await schoolsAPI.list({ limit: 100 });
      setSchools(data.schools || []);
    } catch (err) { console.error(err); }
  };

  const loadRules = async () => {
    try {
      const params = { limit: 200 };
      if (tab !== 'all') params.type = tab;
      const { data } = await siteRulesAPI.list(params);
      setRules(data.rules || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (currentUser?.role === 'superadmin' && !form.school_id) {
      toast.error('Lütfen bir okul seçin');
      return;
    }
    try {
      await siteRulesAPI.create(form);
      toast.success('Kural eklendi');
      setShowModal(false);
      setForm({ domain: '', type: 'whitelist', school_id: '' });
      loadRules();
    } catch (err) { toast.error(err.response?.data?.error || 'Ekleme hatası'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Kuralı silmek istediğinize emin misiniz?')) return;
    try {
      await siteRulesAPI.delete(id);
      toast.success('Kural silindi');
      loadRules();
    } catch (err) { toast.error('Silme hatası'); }
  };

  const whitelist = rules.filter(r => r.type === 'whitelist');
  const blacklist = rules.filter(r => r.type === 'blacklist');

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div><h1>Site Kuralları</h1><p>Akıllı tahtalarda izin verilen ve engellenen siteleri yönetin</p></div>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />Kural Ekle</button>
          </div>
          <div className="tabs mt-4">
            {[{ key: 'all', label: 'Tümü' }, { key: 'whitelist', label: '✅ İzin Verilenler' }, { key: 'blacklist', label: '🚫 Engellenenler' }].map(t => (
              <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="grid-2">
          {/* Whitelist */}
          {(tab === 'all' || tab === 'whitelist') && (
            <div className="card">
              <div className="card-header">
                <div className="flex items-center gap-2"><Shield size={16} style={{ color: 'var(--accent-success)' }} /><span className="card-title">İzin Verilenler ({whitelist.length})</span></div>
              </div>
              {whitelist.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Kural yok</div>
              ) : whitelist.map(rule => (
                <div key={rule.id} className="flex items-center justify-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-glass)' }}>
                  <div className="flex items-center gap-2">
                    <Globe size={14} style={{ color: 'var(--accent-success)' }} />
                    <span style={{ fontSize: 13 }}>{rule.domain}</span>
                  </div>
                  <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(rule.id)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Blacklist */}
          {(tab === 'all' || tab === 'blacklist') && (
            <div className="card">
              <div className="card-header">
                <div className="flex items-center gap-2"><ShieldOff size={16} style={{ color: 'var(--accent-warning)' }} /><span className="card-title">Engellenenler ({blacklist.length})</span></div>
              </div>
              {blacklist.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Kural yok</div>
              ) : blacklist.map(rule => (
                <div key={rule.id} className="flex items-center justify-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-glass)' }}>
                  <div className="flex items-center gap-2">
                    <Globe size={14} style={{ color: 'var(--accent-warning)' }} />
                    <span style={{ fontSize: 13 }}>{rule.domain}</span>
                  </div>
                  <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(rule.id)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <motion.div className="modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="modal-header">
              <h3 className="modal-title">Yeni Site Kuralı</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="input-group"><label className="input-label">Domain</label>
                <input className="input" placeholder="Ör: youtube.com" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} required />
              </div>
              <div className="input-group"><label className="input-label">Tür</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="whitelist">✅ İzin Ver (Whitelist)</option>
                  <option value="blacklist">🚫 Engelle (Blacklist)</option>
                </select>
              </div>
              {currentUser?.role === 'superadmin' && (
                <div className="input-group">
                  <label className="input-label">Okul</label>
                  <select className="input" value={form.school_id} onChange={(e) => setForm({ ...form, school_id: e.target.value })} required>
                    <option value="">Okul Seçiniz...</option>
                    {schools.map(s => (<option key={s.id} value={s.id}>{s.name} ({s.school_code})</option>))}
                  </select>
                </div>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>İptal</button>
                <button type="submit" className="btn btn-primary">Ekle</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AppLayout>
  );
}
