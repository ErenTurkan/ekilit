'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from '../lib/store';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { licensesAPI } from '../lib/api';
import Sidebar from './Sidebar';

export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, user, logout } = useAuthStore();
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [licenseChecked, setLicenseChecked] = useState(false);

  useEffect(() => {
    if (!token || !user) {
      router.push('/login');
      return;
    }

    if (user.role === 'teacher') {
      logout();
      router.push('/login');
      return;
    }

    // Connect WebSocket
    connectSocket(token);

    // Check license
    checkLicense();

    return () => {};
  }, [token, user, router]);

  const checkLicense = async () => {
    try {
      const { data } = await licensesAPI.check();
      setLicenseStatus(data);
    } catch (err) {
      // API erişilemezse bir şey yapma
      if (err.response?.data?.code === 'LICENSE_EXPIRED') {
        setLicenseStatus({ valid: false, expired: true });
      }
    } finally {
      setLicenseChecked(true);
    }
  };

  // Don't show layout on login page
  if (pathname === '/login' || !token || !user) {
    return children;
  }

  // License expired overlay (SuperAdmin hariç)
  const showLicenseBlock = licenseChecked && licenseStatus && !licenseStatus.valid && user.role !== 'superadmin';

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'toast-custom',
          duration: 4000,
          style: {
            background: '#0a0f2c',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff',
            fontFamily: 'Manrope, sans-serif',
            fontSize: '13px',
            borderRadius: '12px'
          }
        }}
      />
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          {/* License Warning Banner */}
          {licenseStatus && licenseStatus.valid && licenseStatus.license?.type !== 'lifetime' && licenseStatus.license?.remaining_days <= 7 && user.role !== 'superadmin' && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: '12px',
              padding: '12px 20px',
              margin: '16px 16px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '13px'
            }}>
              <span>⚠️</span>
              <span style={{ color: '#F59E0B', fontWeight: '600' }}>
                Lisansınızın süresi {licenseStatus.license.remaining_days} gün sonra dolacak.
              </span>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>
                Yöneticinize lisans yenileme için başvurun.
              </span>
            </div>
          )}

          {/* License Expired Block */}
          {showLicenseBlock ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '80vh', textAlign: 'center', padding: '40px'
            }}>
              <div style={{
                width: '88px', height: '88px', borderRadius: '50%',
                background: 'rgba(255,107,107,0.1)', border: '2px solid rgba(255,107,107,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '24px', fontSize: '40px'
              }}>🔒</div>
              <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '8px' }}>Lisans Süresi Doldu</h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', maxWidth: '400px', lineHeight: '1.6' }}>
                Okulunuzun lisans süresi sona ermiştir. Sisteme erişmek için lütfen yöneticinize veya
                E-Kilit destek ekibine başvurun.
              </p>
              <div style={{
                marginTop: '24px', padding: '12px 24px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                fontSize: '13px', color: 'rgba(255,255,255,0.4)'
              }}>
                📧 destek@e-kilit.com
              </div>
            </div>
          ) : children}
        </main>
      </div>
    </>
  );
}
