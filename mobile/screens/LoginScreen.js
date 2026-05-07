import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native';
import { login } from '../api';

export default function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('E-posta ve şifre zorunludur');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await login(email.trim(), password);
      if (!['superadmin', 'principal', 'teacher'].includes(data.user?.role)) {
        setError('Bu hesap mobil uygulamaya giriş yapamaz');
        return;
      }
      onLoginSuccess(data.user, data.tokens.access_token);
    } catch (e) {
      let msg = 'Giriş başarısız. Bilgilerinizi kontrol edin.';
      if (!e.response) {
        msg = 'Sunucuya bağlanılamadı. İnternetinizi veya API adresini kontrol edin.';
      } else if (e.response.data?.error) {
        msg = e.response.data.error;
      }
      setError(msg);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        {/* Logo / Brand */}
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandIconText}>🔒</Text>
          </View>
          <Text style={styles.brandText}>E-Kilit</Text>
        </View>

        <Text style={styles.title}>Öğretmen Girişi</Text>
        <Text style={styles.subtitle}>Okul müdürünüzden aldığınız bilgilerle giriş yapın</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>E-Posta</Text>
        <TextInput
          style={styles.input}
          placeholder="ornek@okul.edu.tr"
          placeholderTextColor="rgba(255,255,255,0.25)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Şifre</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor="rgba(255,255,255,0.25)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Giriş Yap</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footerText}>
          E-Kilit v2.0 — Akıllı Tahta Güvenlik Sistemi
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050816',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(15,23,62,0.8)',
    borderRadius: 24,
    padding: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 10,
  },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#6C63FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandIconText: { fontSize: 20 },
  brandText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 14,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#6C63FF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: 'rgba(255,107,107,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.2)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
  },
  footerText: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.2)',
    fontSize: 11,
    marginTop: 20,
  },
});
