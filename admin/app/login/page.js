'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, Mail, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { authAPI } from '../lib/api';
import { useAuthStore } from '../lib/store';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await authAPI.login({
        email,
        password,
        device_type: 'desktop',
        device_info: navigator.userAgent
      });

      setAuth(data.user, data.tokens.access_token, data.tokens.refresh_token);
      router.push('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Giriş yapılamadı. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Animated background orbs */}
      <motion.div
        style={{
          position: 'absolute',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(108, 99, 255, 0.08) 0%, transparent 70%)',
          top: '10%',
          left: '15%'
        }}
        animate={{ y: [0, 30, 0], x: [0, -20, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        style={{
          position: 'absolute',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0, 212, 170, 0.06) 0%, transparent 70%)',
          bottom: '15%',
          right: '20%'
        }}
        animate={{ y: [0, -25, 0], x: [0, 15, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="login-logo">
          <motion.div
            className="login-logo-icon"
            initial={{ rotate: -10 }}
            animate={{ rotate: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Lock size={28} />
          </motion.div>
          <h2>E-Kilit</h2>
          <p>Yönetim Paneline Hoş Geldiniz</p>
        </div>

        {error && (
          <motion.div
            className="login-error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label className="input-label">E-posta Adresi</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
              <input
                className="input"
                type="email"
                placeholder="ornek@okul.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ paddingLeft: 38 }}
                id="login-email"
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Şifre</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
              <input
                className="input"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingLeft: 38, paddingRight: 38 }}
                id="login-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.3)',
                  cursor: 'pointer',
                  padding: 4
                }}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <motion.button
            className="btn btn-primary btn-lg"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: 8 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            id="login-submit"
          >
            {loading ? (
              <motion.div
                style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
            ) : (
              <>
                Giriş Yap
                <ArrowRight size={16} />
              </>
            )}
          </motion.button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--text-muted)' }}>
          E-Kilit Akıllı Tahta Yönetim Sistemi v1.0
        </p>
      </motion.div>
    </div>
  );
}
