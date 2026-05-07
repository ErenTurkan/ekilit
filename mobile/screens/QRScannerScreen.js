import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Vibration, Animated
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { unlockWithQr } from '../api';

export default function QRScannerScreen({ user, onLogout }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [result, setResult] = useState(null); // { success, message, boardName }
  const [scanning, setScanning] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const showResult = (success, message, boardName) => {
    setResult({ success, message, boardName });
    setScanned(true);
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setScanned(false);
        setResult(null);
      });
    }, 4000);
  };

  const handleBarCodeScanned = async ({ data }) => {
    if (scanned || scanning) return;

    // QR format: EKILIT|boardCode|qrToken
    if (!data.startsWith('EKILIT|')) {
      showResult(false, 'Bu geçerli bir E-Kilit QR kodu değil', null);
      return;
    }

    const parts = data.split('|');
    if (parts.length !== 3) {
      showResult(false, 'Geçersiz QR kod formatı', null);
      return;
    }

    const boardCode = parts[1];
    const qrToken = parts[2];

    setScanning(true);
    Vibration.vibrate(100);

    try {
      const response = await unlockWithQr(boardCode, qrToken);
      showResult(true, 'Kilit Açıldı!', response.board?.name || boardCode);
    } catch (e) {
      const msg = e.response?.data?.error || 'Kilit açılamadı';
      showResult(false, msg, boardCode);
    }
    setScanning(false);
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionCard}>
          <Text style={styles.permissionIcon}>📷</Text>
          <Text style={styles.permissionTitle}>Kamera İzni Gerekli</Text>
          <Text style={styles.permissionText}>
            QR kod okutarak tahta kilidini açmak için kamera izni vermeniz gerekmektedir.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>İzin Ver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.brandIcon}>
            <Text style={{ fontSize: 16 }}>🔒</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>E-Kilit</Text>
            <Text style={styles.headerUser}>{user?.full_name || 'Öğretmen'}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Çıkış</Text>
        </TouchableOpacity>
      </View>

      {/* Camera */}
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        />

        {/* Scanner Overlay */}
        <View style={styles.overlay}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        </View>

        {/* Scan instruction */}
        <View style={styles.instructionBox}>
          <Text style={styles.instructionText}>
            Tahtadaki QR kodu kameraya gösterin
          </Text>
        </View>
      </View>

      {/* Result Overlay */}
      {result && (
        <Animated.View style={[styles.resultOverlay, { opacity: fadeAnim }]}>
          <View style={[styles.resultCard, result.success ? styles.successCard : styles.errorCard]}>
            <Text style={styles.resultIcon}>{result.success ? '✅' : '❌'}</Text>
            <Text style={styles.resultMessage}>{result.message}</Text>
            {result.boardName && (
              <Text style={styles.resultBoard}>{result.boardName}</Text>
            )}
            {result.success && (
              <Text style={styles.resultUser}>Açan: {user?.full_name}</Text>
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050816' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 52,
    backgroundColor: 'rgba(5,8,22,0.9)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#6C63FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerUser: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  logoutBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,107,107,0.15)',
  },
  logoutText: { color: '#FF6B6B', fontSize: 13, fontWeight: '600' },
  cameraContainer: { flex: 1, position: 'relative' },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#6C63FF',
  },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  instructionBox: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(5,8,22,0.85)',
    zIndex: 100,
  },
  resultCard: {
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    width: 280,
  },
  successCard: {
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.3)',
  },
  errorCard: {
    backgroundColor: 'rgba(255,107,107,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.3)',
  },
  resultIcon: { fontSize: 48, marginBottom: 16 },
  resultMessage: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  resultBoard: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 4 },
  resultUser: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  permissionCard: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  permissionIcon: { fontSize: 48, marginBottom: 16 },
  permissionTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  permissionText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  permissionButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 10,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  permissionButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
