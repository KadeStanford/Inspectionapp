import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { WebSocketProvider } from './contexts/WebSocketProvider';
import Layout from './components/Layout';
import theme from './theme';

// Components
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import InspectionForm from './pages/InspectionForm';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import StickerSettings from './pages/StickerSettings';
import LabelManager from './pages/LabelManager';
import History from './pages/History';
import Scanner from './pages/Scanner';
import QuickCheck from './pages/QuickCheck';
import QuickCheckDetail from './pages/QuickCheckDetail';
import QuickCheckDatabase from './pages/QuickCheckDatabase';
import QuickCheckRecords from './pages/QuickCheckRecords';
import Users from './pages/Users';
import BankDepositForm from './pages/BankDepositForm';
import BankDepositRecords from './pages/BankDepositRecords';
import DrawerCountForm from './pages/DrawerCountForm';
import DrawerSettings from './pages/DrawerSettings';
import CashAnalytics from './pages/CashAnalytics';
import StateInspectionRecords from './pages/StateInspectionRecords';
import Chat from './pages/Chat';

function App() {
  // Initialize token manager on app start
  // useEffect(() => {
  //   console.log('🚀 App starting - Token manager initialized');
  // }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <WebSocketProvider>
          <Router>
            <Routes>
              {/* Login Route */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              
              {/* Protected Routes */}
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <Routes>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/dashboard" element={<Home />} />
                        <Route path="/inspection" element={<InspectionForm />} />
                        <Route path="/quick-check" element={<QuickCheck />} />
                        <Route path="/quick-check/:id" element={<QuickCheckDetail />} />
                        <Route path="/quick-check-database" element={<QuickCheckDatabase />} />
                        <Route path="/quick-check-records" element={<QuickCheckRecords />} />
                        <Route path="/state-inspection-records" element={<StateInspectionRecords />} />
                        <Route path="/scanner" element={<Scanner />} />
                        <Route path="/history" element={<History />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/sticker-settings" element={<StickerSettings />} />
                        <Route path="/label-manager" element={<LabelManager />} />
                        <Route path="/users" element={<Users />} />
                        <Route path="/bank-deposit" element={<BankDepositForm />} />
                        <Route path="/bank-deposit-records" element={<BankDepositRecords />} />
                        <Route path="/drawer-count" element={<DrawerCountForm />} />
                        <Route path="/drawer-settings" element={<DrawerSettings />} />
                        <Route path="/cash-analytics" element={<CashAnalytics />} />
                        <Route path="/chat" element={<Chat />} />
                      </Routes>
                    </Layout>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Router>
        </WebSocketProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App; 