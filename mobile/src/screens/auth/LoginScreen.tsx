// BidKarts Mobile - Login Screen

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Image
} from 'react-native';
import { useAuth } from '../../utils/AuthContext';

export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Login failed. Check your credentials.';
      Alert.alert('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoText}>⚒</Text>
          </View>
          <Text style={styles.brandName}>BidKarts</Text>
          <Text style={styles.brandTagline}>Connect. Bid. Build.</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to your BidKarts account</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholderTextColor="#94a3b8"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passWrap}>
              <TextInput
                style={[styles.input, styles.passInput]}
                placeholder="Enter password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                autoComplete="password"
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPass(!showPass)}
              >
                <Text style={styles.eyeText}>{showPass ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.forgotBtn}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="white" size="small" />
              : <Text style={styles.loginBtnText}>Sign In →</Text>
            }
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Demo accounts */}
          <View style={styles.demoWrap}>
            <Text style={styles.demoTitle}>Demo Accounts:</Text>
            {[
              { role: 'Customer', email: 'customer@bidkarts.com', pass: 'Customer@123', color: '#2563eb' },
              { role: 'Vendor', email: 'vendor@bidkarts.com', pass: 'Vendor@123', color: '#7c3aed' },
              { role: 'Admin', email: 'admin@bidkarts.com', pass: 'Admin@123', color: '#dc2626' },
            ].map(d => (
              <TouchableOpacity
                key={d.role}
                style={[styles.demoBtn, { borderColor: d.color }]}
                onPress={() => { setEmail(d.email); setPassword(d.pass); }}
              >
                <Text style={[styles.demoBtnText, { color: d.color }]}>{d.role}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.registerWrap}>
          <Text style={styles.registerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.registerLink}>Register Now</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { flexGrow: 1, padding: 20 },
  logoWrap: { alignItems: 'center', paddingVertical: 32 },
  logoIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center',
    marginBottom: 12, elevation: 4,
    shadowColor: '#2563eb', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8
  },
  logoText: { fontSize: 32 },
  brandName: { fontSize: 28, fontWeight: '900', color: '#1e293b', letterSpacing: -0.5 },
  brandTagline: { fontSize: 14, color: '#64748b', marginTop: 4, fontWeight: '500' },
  card: {
    backgroundColor: 'white', borderRadius: 20, padding: 24,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  subtitle: { fontSize: 14, color: '#64748b', marginBottom: 20 },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10,
    padding: 12, fontSize: 14, color: '#1e293b', backgroundColor: 'white'
  },
  passWrap: { position: 'relative' },
  passInput: { paddingRight: 48 },
  eyeBtn: { position: 'absolute', right: 12, top: 12 },
  eyeText: { fontSize: 18 },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 16 },
  forgotText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  loginBtn: {
    backgroundColor: '#2563eb', borderRadius: 12, padding: 14,
    alignItems: 'center', marginBottom: 16
  },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText: { marginHorizontal: 12, fontSize: 12, color: '#94a3b8', fontWeight: '500' },
  demoWrap: {},
  demoTitle: { fontSize: 12, color: '#64748b', fontWeight: '600', marginBottom: 8 },
  demoBtn: {
    borderWidth: 1.5, borderRadius: 8, padding: 8, alignItems: 'center',
    marginBottom: 6
  },
  demoBtnText: { fontSize: 12, fontWeight: '600' },
  registerWrap: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  registerText: { fontSize: 14, color: '#64748b' },
  registerLink: { fontSize: 14, color: '#2563eb', fontWeight: '700' },
});
