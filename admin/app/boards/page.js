'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Monitor, RefreshCw, Unlock, Lock as LockIcon, Eye, Wifi, WifiOff, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import AppLayout from '../components/AppLayout';
import { boardsAPI, unlockAPI } from '../lib/api';
import { getSocket } from '../lib/socket';

export default function BoardsPage() {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedScreenshot, setSelectedScreenshot] = useState(null);

  const loadBoards = useCallback(async () => {
    try {
      const { data } = await boardsAPI.liveScreenshots();
      setBoards(data.boards || []);
    } catch (err) {
      console.error('Load boards error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoards();

    // Auto refresh every 30 seconds
    let interval;
    if (autoRefresh) {
      interval = setInterval(loadBoards, 30000);
    }

    // WebSocket listeners
    const socket = getSocket();
    if (socket) {
      socket.on('board:heartbeat', (data) => {
        setBoards(prev => prev.map(b =>
          b.id === data.board_id ? { 
            ...b, 
            status: data.status, // locked/unlocked
            last_heartbeat: data.last_heartbeat,
            is_online: true // Heartbeat geldiği için online
          } : b
        ));
      });

      socket.on('board:screenshot', (data) => {
        setBoards(prev => prev.map(b =>
          b.id === data.board_id ? {
            ...b,
            latest_screenshot: { url: data.screenshot_url || data.screenshot_data, captured_at: data.captured_at }
          } : b
        ));
      });

      socket.on('board:status-change', (data) => {
        setBoards(prev => prev.map(b =>
          b.id === data.board_id ? { ...b, status: data.status } : b
        ));
      });
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, loadBoards]);

  const handleUnlock = async (boardId) => {
    try {
      await unlockAPI.remote({ board_id: boardId });
      toast.success('Tahta kilidi açıldı');
      loadBoards();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Kilit açma hatası');
    }
  };

  const handleLock = async (boardId) => {
    try {
      await unlockAPI.lock({ board_id: boardId });
      toast.success('Tahta kilitlendi');
      loadBoards();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Kilitleme hatası');
    }
  };

  const filteredBoards = boards.filter(b => {
    if (search && !b.name?.toLowerCase().includes(search.toLowerCase()) &&
        !b.board_code?.toLowerCase().includes(search.toLowerCase())) return false;
    
    // Online/offline durumunu hesapla
    const isOnline = b.is_online || (b.last_heartbeat && 
      (Date.now() - new Date(b.last_heartbeat).getTime() < 60000));
    
    if (filter === 'online' && !isOnline) return false;
    if (filter === 'offline' && isOnline) return false;
    if (filter === 'locked' && b.status !== 'locked') return false;
    return true;
  });

  const getStatusBadge = (board) => {
    // Online/offline durumunu heartbeat zamanına göre belirle
    const isOnline = board.is_online || (board.last_heartbeat && 
      (Date.now() - new Date(board.last_heartbeat).getTime() < 60000)); // 1 dakika
    
    if (!isOnline) {
      return { class: 'badge-offline', text: 'Çevrimdışı', icon: WifiOff };
    }
    
    // Online ise kilit durumunu göster
    switch (board.status) {
      case 'unlocked': return { class: 'badge-unlocked', text: 'Açık', icon: Unlock };
      case 'locked': return { class: 'badge-online', text: 'Çevrimiçi', icon: Wifi };
      default: return { class: 'badge-online', text: 'Çevrimiçi', icon: Wifi };
    }
  };

  const timeSince = (dateStr) => {
    if (!dateStr) return 'Bilinmiyor';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Az önce';
    if (mins < 60) return `${mins} dk önce`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} saat önce`;
    return `${Math.floor(hours / 24)} gün önce`;
  };

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {/* Header */}
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div>
              <h1>Tahtalar</h1>
              <p>Tüm akıllı tahtaları anlık izleyin ve yönetin</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className={`btn btn-sm ${autoRefresh ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                <RefreshCw size={14} className={autoRefresh ? 'spin' : ''} />
                {autoRefresh ? 'Otomatik' : 'Manuel'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={loadBoards}>
                <RefreshCw size={14} />
                Yenile
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mt-4">
            <input
              className="input input-search"
              placeholder="Tahta ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 280 }}
            />
            <div className="tabs">
              {[
                { key: 'all', label: 'Tümü' },
                { key: 'online', label: 'Çevrimiçi' },
                { key: 'locked', label: 'Kilitli' },
                { key: 'offline', label: 'Çevrimdışı' }
              ].map(f => (
                <button
                  key={f.key}
                  className={`tab ${filter === f.key ? 'active' : ''}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Screenshot Grid */}
        {loading ? (
          <div className="screenshot-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="screenshot-card">
                <div className="screenshot-image skeleton" style={{ height: 160 }} />
                <div className="screenshot-info">
                  <div className="skeleton" style={{ height: 14, width: '60%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 12, width: '40%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredBoards.length === 0 ? (
          <div className="empty-state">
            <Monitor size={48} style={{ opacity: 0.2 }} />
            <div className="empty-state-title">Tahta bulunamadı</div>
            <div className="empty-state-text">
              {search ? 'Arama kriterlerinize uygun tahta yok' : 'Henüz kayıtlı tahta bulunmuyor'}
            </div>
          </div>
        ) : (
          <div className="screenshot-grid">
            {filteredBoards.map((board, idx) => {
              const statusBadge = getStatusBadge(board);
              const StatusIcon = statusBadge.icon;

              return (
                <motion.div
                  key={board.id}
                  className="screenshot-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  {/* Screenshot Preview */}
                  <div className="screenshot-image">
                    {board.latest_screenshot?.url ? (
                      <img
                        src={board.latest_screenshot.url.startsWith('data:')
                          ? board.latest_screenshot.url
                          : `${process.env.NEXT_PUBLIC_API_URL || 'https://api.e-kilit.com'}${board.latest_screenshot.url}`
                        }
                        alt={board.name}
                        loading="lazy"
                      />
                    ) : (
                      <Monitor size={32} style={{ color: 'var(--text-dim)' }} />
                    )}
                  </div>

                  {/* Board Info */}
                  <div className="screenshot-info">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{board.name || board.board_code}</div>
                        <div className="text-sm text-dim">{board.board_code}</div>
                      </div>
                      <span className={`badge ${statusBadge.class}`}>
                        <StatusIcon size={10} />
                        {statusBadge.text}
                      </span>
                    </div>
                    <div className="text-xs text-dim mt-2">
                      Son görülme: {timeSince(board.last_heartbeat)}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      {board.status === 'locked' && (
                        <button
                          className="btn btn-success btn-xs"
                          onClick={() => handleUnlock(board.id)}
                        >
                          <Unlock size={12} />
                          Kilidi Aç
                        </button>
                      )}
                      {board.status === 'unlocked' && (
                        <button
                          className="btn btn-warning btn-xs"
                          onClick={() => handleLock(board.id)}
                        >
                          <LockIcon size={12} />
                          Kilitle
                        </button>
                      )}
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => {
                          if (board.latest_screenshot?.url) {
                            setSelectedScreenshot(board.latest_screenshot.url);
                          } else {
                            toast.error('Görüntü yok');
                          }
                        }}
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Screenshot Modal */}
      {selectedScreenshot && (
        <div className="modal-overlay" onClick={() => setSelectedScreenshot(null)} style={{ zIndex: 1000, padding: 20 }}>
          <div className="modal" style={{ maxWidth: 1000, background: 'transparent', boxShadow: 'none', position: 'relative' }}>
            <button 
              className="modal-close" 
              onClick={() => setSelectedScreenshot(null)} 
              style={{ background: 'var(--bg-card)', padding: 8, borderRadius: '50%', position: 'absolute', top: -20, right: -20, zIndex: 10 }}
            >
              <Search size={20} />
            </button>
            <img 
              src={selectedScreenshot.startsWith('data:') ? selectedScreenshot : `${process.env.NEXT_PUBLIC_API_URL || 'https://api.e-kilit.com'}${selectedScreenshot}`} 
              style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)' }} 
              alt="Live Screen" 
            />
          </div>
        </div>
      )}
    </AppLayout>
  );
}
