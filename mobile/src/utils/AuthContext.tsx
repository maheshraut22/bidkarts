// BidKarts Mobile - Auth Context & State Management

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthAPI, UsersAPI } from '../services/api';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'customer' | 'vendor' | 'expert' | 'admin';
  phone?: string;
  avatar_url?: string;
  subscription_plan?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: any) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  async function loadStoredAuth() {
    try {
      const storedToken = await AsyncStorage.getItem('bk_token');
      const storedUser = await AsyncStorage.getItem('bk_user');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch (e) {
      console.error('Auth load error:', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const { data } = await AuthAPI.login(email, password);
    await AsyncStorage.setItem('bk_token', data.token);
    await AsyncStorage.setItem('bk_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }

  async function register(payload: any) {
    const { data } = await AuthAPI.register(payload);
    await AsyncStorage.setItem('bk_token', data.token);
    await AsyncStorage.setItem('bk_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  }

  async function logout() {
    await AsyncStorage.removeItem('bk_token');
    await AsyncStorage.removeItem('bk_user');
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    try {
      const { data } = await UsersAPI.me();
      const updatedUser = data.user;
      await AsyncStorage.setItem('bk_user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    } catch (e) {
      console.error('Refresh user error:', e);
    }
  }

  return (
    <AuthContext.Provider value={{
      user, token,
      isLoggedIn: !!token && !!user,
      isLoading,
      login, register, logout, refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
