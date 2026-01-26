import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Package,
  Users,
  Building2,
  Activity,
  ArrowRight,
  CheckCircle,
  Clock,
  Truck,
  AlertCircle,
} from 'lucide-react';
import * as api from '../services/api';
import type { Batch, Party, Facility } from '../types';

export default function Dashboard() {
  const { data: parties = [] } = useQuery({
    queryKey: ['parties'],
    queryFn: api.getParties,
  });

  const { data: facilities = [] } = useQuery({
    queryKey: ['facilities'],
    queryFn: api.getFacilities,
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: api.getBatches,
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
    refetchInterval: 30000,
  });

  const stats = [
    {
      label: 'Active Batches',
      value: batches.length,
      icon: Package,
      color: 'blue',
      link: '/batches',
    },
    {
      label: 'Parties',
      value: parties.length,
      icon: Users,
      color: 'green',
      link: '/parties',
    },
    {
      label: 'Facilities',
      value: facilities.length,
      icon: Building2,
      color: 'purple',
      link: '/facilities',
    },
    {
      label: 'In Transit',
      value: batches.filter((b: Batch) => b.status === 'InTransit').length,
      icon: Truck,
      color: 'orange',
      link: '/batches',
    },
  ];

  const recentBatches = batches.slice(-5).reverse();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Created': return <Clock size={16} className="status-icon created" />;
      case 'InTransit': return <Truck size={16} className="status-icon in-transit" />;
      case 'Received': return <CheckCircle size={16} className="status-icon received" />;
      case 'Dispute': return <AlertCircle size={16} className="status-icon dispute" />;
      default: return <Clock size={16} />;
    }
  };

  return (
    <div className="page dashboard">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="subtitle">Gold Provenance Tracking Overview</p>
        </div>
        <div className="connection-status">
          {health ? (
            <span className={`status-badge ${health.simulationMode ? 'simulation' : 'live'}`}>
              <Activity size={16} />
              {health.simulationMode ? 'Simulation Mode' : 'Live on Amoy'}
            </span>
          ) : (
            <span className="status-badge offline">
              <AlertCircle size={16} />
              API Offline
            </span>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link to={stat.link} key={stat.label} className={`stat-card stat-${stat.color}`}>
              <div className="stat-icon">
                <Icon size={24} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stat.value}</div>
                <div className="stat-label">{stat.label}</div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="card quick-actions">
        <h3>Quick Actions</h3>
        <div className="actions-grid">
          <Link to="/parties" className="action-card">
            <Users size={32} />
            <span>Add Party</span>
          </Link>
          <Link to="/facilities" className="action-card">
            <Building2 size={32} />
            <span>Add Facility</span>
          </Link>
          <Link to="/batches" className="action-card">
            <Package size={32} />
            <span>Create Batch</span>
          </Link>
          <Link to="/verify" className="action-card">
            <CheckCircle size={32} />
            <span>Verify Batch</span>
          </Link>
        </div>
      </div>

      {/* Recent Batches */}
      <div className="card">
        <div className="card-header-row">
          <h3>Recent Batches</h3>
          <Link to="/batches" className="view-all">
            View All <ArrowRight size={16} />
          </Link>
        </div>
        {recentBatches.length > 0 ? (
          <div className="recent-list">
            {recentBatches.map((batch: Batch) => (
              <Link to={`/batches/${batch.batchId}`} key={batch.batchId} className="recent-item">
                <div className="recent-item-main">
                  <div className="recent-item-ref">
                    <Package size={16} />
                    <code>{batch.externalReferenceNumber || batch.referenceNumber}</code>
                  </div>
                  <span className="recent-item-commodity">{batch.commodityType || batch.commodity}</span>
                </div>
                <div className="recent-item-meta">
                  <span className="recent-item-weight">{batch.quantity?.weight || batch.weightKg} kg</span>
                  <span className={`status-pill status-${batch.status.toLowerCase()}`}>
                    {getStatusIcon(batch.status)}
                    {batch.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state-small">
            <Package size={32} />
            <p>No batches yet. Create your first batch to get started.</p>
            <Link to="/batches" className="btn btn-primary btn-sm">
              Create Batch
            </Link>
          </div>
        )}
      </div>

      {/* Getting Started */}
      {parties.length === 0 && (
        <div className="card getting-started">
          <h3>🚀 Getting Started</h3>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h4>Register Parties</h4>
                <p>Add mine operators, buyers, and transporters</p>
                <Link to="/parties" className="btn btn-sm btn-primary">Add Party</Link>
              </div>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h4>Create Facilities</h4>
                <p>Register mines, warehouses, and other locations</p>
                <Link to="/facilities" className="btn btn-sm btn-secondary">Add Facility</Link>
              </div>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h4>Create a Batch</h4>
                <p>Start tracking gold from the mine</p>
                <Link to="/batches" className="btn btn-sm btn-secondary">Create Batch</Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
