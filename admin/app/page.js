'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from './lib/store';

export default function Home() {
  const router = useRouter();
  const { token, user } = useAuthStore();

  useEffect(() => {
    if (token && user) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, [token, user, router]);

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#050816'
    }}>
      <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 12 }} />
    </div>
  );
}
