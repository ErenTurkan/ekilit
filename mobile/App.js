import React, { useState, useEffect } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginScreen from './screens/LoginScreen';
import QRScannerScreen from './screens/QRScannerScreen';
import { checkAuth } from './api';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    checkStoredAuth();
  }, []);

  const checkStoredAuth = async () => {
    try {
      const token = await AsyncStorage.getItem('ekilit_token');
      const userData = await AsyncStorage.getItem('ekilit_user');
      if (token && userData) {
        const parsed = JSON.parse(userData);
        setUser(parsed);
        setIsLoggedIn(true);
      }
    } catch (e) {
      // ignore
    }
    setIsLoading(false);
  };

  const onLoginSuccess = (userData, token) => {
    setUser(userData);
    setIsLoggedIn(true);
  };

  const onLogout = async () => {
    await AsyncStorage.multiRemove(['ekilit_token', 'ekilit_user', 'ekilit_refresh']);
    setUser(null);
    setIsLoggedIn(false);
  };

  if (isLoading) {
    return <View style={styles.loading}><StatusBar barStyle="light-content" /></View>;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050816" />
      {isLoggedIn ? (
        <QRScannerScreen user={user} onLogout={onLogout} />
      ) : (
        <LoginScreen onLoginSuccess={onLoginSuccess} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050816' },
  loading: { flex: 1, backgroundColor: '#050816' },
});
