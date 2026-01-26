import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/parties" element={<Parties />} />
            <Route path="/facilities" element={<Facilities />} />
            <Route path="/batches" element={<Batches />} />
            <Route path="/batches/:batchId" element={<BatchDetail />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/network" element={<Network />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
