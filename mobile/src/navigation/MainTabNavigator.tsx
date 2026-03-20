// BidKarts Mobile - Main Tab Navigator

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import { useAuth } from '../utils/AuthContext';

// Tab Screens
import HomeScreen from '../screens/home/HomeScreen';
import ProjectsScreen from '../screens/projects/ProjectsScreen';
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import MessagesScreen from '../screens/messages/MessagesScreen';
import ExpertsScreen from '../screens/experts/ExpertsScreen';

const Tab = createBottomTabNavigator();

// Simple icon component (replace with vector icons in production)
function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: { [key: string]: string } = {
    Home: '🏠', Projects: '📋', Dashboard: '⚡', Messages: '💬', Experts: '👤'
  };
  return (
    <Text style={{ fontSize: focused ? 24 : 20, opacity: focused ? 1 : 0.6 }}>
      {icons[name] || '●'}
    </Text>
  );
}

export default function MainTabNavigator() {
  const { user } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => (
          <TabIcon name={route.name} focused={focused} />
        ),
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e2e8f0',
          paddingBottom: 8,
          paddingTop: 4,
          height: 64,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: '#1e293b',
        headerTitleStyle: { fontWeight: '800', fontSize: 18 },
        headerShadowVisible: false,
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'BidKarts', tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Projects"
        component={ProjectsScreen}
        options={{ title: 'Browse Projects', tabBarLabel: 'Projects' }}
      />
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: user?.role === 'vendor' ? 'Vendor Dashboard' : user?.role === 'expert' ? 'Expert Dashboard' : user?.role === 'admin' ? 'Admin' : 'Dashboard',
          tabBarLabel: 'Dashboard'
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ title: 'Messages', tabBarLabel: 'Messages' }}
      />
      <Tab.Screen
        name="Experts"
        component={ExpertsScreen}
        options={{ title: 'Find Experts', tabBarLabel: 'Experts' }}
      />
    </Tab.Navigator>
  );
}
