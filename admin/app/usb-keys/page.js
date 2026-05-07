'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Key, Plus, Search, Trash2, UserPlus, X, ShieldOff, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import AppLayout from '../components/AppLayout';
import { usbKeysAPI, usersAPI, schoolsAPI } from '../lib/api';
import { useAuthStore } from '../lib/store';

export default function UsbKeysPage() {
  const [keys, setKeys] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [drives, setDrives] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [schools, setSchools] = useState([]);
  const { user: currentUser } = useAuthStore();
  const [form, setForm] = useState({ driveLetter: '', label: '', user_id: '', school_id: '' });

  useEffect(() => { loadKeys(); loadUsers(); loadSchools(); }, [search]);

  const loadKeys = async () => {
    try {
      const { data } = await usbKeysAPI.list({ search, limit: 100 });
      setKeys(data.usb_keys || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadUsers = async () => {
    try {
      const { data } = await usersAPI.list({ limit: 100 });
      setUsers(data.users || []);
    } catch (err) { console.error(err); }
  };

  const loadSchools = async () => {
    if (currentUser?.role !== 'superadmin') return;
    try {
      const { data } = await schoolsAPI.list({ limit: 100 });
      setSchools(data.schools || []);
    } catch (err) { console.error(err); }
  };

  const scanUsbDrives = async () => {
    setScanning(true);
    try {
      if (window.chrome && window.chrome.webview) {
        const res = await new Promise((resolve) => {
          const handler = (e) => {
            try {
              const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
              if (data.action === 'scan_usb_result') {
                window.chrome.webview.removeEventListener('message', handler);
                resolve(data.data);
              }
            } catch (err) {}
          };
          window.chrome.webview.addEventListener('message', handler);
          window.chrome.webview.postMessage(JSON.stringify({ action: 'scan_usb' }));
        });
        
        if (res.success) {
          setDrives(res.drives || []);
          if (res.drives?.length > 0 && !form.driveLetter) {
            setForm(prev => ({ ...prev, driveLetter: res.drives[0].driveLetter }));
          }
        } else {
          toast.error('Sürücüler okunamadı: ' + res.error);
        }
      } else {
        toast.error('Bu özellik sadece E-Kilit masaüstü uygulamasında çalışır.');
      }
    } catch (err) {
      toast.error('Tarama hatası.');
    } finally {
      setScanning(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.driveLetter) {
       toast.error('Lütfen bir USB sürücü seçin.');
       return;
    }
    
    let targetSchoolId = currentUser?.school_id ?? currentUser?.school?.id;
    if (currentUser?.role === 'superadmin') {
      if (!form.school_id) {
        toast.error('Lütfen bir okul seçin.');
        return;
      }
      targetSchoolId = parseInt(form.school_id);
    }

    if (!targetSchoolId) {
      toast.error('Okul bilgisi eksik. Lütfen tekrar giriş yapın.');
      return;
    }

    setFormatting(true);
    let formatResult = null;
    try {
      const userId = form.user_id ? parseInt(form.user_id) : 0; 

      toast.loading('USB formatlanıyor ve şifreleniyor...', { id: 'formatToast' });
      
      if (window.chrome && window.chrome.webview) {
        formatResult = await new Promise((resolve, reject) => {
          // 60 saniye zaman aşımı (WMI ve Yazma işlemleri zaman alabilir)
          const timeout = setTimeout(() => {
            window.chrome.webview.removeEventListener('message', handler);
            reject(new Error('USB Yazma işlemi zaman aşımına uğradı. Lütfen USB belleği çıkarıp tekrar takın ve tekrar deneyin.'));
          }, 60000);

          const handler = (e) => {
            try {
              const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
              console.log('App response:', data); // Debug için
              
              if (data.action === 'format_usb_result') {
                clearTimeout(timeout);
                window.chrome.webview.removeEventListener('message', handler);
                resolve(data.data);
              } else if (data.action === 'error_result') {
                clearTimeout(timeout);
                window.chrome.webview.removeEventListener('message', handler);
                reject(new Error(data.data?.error || 'Masaüstü uygulaması bir hata döndürdü.'));
              }
            } catch (err) {
              console.error('IPC Message Error:', err);
            }
          };

          window.chrome.webview.addEventListener('message', handler);
          
          window.chrome.webview.postMessage({
            action: 'format_usb',
            driveLetter: form.driveLetter,
            schoolId: targetSchoolId,
            userId: userId,
            label: form.label || 'EKILIT_USB'
          });
        });
      } else {
        throw new Error('Masaüstü uygulaması tespit edilemedi.');
      }

      if (!formatResult || !formatResult.success) {
         throw new Error(formatResult?.error || 'Format işlemi sırasında bilinmeyen bir hata oluştu.');
      }
      toast.success('Fiziksel USB Başarıyla Şifrelendi!', { id: 'formatToast' });

    } catch (err) {
      toast.error('Fiziksel Format Hatası: ' + err.message, { id: 'formatToast' });
      setFormatting(false);
      return;
    }

    try {
      // 2. İşlem başarılıysa USB'nin Donanım Hash'ini API'ye Kaydet
      await usbKeysAPI.create({
        key_serial: formatResult.hardwareSerial, 
        label: form.label || 'EKILIT_USB',
        user_id: form.user_id ? parseInt(form.user_id) : undefined,
        school_id: targetSchoolId
      });
      toast.success('USB anahtarı veritabanına kaydedildi');
      setShowModal(false);
      setForm({ driveLetter: '', label: '', user_id: '', school_id: '' });
      loadKeys();
    } catch (err) {
      toast.error('Veritabanı kayıt hatası (USB fiziksel olarak hazırlandı ancak eşlenemedi): ' + (err.response?.data?.error || err.message));
    } finally {
      setFormatting(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!confirm('Bu USB anahtarını iptal etmek istediğinize emin misiniz?')) return;
    try {
      await usbKeysAPI.revoke(id);
      toast.success('USB anahtarı iptal edildi');
      loadKeys();
    } catch (err) { toast.error('İptal hatası'); }
  };

  const handleDelete = async (id) => {
    if (!id || id === 'undefined') {
      toast.error('Hata: Geçersiz USB ID. Lütfen sayfayı yenileyip tekrar deneyin.');
      return;
    }

    try {
      await usbKeysAPI.delete(id);
      toast.success('✅ USB anahtarı veritabanından silindi');
      loadKeys();
    } catch (err) { 
      toast.error('Silme hatası: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div>
              <h1>USB Anahtarları</h1>
              <p>Kişiye özel USB anahtarları oluşturun ve yönetin</p>
            </div>
            <button className="btn btn-primary" onClick={() => {
              scanUsbDrives();
              setShowModal(true);
            }}>
              <Plus size={16} />Yeni Anahtar Oluştur
            </button>
          </div>
          <div className="mt-4">
            <input className="input input-search" placeholder="Etiket veya seri no ile ara..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead><tr><th>Etiket</th><th>Seri No (Hash)</th><th>Atanan Kişi</th><th>Durum</th><th>Oluşturma</th><th>İşlemler</th></tr></thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j}><div className="skeleton" style={{ height: 16, width: 80 }} /></td>))}</tr>
              )) : keys.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>USB anahtarı bulunamadı</td></tr>
              ) : keys.map(key => (
                <tr key={key.id}>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    <div className="flex items-center gap-2"><Key size={14} style={{ color: 'var(--accent-info)' }} />{key.label}</div>
                  </td>
                  <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{key.key_serial?.slice(0, 16)}...</td>
                  <td>{key.user?.full_name || <span style={{ color: 'var(--text-muted)' }}>Atanmamış</span>}</td>
                  <td>
                    <span className={`badge ${key.status === 'active' ? 'badge-active' : key.status === 'revoked' ? 'badge-revoked' : 'badge-offline'}`}>
                      {key.status === 'active' ? '✓ Aktif' : key.status === 'revoked' ? '✕ İptal' : '! Kayıp'}
                    </span>
                  </td>
                  <td>{new Date(key.created_at).toLocaleDateString('tr-TR')}</td>
                  <td>
                    <div className="flex gap-2">
                      {key.status === 'active' && (
                        <button className="btn btn-warning btn-sm" onClick={() => handleRevoke(key.id)}>
                          <ShieldOff size={13} />İptal Et
                        </button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(key.id)} title="Tamamen Sil">
                        <Trash2 size={13} />Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <motion.div className="modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="modal-header">
              <h3 className="modal-title">Yeni USB Anahtarı</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="input-group">
                <label className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Takılı USB Bellekler</span>
                  <button type="button" onClick={scanUsbDrives} disabled={scanning || formatting} style={{ background: 'none', border: 'none', color: '#6C63FF', cursor: 'pointer', fontSize: 11 }}>
                    {scanning ? 'Taranıyor...' : '🔄 Yenile'}
                  </button>
                </label>
                <select className="input" value={form.driveLetter} onChange={(e) => setForm({ ...form, driveLetter: e.target.value })} disabled={formatting} required>
                  <option value="">Seçiniz</option>
                  {drives.map((d, i) => (
                     <option key={i} value={d.driveLetter}>{d.label}</option>
                  ))}
                </select>
                <p style={{ fontSize: 11, color: '#FF6B6B', marginTop: 4, fontWeight: 'bold' }}>⚠️ UYARI: Seçilen USB bellek BİÇİMLENDİRİLECEKTİR (Tüm veriler silinir!)</p>
              </div>
              <div className="input-group">
                <label className="input-label">Yeni USB Etiketi</label>
                <input className="input" placeholder="Ör: Ahmet Hoca USB" maxLength="11" value={form.label} disabled={formatting} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </div>
              {currentUser?.role === 'superadmin' && (
                <div className="input-group">
                  <label className="input-label">Okul</label>
                  <select className="input" value={form.school_id} disabled={formatting} onChange={(e) => setForm({ ...form, school_id: e.target.value })} required>
                    <option value="">Okul Seçiniz...</option>
                    {schools.map(s => (<option key={s.id} value={s.id}>{s.name} ({s.school_code})</option>))}
                  </select>
                </div>
              )}
              <div className="input-group">
                <label className="input-label">Atanacak Kişi (Opsiyonel)</label>
                <select className="input" value={form.user_id} disabled={formatting} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                  <option value="">Seçiniz...</option>
                  {users.filter(u => currentUser?.role !== 'superadmin' || u.school_id?.toString() === form.school_id?.toString()).map(u => (<option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>))}
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={formatting}>İptal</button>
                <button type="submit" className="btn btn-primary" disabled={formatting || !form.driveLetter || drives.length === 0}>
                  {formatting ? 'Şifreleniyor...' : 'Formatla & Şifrele'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AppLayout>
  );
}
