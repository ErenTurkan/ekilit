'use client';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, Download, Trash2, File, FileText, Image, Film, Archive, Check, X, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import AppLayout from '../components/AppLayout';
import { filesAPI, boardsAPI, schoolsAPI } from '../lib/api';
import { useAuthStore } from '../lib/store';

export default function FilesPage() {
  const [files, setFiles] = useState([]);
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showAssignModal, setShowAssignModal] = useState(null);
  const [selectedBoards, setSelectedBoards] = useState([]);
  const { user: currentUser } = useAuthStore();
  const [schools, setSchools] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => { loadFiles(); loadBoards(); loadSchools(); }, []);

  const loadSchools = async () => {
    if (currentUser?.role !== 'superadmin') return;
    try {
      const { data } = await schoolsAPI.list({ limit: 100 });
      setSchools(data.schools || []);
    } catch (err) { console.error(err); }
  };

  const loadFiles = async () => {
    try {
      const { data } = await filesAPI.list({ limit: 100 });
      setFiles(data.files || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadBoards = async () => {
    try {
      const { data } = await boardsAPI.list({ limit: 200 });
      setBoards(data.boards || []);
    } catch (err) { console.error(err); }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    const file = fileInputRef.current?.files[0];
    if (!file) return;
    if (currentUser?.role === 'superadmin' && !selectedSchool) {
      toast.error('Lütfen bir okul seçin');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Dosya boyutu 50MB\'ı aşamaz');
      return;
    }
    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedSchool) {
        formData.append('school_id', selectedSchool);
      }
      await filesAPI.upload(formData);
      toast.success('Dosya yüklendi');
      setShowUploadModal(false);
      loadFiles();
    } catch (err) { toast.error(err.response?.data?.error || 'Yükleme hatası'); }
    finally { setUploading(false); if(fileInputRef.current) fileInputRef.current.value = ''; setSelectedSchool(''); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Dosyayı silmek istediğinize emin misiniz?')) return;
    try {
      await filesAPI.delete(id);
      toast.success('Dosya silindi');
      loadFiles();
    } catch (err) { toast.error('Silme hatası'); }
  };

  const handleAssign = async () => {
    if (!showAssignModal || selectedBoards.length === 0) return;
    try {
      await filesAPI.assign(showAssignModal, selectedBoards);
      toast.success('Dosya tahtalara atandı');
      setShowAssignModal(null);
      setSelectedBoards([]);
      loadFiles();
    } catch (err) { toast.error('Atama hatası'); }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
  };

  const getFileIcon = (mime) => {
    if (mime?.startsWith('image')) return Image;
    if (mime?.startsWith('video')) return Film;
    if (mime?.includes('pdf')) return FileText;
    if (mime?.includes('zip') || mime?.includes('rar')) return Archive;
    return File;
  };

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div><h1>Dosya Aktarımı</h1><p>Tahtalara dosya aktarın — Maksimum 50MB</p></div>
            <button className="btn btn-primary" onClick={() => currentUser?.role === 'superadmin' ? setShowUploadModal(true) : fileInputRef.current?.click()} disabled={uploading}>
              <Upload size={16} />{uploading ? `Yükleniyor...` : 'Dosya Yükle'}
            </button>
            {currentUser?.role !== 'superadmin' && <input ref={fileInputRef} type="file" hidden onChange={handleUpload} />}
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead><tr><th>Dosya</th><th>Boyut</th><th>Yükleyen</th><th>Durum</th><th>Tarih</th><th>İşlemler</th></tr></thead>
            <tbody>
              {loading ? Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j}><div className="skeleton" style={{ height: 16, width: 80 }} /></td>))}</tr>
              )) : files.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Dosya bulunamadı</td></tr>
              ) : files.map(file => {
                const FileIcon = getFileIcon(file.mime_type);
                return (
                  <tr key={file.id}>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      <div className="flex items-center gap-2"><FileIcon size={16} style={{ color: 'var(--accent-info)' }} />{file.original_name}</div>
                    </td>
                    <td>{formatSize(file.file_size)}</td>
                    <td>{file.uploader?.full_name || '-'}</td>
                    <td>
                      <span className={`badge ${file.status === 'completed' ? 'badge-active' : file.status === 'failed' ? 'badge-locked' : 'badge-offline'}`}>
                        {file.status === 'completed' ? 'Tamamlandı' : file.status === 'pending' ? 'Bekliyor' : file.status === 'transferring' ? 'Aktarılıyor' : 'Başarısız'}
                      </span>
                    </td>
                    <td>{new Date(file.created_at).toLocaleDateString('tr-TR')}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary btn-sm" onClick={() => { setShowAssignModal(file.id); setSelectedBoards([]); }}><Send size={13} />Ata</button>
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => handleDelete(file.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {showAssignModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAssignModal(null); }}>
          <motion.div className="modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="modal-header">
              <h3 className="modal-title">Tahtaları Seçin</h3>
              <button className="modal-close" onClick={() => setShowAssignModal(null)}><X size={16} /></button>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {boards.map(board => (
                <label key={board.id} className="flex items-center gap-3" style={{ padding: '8px 0', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedBoards.includes(board.id)}
                    onChange={(e) => setSelectedBoards(e.target.checked ? [...selectedBoards, board.id] : selectedBoards.filter(id => id !== board.id))} />
                  <span style={{ fontSize: 13 }}>{board.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{board.board_code}</span>
                </label>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAssignModal(null)}>İptal</button>
              <button className="btn btn-primary" onClick={handleAssign} disabled={selectedBoards.length === 0}>
                {selectedBoards.length} Tahtaya Ata
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showUploadModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowUploadModal(false); }}>
          <motion.div className="modal" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="modal-header">
              <h3 className="modal-title">Dosya Yükle (Süper Yönetici)</h3>
              <button className="modal-close" onClick={() => setShowUploadModal(false)}><X size={16} /></button>
            </div>
            <div className="input-group">
              <label className="input-label">Okul Seçin</label>
              <select className="input" value={selectedSchool} onChange={(e) => setSelectedSchool(e.target.value)} required>
                <option value="">Okul Seçiniz...</option>
                {schools.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
              </select>
            </div>
            <div className="input-group">
              <label className="input-label">Dosya</label>
              <input ref={fileInputRef} type="file" className="input" />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowUploadModal(false)}>İptal</button>
              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>
                {uploading ? 'Yükleniyor...' : 'Yükle'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AppLayout>
  );
}
