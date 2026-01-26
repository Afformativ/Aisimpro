import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Package, Scale, MapPin, Truck, CheckCircle, AlertTriangle, Eye } from 'lucide-react';
import * as api from '../services/api';
import type { Batch, Party, Facility } from '../types';

export default function Batches() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: batches = [], isLoading, error } = useQuery({
    queryKey: ['batches'],
    queryFn: api.getBatches,
  });

  const { data: parties = [] } = useQuery({
    queryKey: ['parties'],
    queryFn: api.getParties,
  });

  const { data: facilities = [] } = useQuery({
    queryKey: ['facilities'],
    queryFn: api.getFacilities,
  });

  const createMutation = useMutation({
    mutationFn: api.createBatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      setShowForm(false);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      referenceNumber: formData.get('referenceNumber') as string,
      commodity: formData.get('commodity') as string,
      originFacilityId: formData.get('originFacilityId') as string,
      originPartyId: formData.get('originPartyId') as string,
      weightKg: parseFloat(formData.get('weightKg') as string),
      purityPercent: formData.get('purityPercent') 
        ? parseFloat(formData.get('purityPercent') as string) 
        : undefined,
    });
  };

  const getPartyName = (partyId: string) => {
    const party = parties.find((p: Party) => p.partyId === partyId);
    return party?.legalName || partyId?.slice(0, 8) + '...';
  };

  const getFacilityName = (facilityId: string) => {
    const facility = facilities.find((f: Facility) => f.facilityId === facilityId);
    return facility?.facilityName || facilityId?.slice(0, 8) + '...';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Created': return <Package size={16} />;
      case 'InTransit': return <Truck size={16} />;
      case 'Received': return <CheckCircle size={16} />;
      case 'Dispute': return <AlertTriangle size={16} />;
      default: return <Package size={16} />;
    }
  };

  if (isLoading) return <div className="loading">Loading batches...</div>;
  if (error) return <div className="error">Error: {(error as Error).message}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Batches</h1>
          <p className="subtitle">Track gold batches through the supply chain</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={20} />
          Create Batch
        </button>
      </div>

      {showForm && (
        <div className="card form-card">
          <h3>Create New Batch at Mine</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="referenceNumber">Reference Number *</label>
                <input type="text" id="referenceNumber" name="referenceNumber" required placeholder="e.g., BATCH-2024-001" />
              </div>
              <div className="form-group">
                <label htmlFor="commodity">Commodity *</label>
                <input type="text" id="commodity" name="commodity" required defaultValue="Gold Doré" placeholder="e.g., Gold Doré" />
              </div>
              <div className="form-group">
                <label htmlFor="originFacilityId">Origin Facility *</label>
                <select id="originFacilityId" name="originFacilityId" required>
                  <option value="">Select facility...</option>
                  {facilities.filter((f: Facility) => f.facilityType === 'Mine').map((facility: Facility) => (
                    <option key={facility.facilityId} value={facility.facilityId}>
                      {facility.facilityName} ({facility.location?.country})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="originPartyId">Origin Party *</label>
                <select id="originPartyId" name="originPartyId" required>
                  <option value="">Select party...</option>
                  {parties.filter((p: Party) => p.partyType === 'MineOperator').map((party: Party) => (
                    <option key={party.partyId} value={party.partyId}>
                      {party.legalName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="weightKg">Weight (kg) *</label>
                <input type="number" id="weightKg" name="weightKg" required step="0.01" min="0" placeholder="25.5" />
              </div>
              <div className="form-group">
                <label htmlFor="purityPercent">Purity (%)</label>
                <input type="number" id="purityPercent" name="purityPercent" step="0.01" min="0" max="100" placeholder="95.5" />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Batch'}
              </button>
            </div>
            {createMutation.isError && (
              <div className="error-message">{(createMutation.error as Error).message}</div>
            )}
          </form>
        </div>
      )}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Commodity</th>
              <th>Weight</th>
              <th>Status</th>
              <th>Origin</th>
              <th>Current Custodian</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch: Batch) => (
              <tr 
                key={batch.batchId} 
                onClick={() => navigate(`/batches/${batch.batchId}`)}
                style={{ cursor: 'pointer' }}
              >
                <td>
                  <code className="ref-code">{batch.externalReferenceNumber || batch.referenceNumber || batch.batchId.slice(0, 12) + '...'}</code>
                </td>
                <td>{batch.commodityType || batch.commodity || 'Gold'}</td>
                <td>
                  <div className="weight-cell">
                    <Scale size={14} />
                    {batch.weightKg || batch.quantity?.weight || '-'} {batch.quantity?.unit || 'kg'}
                    {(batch.purityPercent || batch.declaredAssay?.value) && (
                      <span className="purity">({batch.purityPercent || batch.declaredAssay?.value}%)</span>
                    )}
                  </div>
                </td>
                <td>
                  <span className={`status-badge status-${batch.status.toLowerCase()}`}>
                    {getStatusIcon(batch.status)}
                    {batch.status}
                  </span>
                </td>
                <td>
                  <div className="cell-with-icon">
                    <MapPin size={14} />
                    {getFacilityName(batch.originFacilityId)}
                  </div>
                </td>
                <td>
                  {batch.currentCustodianId ? getPartyName(batch.currentCustodianId) : '-'}
                </td>
                <td>{new Date(batch.createdAt || batch.creationTimestamp || '').toLocaleDateString()}</td>
                <td>
                  <button 
                    className="action-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/batches/${batch.batchId}`);
                    }}
                  >
                    <Eye size={14} />
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {batches.length === 0 && (
          <div className="empty-state">
            <Package size={48} />
            <h3>No batches yet</h3>
            <p>Create your first batch to start tracking</p>
          </div>
        )}
      </div>
    </div>
  );
}
