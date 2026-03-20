// BidKarts Mobile - AIToolsScreen
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '../../utils/AuthContext';

export default function AIToolsScreen({ navigation, route }: any) {
  const { user } = useAuth();
  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>AIToolsScreen</Text>
        <Text style={styles.subtitle}>This screen is under development.</Text>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  title: { fontSize: 22, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#64748b' },
});
