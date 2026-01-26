import { useQuery } from '@tanstack/react-query';
import { Network, CheckCircle, AlertCircle, Wifi, Server, Globe } from 'lucide-react';
import * as api from '../services/api';

const NETWORKS = [
  {
    key: 'zkevm-mainnet',
    name: 'Polygon zkEVM Mainnet',
    chainId: 1101,
    rpcUrl: 'https://zkevm-rpc.com',
    explorer: 'https://explorer.mainnet.zkevm-rpc.com',
    type: 'mainnet',
  },
  {
    key: 'zkevm-testnet',
    name: 'Polygon zkEVM Cardona',
    chainId: 2442,
    rpcUrl: 'https://rpc.cardona.zkevm-rpc.com',
    explorer: 'https://explorer.cardona.zkevm-rpc.com',
    type: 'testnet',
  },
  {
    key: 'amoy',
    name: 'Polygon Amoy Testnet',
    chainId: 80002,
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    explorer: 'https://amoy.polygonscan.com',
    type: 'testnet',
    active: true,
  },
];

export default function NetworkPage() {
  const { data: health, isLoading, error } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
    refetchInterval: 10000,
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Network Status</h1>
          <p className="subtitle">Blockchain connection and configuration</p>
        </div>
      </div>

      {/* Connection Status */}
      <div className="card status-card">
        <div className="status-header">
          <h3>Connection Status</h3>
          {isLoading && <span className="status-loading">Checking...</span>}
        </div>
        
        {error ? (
          <div className="status-content error">
            <AlertCircle size={48} />
            <div>
              <h4>API Not Connected</h4>
              <p>Cannot reach the backend API. Make sure to run:</p>
              <code>npm run api</code>
            </div>
          </div>
        ) : health ? (
          <div className="status-content connected">
            <CheckCircle size={48} />
            <div>
              <h4>API Connected</h4>
              <div className="status-details">
                <span className={`mode-badge ${health.simulationMode ? 'simulation' : 'live'}`}>
                  {health.simulationMode ? '🔄 Simulation Mode' : '⛓️ Live Blockchain'}
                </span>
                <span className="timestamp">Last check: {new Date(health.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Mode Info */}
      <div className="card info-card">
        <h3>
          {health?.simulationMode ? '🔄 Simulation Mode' : '⛓️ Live Blockchain Mode'}
        </h3>
        {health?.simulationMode ? (
          <div className="mode-info">
            <p>
              Transactions are being simulated locally. No actual blockchain transactions are sent.
              This is useful for development and testing.
            </p>
            <div className="mode-actions">
              <p><strong>To enable live blockchain:</strong></p>
              <ol>
                <li>Set your private key: <code>export PRIVATE_KEY=0x...</code></li>
                <li>Run: <code>node src/cli.js network:connect</code></li>
                <li>Restart the API server</li>
              </ol>
            </div>
          </div>
        ) : (
          <div className="mode-info">
            <p>
              Connected to live blockchain! Transactions are being anchored to Polygon Amoy Testnet.
              Each event will have a verifiable transaction hash.
            </p>
          </div>
        )}
      </div>

      {/* Available Networks */}
      <div className="card">
        <h3>Available Networks</h3>
        <div className="networks-grid">
          {NETWORKS.map((network) => (
            <div 
              key={network.key} 
              className={`network-card ${network.active ? 'active' : ''}`}
            >
              <div className="network-header">
                <Network size={24} />
                <span className={`network-type ${network.type}`}>{network.type}</span>
              </div>
              <h4>{network.name}</h4>
              <div className="network-details">
                <div className="network-detail">
                  <Server size={14} />
                  <span>Chain ID: {network.chainId}</span>
                </div>
                <div className="network-detail">
                  <Wifi size={14} />
                  <code>{network.rpcUrl}</code>
                </div>
                <div className="network-detail">
                  <Globe size={14} />
                  <a href={network.explorer} target="_blank" rel="noopener noreferrer">
                    Block Explorer ↗
                  </a>
                </div>
              </div>
              {network.active && (
                <div className="network-active-badge">
                  <CheckCircle size={16} />
                  Active
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CLI Commands */}
      <div className="card">
        <h3>CLI Commands</h3>
        <div className="cli-commands">
          <div className="cli-command">
            <code>node src/cli.js network:info</code>
            <span>Show current network</span>
          </div>
          <div className="cli-command">
            <code>node src/cli.js network:list</code>
            <span>List available networks</span>
          </div>
          <div className="cli-command">
            <code>node src/cli.js network:switch amoy</code>
            <span>Switch to mainnet</span>
          </div>
          <div className="cli-command">
            <code>node src/cli.js network:connect</code>
            <span>Connect wallet (requires PRIVATE_KEY)</span>
          </div>
        </div>
      </div>

      {/* Faucet Info */}
      <div className="info-box">
        <h4>💧 Need Test MATIC?</h4>
        <p>
          Get free testnet MATIC for Polygon Amoy at: 
          <a href="https://faucet.polygon.technology/" target="_blank" rel="noopener noreferrer">
            faucet.polygon.technology ↗
          </a>
        </p>
      </div>
    </div>
  );
}
