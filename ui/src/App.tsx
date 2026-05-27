import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Parties from './pages/Parties';
import Facilities from './pages/Facilities';
import Batches from './pages/Batches';
import BatchDetail from './pages/BatchDetail';
import Documents from './pages/Documents';
import Verify from './pages/Verify';
import Audit from './pages/Audit';
import Network from './pages/Network';
import OnChainTraceability from './pages/OnChainTraceability';
import Login from './pages/Login';
import Register from './pages/Register';
import ChangePassword from './pages/ChangePassword';
import Profile from './pages/Profile';
import UserManagement from './pages/UserManagement';
import OreCredential from './pages/OreCredential';
import { DEFAULT_AUTHENTICATED_ROUTE } from './config/navigation';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <Routes>
            {/* Public routes — no layout, no auth */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/vc/ore/:id" element={<OreCredential />} />

            {/* Protected routes — wrapped in Layout + ProtectedRoute */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Routes>
                      <Route
                        path="/"
                        element={
                          import.meta.env.PROD
                            ? <Navigate to={DEFAULT_AUTHENTICATED_ROUTE} replace />
                            : <Dashboard />
                        }
                      />
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/parties" element={<Parties />} />
                      <Route path="/facilities" element={<Facilities />} />
                      <Route path="/batches" element={<Batches />} />
                      <Route path="/batches/:batchId" element={<BatchDetail />} />
                      <Route path="/documents" element={<Documents />} />
                      <Route path="/verify" element={<Verify />} />
                      <Route path="/audit" element={<Audit />} />
                      <Route path="/network" element={<Network />} />
                      <Route path="/traceability" element={<OnChainTraceability />} />
                      <Route path="/profile" element={<Profile />} />
                      <Route path="/users" element={<UserManagement />} />
                    </Routes>
                  </Layout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
