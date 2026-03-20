# BidKarts Mobile App 📱

React Native mobile application for the BidKarts marketplace platform, supporting both **Android** and **iOS**.

## 📋 Features Implemented

### ✅ Core Functionality
- **Authentication**: Login, Register with JWT token management
- **Home Feed**: Live projects ticker, service categories, quick stats
- **Project Browsing**: Search, filter by service type/location
- **Bid Management**: Submit bids, view bid comparison
- **Expert Booking**: Browse experts, book consultations
- **Real-time Chat**: Conversation list, message threads, file sharing
- **Payments**: Razorpay integration, GST invoices, escrow management
- **Notifications**: Push notifications, in-app notification center
- **Dashboard**: Role-specific dashboards (Customer/Vendor/Expert/Admin)

### 🔐 Security
- JWT token stored securely in AsyncStorage
- Sensitive info masking in chat (phone/email/address → masked)
- Role-based navigation and access control

### 💰 Business Logic
- Security deposit: 2% of project amount or ₹500 minimum
- Platform fee + 18% GST for vendors after bid acceptance
- Subscription limits: Free plan = 10 projects max
- Auto-assignment of experts when none selected

## 🚀 Setup Instructions

### Prerequisites
```bash
# Node.js 18+ required
node --version

# Android: Android Studio + JDK 17
# iOS: Xcode 14+ (macOS only)

# React Native CLI
npm install -g @react-native/cli
```

### Installation
```bash
cd mobile

# Install dependencies
npm install

# iOS only (macOS)
cd ios && pod install && cd ..
```

### Configuration
Edit `src/services/api.ts` and set your API URL:
```typescript
export const API_BASE_URL = 'https://your-bidkarts-app.pages.dev/api';
```

### Running the App

**Android:**
```bash
# Start Metro bundler
npm start

# In another terminal
npm run android
```

**iOS (macOS only):**
```bash
npm start
# In another terminal
npm run ios
```

## 📁 Project Structure

```
mobile/
├── App.tsx                    # Root component
├── index.js                   # Entry point
├── src/
│   ├── navigation/
│   │   ├── RootNavigator.tsx  # Auth/App stack navigator
│   │   └── MainTabNavigator.tsx # Bottom tab navigation
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   └── RegisterScreen.tsx
│   │   ├── home/
│   │   │   └── HomeScreen.tsx
│   │   ├── projects/
│   │   │   ├── ProjectsScreen.tsx
│   │   │   ├── ProjectDetailScreen.tsx
│   │   │   ├── PostProjectScreen.tsx
│   │   │   ├── EditProjectScreen.tsx
│   │   │   └── BidComparisonScreen.tsx
│   │   ├── vendors/
│   │   │   └── VendorDetailScreen.tsx
│   │   ├── experts/
│   │   │   ├── ExpertsScreen.tsx
│   │   │   ├── ExpertDetailScreen.tsx
│   │   │   └── BookExpertScreen.tsx
│   │   ├── messages/
│   │   │   ├── MessagesScreen.tsx
│   │   │   └── ChatScreen.tsx
│   │   ├── payments/
│   │   │   └── CheckoutScreen.tsx
│   │   ├── dashboard/
│   │   │   └── DashboardScreen.tsx
│   │   └── common/
│   │       ├── NotificationsScreen.tsx
│   │       ├── ProfileScreen.tsx
│   │       ├── DisputeScreen.tsx
│   │       └── AIToolsScreen.tsx
│   ├── services/
│   │   └── api.ts             # All API calls
│   └── utils/
│       └── AuthContext.tsx    # Global auth state
```

## 🔌 API Integration

All API calls go through `src/services/api.ts`. The app connects to the same BidKarts backend:

| Module | Endpoints |
|--------|-----------|
| Auth | `/auth/login`, `/auth/register` |
| Projects | `/projects/*` |
| Bids | `/bids/*` |
| Consultations | `/consultations/*` |
| Inspections | `/inspections/*` |
| Payments | `/payments/*` |
| Messages | `/messages/*` |
| Users | `/users/*` |
| Admin | `/admin/*` |
| AI Tools | `/ai/*` |

## 📱 Screens Overview

| Screen | Role | Description |
|--------|------|-------------|
| Login | All | JWT auth with demo accounts |
| Register | New users | Customer/Vendor/Expert registration |
| Home | All | Live projects, service categories |
| Projects | All | Browse/search projects |
| Project Detail | All | Bids, documents, actions |
| Post Project | Customer | Multi-step project creation |
| Edit Project | Customer | Edit before first bid |
| Bid Comparison | Customer | Compare received bids |
| Vendor Detail | All | Vendor profile, reviews |
| Experts | All | Expert directory |
| Expert Detail | All | Profile, book consultation |
| Book Expert | Customer | Request consultation |
| Chat | All | Real-time messaging |
| Checkout | All | Razorpay payment flow |
| Dashboard | All | Role-specific dashboard |
| Notifications | All | Push/in-app notifications |
| Profile | All | Edit personal info |
| Dispute | All | Raise/view disputes |
| AI Tools | All | Cost estimator, spec generator |

## 🎨 Design System

- **Primary Color**: `#2563eb` (Blue)
- **Accent**: `#f97316` (Orange)
- **Background**: `#f8fafc`
- **Text**: `#1e293b` (Dark slate)
- **Success**: `#059669` (Green)
- **Font**: System (Inter on web)

## 🔔 Push Notifications

Uses `@notifee/react-native` for local and push notifications:
- New bid received
- Bid accepted/rejected
- Payment confirmation
- Expert consultation updates
- Chat messages
- Project status changes

## 💳 Payment Flow

1. Customer accepts bid → Security deposit modal (2% or ₹500)
2. Redirect to Razorpay checkout
3. Payment verified → Project status updated
4. Vendor pays platform fee (2% + 18% GST) to access documents
5. GST invoice auto-generated

## 🚀 Build for Production

**Android APK/AAB:**
```bash
cd android
./gradlew assembleRelease   # APK
./gradlew bundleRelease     # AAB (for Play Store)
```

**iOS IPA:**
```bash
# Open in Xcode
open ios/BidKarts.xcworkspace
# Product → Archive → Distribute App
```

## 📊 Deployment

- **Play Store**: Upload AAB to Google Play Console
- **App Store**: Upload IPA to App Store Connect  
- **Firebase App Distribution**: For beta testing
- **Expo**: Can also be wrapped in Expo for managed workflow

---

Built with ❤️ for the BidKarts marketplace platform.
