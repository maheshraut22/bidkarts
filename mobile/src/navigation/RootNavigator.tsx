// BidKarts Mobile - Root Navigator

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../utils/AuthContext';
import { ActivityIndicator, View } from 'react-native';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

// Main Tab Navigator
import MainTabNavigator from './MainTabNavigator';

// Detail Screens
import ProjectDetailScreen from '../screens/projects/ProjectDetailScreen';
import VendorDetailScreen from '../screens/vendors/VendorDetailScreen';
import ExpertDetailScreen from '../screens/experts/ExpertDetailScreen';
import ChatScreen from '../screens/messages/ChatScreen';
import CheckoutScreen from '../screens/payments/CheckoutScreen';
import BidComparisonScreen from '../screens/projects/BidComparisonScreen';
import PostProjectScreen from '../screens/projects/PostProjectScreen';
import EditProjectScreen from '../screens/projects/EditProjectScreen';
import BookExpertScreen from '../screens/experts/BookExpertScreen';
import NotificationsScreen from '../screens/common/NotificationsScreen';
import ProfileScreen from '../screens/common/ProfileScreen';
import DisputeScreen from '../screens/common/DisputeScreen';
import AIToolsScreen from '../screens/common/AIToolsScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: '#1e293b',
        headerTitleStyle: { fontWeight: '700', fontSize: 16 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#f8fafc' },
      }}
    >
      {!isLoggedIn ? (
        // Auth Stack
        <Stack.Group>
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Register"
            component={RegisterScreen}
            options={{ title: 'Create Account' }}
          />
        </Stack.Group>
      ) : (
        // Main App Stack
        <Stack.Group>
          <Stack.Screen
            name="Main"
            component={MainTabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ProjectDetail"
            component={ProjectDetailScreen}
            options={{ title: 'Project Details' }}
          />
          <Stack.Screen
            name="VendorDetail"
            component={VendorDetailScreen}
            options={{ title: 'Vendor Profile' }}
          />
          <Stack.Screen
            name="ExpertDetail"
            component={ExpertDetailScreen}
            options={{ title: 'Expert Profile' }}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={({ route }: any) => ({ title: route.params?.title || 'Chat' })}
          />
          <Stack.Screen
            name="Checkout"
            component={CheckoutScreen}
            options={{ title: 'Payment' }}
          />
          <Stack.Screen
            name="BidComparison"
            component={BidComparisonScreen}
            options={{ title: 'Compare Bids' }}
          />
          <Stack.Screen
            name="PostProject"
            component={PostProjectScreen}
            options={{ title: 'Post Project' }}
          />
          <Stack.Screen
            name="EditProject"
            component={EditProjectScreen}
            options={{ title: 'Edit Project' }}
          />
          <Stack.Screen
            name="BookExpert"
            component={BookExpertScreen}
            options={{ title: 'Book Expert' }}
          />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ title: 'Notifications' }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ title: 'My Profile' }}
          />
          <Stack.Screen
            name="Dispute"
            component={DisputeScreen}
            options={{ title: 'Raise Dispute' }}
          />
          <Stack.Screen
            name="AITools"
            component={AIToolsScreen}
            options={{ title: 'AI Tools' }}
          />
        </Stack.Group>
      )}
    </Stack.Navigator>
  );
}
