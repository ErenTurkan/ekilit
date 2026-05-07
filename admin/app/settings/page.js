'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, User, Lock, Save, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import AppLayout from '../components/AppLayout';
import { authAPI } from '../lib/api';
import { useAuthStore } from '../lib/store';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Yeni şifreler uyuşmuyor');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Şifre en az 6 karakter olmalı');
      return;
    }
    setSaving(true);
    try {
      await authAPI.changePassword({ current_password: currentPassword, new_password: newPassword });
      toast.success('Şifre başarıyla değiştirildi');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) { toast.error(err.response?.data?.error || 'Şifre değiştirme hatası'); }
    finally { setSaving(false); }
  };

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="page-header">
          <h1>Ayarlar</h1>
          <p>Hesap ayarlarınızı yönetin</p>
        </div>

        <div className="grid-2" style={{ maxWidth: 800 }}>
          {/* Profile Card */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2"><User size={16} /><span className="card-title">Profil Bilgileri</span></div>
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ad Soyad</div><div style={{ fontWeight: 600, marginTop: 2 }}>{user?.full_name}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>E-posta</div><div style={{ fontWeight: 600, marginTop: 2 }}>{user?.email}</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Rol</div><div style={{ marginTop: 2 }}>
                <span className={`badge badge-${user?.role}`}>{user?.role === 'superadmin' ? 'Süper Yönetici' : user?.role === 'principal' ? 'Müdür' : 'Öğretmen'}</span>
              </div></div>
              {user?.school && (
                <div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Okul</div><div style={{ fontWeight: 600, marginTop: 2 }}>{user.school.name}</div></div>
              )}
            </div>
          </div>

          {/* Change Password Card */}
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2"><Lock size={16} /><span className="card-title">Şifre Değiştir</span></div>
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="input-group"><label className="input-label">Mevcut Şifre</label><input className="input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div>
              <div className="input-group"><label className="input-label">Yeni Şifre</label><input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} /></div>
              <div className="input-group"><label className="input-label">Yeni Şifre (Tekrar)</label><input className="input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></div>
              <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: 4 }}>
                {saving ? 'Kaydediliyor...' : <><Save size={14} />Şifreyi Değiştir</>}
              </button>
            </form>
          </div>
        </div>

        <div className="card mt-4" style={{ maxWidth: 800 }}>
          <div className="card-header"><span className="card-title">Sistem Bilgileri</span></div>
          <div className="grid-2" style={{ fontSize: 13 }}>
            <div><span style={{ color: 'var(--text-muted)' }}>Uygulama:</span> E-Kilit Yönetim Paneli v1.0</div>
            <div><span style={{ color: 'var(--text-muted)' }}>API:</span> api.e-kilit.com</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Platform:</span> {typeof navigator !== 'undefined' ? navigator.platform : '-'}</div>
            <div><span style={{ color: 'var(--text-muted)' }}>Tarayıcı:</span> {typeof navigator !== 'undefined' ? navigator.userAgent.split(' ').slice(-2).join(' ') : '-'}</div>
          </div>
        </div>
      </motion.div>
    </AppLayout>
  );
}
