import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Building, MapPin, User, Users } from 'lucide-react';
import * as api from '../services/api';
import type { Party } from '../types';
import { PARTY_TYPES } from '../types';

export default function Parties() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: parties = [], isLoading, error } = useQuery({
    queryKey: ['parties'],
    queryFn: api.getParties,
  });

  const createMutation = useMutation({
    mutationFn: api.createParty,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setShowForm(false);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      legalName: formData.get('legalName') as string,
      partyType: formData.get('partyType') as string,
      country: formData.get('country') as string,
      registrationId: formData.get('registrationId') as string || undefined,
      contactName: formData.get('contactName') as string || undefined,
      contactEmail: formData.get('contactEmail') as string || undefined,
    });
  };

  if (isLoading) return <div className="loading">Loading parties...</div>;
  if (error) return <div className="error">Error: {(error as Error).message}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Parties</h1>
          <p className="subtitle">Manage supply chain participants</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={20} />
          Add Party
        </button>
      </div>

      {showForm && (
        <div className="card form-card">
          <h3>Register New Party</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="legalName">Legal Name *</label>
                <input type="text" id="legalName" name="legalName" required placeholder="Company name" />
              </div>
              <div className="form-group">
                <label htmlFor="partyType">Party Type *</label>
                <select id="partyType" name="partyType" required>
                  {PARTY_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="country">Country *</label>
                <input type="text" id="country" name="country" required placeholder="e.g., Peru" />
              </div>
              <div className="form-group">
                <label htmlFor="registrationId">Registration ID</label>
                <input type="text" id="registrationId" name="registrationId" placeholder="Business registration" />
              </div>
              <div className="form-group">
                <label htmlFor="contactName">Contact Name</label>
                <input type="text" id="contactName" name="contactName" placeholder="Contact person" />
              </div>
              <div className="form-group">
                <label htmlFor="contactEmail">Contact Email</label>
                <input type="email" id="contactEmail" name="contactEmail" placeholder="email@example.com" />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Party'}
              </button>
            </div>
            {createMutation.isError && (
              <div className="error-message">{(createMutation.error as Error).message}</div>
            )}
          </form>
        </div>
      )}

      <div className="cards-grid">
        {parties.map((party: Party) => (
          <div key={party.partyId} className="card party-card">
            <div className="card-header">
              <span className={`badge badge-${party.partyType.toLowerCase()}`}>
                {party.partyType}
              </span>
            </div>
            <h3>{party.legalName}</h3>
            <div className="card-details">
              <div className="detail">
                <MapPin size={16} />
                <span>{party.country}</span>
              </div>
              {party.registrationId && (
                <div className="detail">
                  <Building size={16} />
                  <span>{party.registrationId}</span>
                </div>
              )}
              {party.contact?.name && (
                <div className="detail">
                  <User size={16} />
                  <span>{party.contact.name}</span>
                </div>
              )}
            </div>
            <div className="card-footer">
              <code className="id-code">{party.partyId.slice(0, 8)}...</code>
              <span className="date">{new Date(party.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
        {parties.length === 0 && (
          <div className="empty-state">
            <Users size={48} />
            <h3>No parties yet</h3>
            <p>Register your first party to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}
