// BidKarts Mobile - Home Screen

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  FlatList, RefreshControl, ActivityIndicator
} from 'react-native';
import { useAuth } from '../../utils/AuthContext';
import { ProjectsAPI, UsersAPI } from '../../services/api';

const SERVICE_CARDS = [
  { key: 'solar', label: 'Solar EPC', icon: '☀️', color: '#f97316' },
  { key: 'electrical', label: 'Electrical', icon: '⚡', color: '#eab308' },
  { key: 'hvac', label: 'HVAC', icon: '❄️', color: '#3b82f6' },
  { key: 'plumbing', label: 'Plumbing', icon: '🔧', color: '#0891b2' },
  { key: 'fabrication', label: 'Fabrication', icon: '🏗️', color: '#64748b' },
  { key: 'contracting', label: 'Contracting', icon: '🏠', color: '#10b981' },
];

function formatCurrency(n: number) {
  return '₹' + (n || 0).toLocaleString('en-IN');
}

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data } = await ProjectsAPI.live();
      setProjects(data.projects || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    loadData();
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />}
    >
      {/* Hero Banner */}
      <View style={styles.hero}>
        <Text style={styles.heroGreeting}>
          {user ? `Hello, ${user.name.split(' ')[0]}! 👋` : 'Welcome to BidKarts! 🎉'}
        </Text>
        <Text style={styles.heroTitle}>Find the Best Contractors,{'\n'}Get Competitive Bids</Text>
        {user?.role === 'customer' && (
          <TouchableOpacity
            style={styles.heroCTA}
            onPress={() => navigation.navigate('PostProject')}
          >
            <Text style={styles.heroCTAText}>Post a Project Free →</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        {[['10,000+', 'Projects'], ['5,000+', 'Vendors'], ['₹50Cr+', 'Value']].map(([val, label]) => (
          <View key={label} style={styles.statItem}>
            <Text style={styles.statValue}>{val}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Service Categories */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Browse by Service</Text>
        <View style={styles.servicesGrid}>
          {SERVICE_CARDS.map(svc => (
            <TouchableOpacity
              key={svc.key}
              style={[styles.serviceCard, { borderColor: svc.color + '30' }]}
              onPress={() => navigation.navigate('Projects', { service_type: svc.key })}
            >
              <View style={[styles.serviceIcon, { backgroundColor: svc.color + '20' }]}>
                <Text style={{ fontSize: 24 }}>{svc.icon}</Text>
              </View>
              <Text style={[styles.serviceLabel, { color: svc.color }]}>{svc.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Live Projects */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Live Projects</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Projects')}>
            <Text style={styles.seeAll}>See All →</Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <ActivityIndicator color="#2563eb" style={{ padding: 20 }} />
        ) : projects.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No live projects yet</Text>
          </View>
        ) : (
          projects.slice(0, 5).map(p => (
            <TouchableOpacity
              key={p.id}
              style={styles.projectCard}
              onPress={() => navigation.navigate('ProjectDetail', { id: p.id })}
            >
              <View style={styles.projectTop}>
                <View style={[styles.serviceBadge, { backgroundColor: '#eff6ff' }]}>
                  <Text style={[styles.serviceBadgeText, { color: '#2563eb' }]}>
                    {p.service_type?.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.projectBidsCount}>{p.bid_count || 0} bids</Text>
              </View>
              <Text style={styles.projectTitle} numberOfLines={2}>{p.title}</Text>
              <View style={styles.projectMeta}>
                <Text style={styles.projectLocation}>📍 {p.location}</Text>
                <Text style={styles.projectBudget}>
                  {formatCurrency(p.budget_min)} – {formatCurrency(p.budget_max)}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Quick Actions for Vendors */}
      {user?.role === 'vendor' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => navigation.navigate('Dashboard')}
            >
              <Text style={styles.quickBtnIcon}>📊</Text>
              <Text style={styles.quickBtnText}>My Dashboard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => navigation.navigate('Messages')}
            >
              <Text style={styles.quickBtnIcon}>💬</Text>
              <Text style={styles.quickBtnText}>Messages</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  hero: {
    background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
    backgroundColor: '#1e3a8a',
    padding: 24, paddingTop: 32
  },
  heroGreeting: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginBottom: 6 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: 'white', lineHeight: 30, marginBottom: 16 },
  heroCTA: {
    backgroundColor: 'white', borderRadius: 12, padding: 14,
    alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 24
  },
  heroCTAText: { fontSize: 14, fontWeight: '700', color: '#2563eb' },
  statsBar: {
    flexDirection: 'row', backgroundColor: 'white',
    padding: 16, justifyContent: 'space-around',
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9'
  },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  statLabel: { fontSize: 11, color: '#64748b', fontWeight: '500', marginTop: 2 },
  section: { padding: 16, paddingBottom: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  seeAll: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  servicesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  serviceCard: {
    width: '30%', backgroundColor: 'white', borderRadius: 14, padding: 14,
    alignItems: 'center', borderWidth: 1.5, elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2
  },
  serviceIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  serviceLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  projectCard: {
    backgroundColor: 'white', borderRadius: 14, padding: 16, marginBottom: 10,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2
  },
  projectTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  serviceBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  serviceBadgeText: { fontSize: 10, fontWeight: '700' },
  projectBidsCount: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  projectTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 8, lineHeight: 20 },
  projectMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  projectLocation: { fontSize: 12, color: '#64748b' },
  projectBudget: { fontSize: 12, fontWeight: '700', color: '#059669' },
  emptyCard: { backgroundColor: 'white', borderRadius: 14, padding: 32, alignItems: 'center' },
  emptyText: { color: '#94a3b8', fontSize: 14 },
  quickActions: { flexDirection: 'row', gap: 12 },
  quickBtn: {
    flex: 1, backgroundColor: 'white', borderRadius: 12, padding: 16,
    alignItems: 'center', elevation: 1
  },
  quickBtnIcon: { fontSize: 28, marginBottom: 6 },
  quickBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },
});
