import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, MapPin, User, Building2 } from 'lucide-react';
import * as api from '../services/api';
import type { Facility, Party } from '../types';
import { FACILITY_TYPES } from '../types';

export default function Facilities() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: facilities = [], isLoading, error } = useQuery({
    queryKey: ['facilities'],
    queryFn: api.getFacilities,
  });

  const { data: parties = [] } = useQuery({
    queryKey: ['parties'],
    queryFn: api.getParties,
  });

  const createMutation = useMutation({
    mutationFn: api.createFacility,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] });
      setShowForm(false);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      facilityName: formData.get('facilityName') as string,
      facilityType: formData.get('facilityType') as string,
      operatorPartyId: formData.get('operatorPartyId') as string,
      country: formData.get('country') as string,
      address: formData.get('address') as string || undefined,
      gpsLat: formData.get('gpsLat') ? parseFloat(formData.get('gpsLat') as string) : undefined,
      gpsLng: formData.get('gpsLng') ? parseFloat(formData.get('gpsLng') as string) : undefined,
    });
  };

  const getPartyName = (partyId: string) => {
    const party = parties.find((p: Party) => p.partyId === partyId);
    return party?.legalName || partyId.slice(0, 8) + '...';
  };

  if (isLoading) return <div className="loading">Loading facilities...</div>;
  if (error) return <div className="error">Error: {(error as Error).message}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Facilities</h1>
          <p className="subtitle">Physical locations in the supply chain</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={20} />
          Add Facility
        </button>
      </div>

      {showForm && (
        <div className="card form-card">
          <h3>Register New Facility</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="facilityName">Facility Name *</label>
                <input type="text" id="facilityName" name="facilityName" required placeholder="e.g., Mine Site Alpha" />
              </div>
              <div className="form-group">
                <label htmlFor="facilityType">Facility Type *</label>
                <select id="facilityType" name="facilityType" required>
                  {FACILITY_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="operatorPartyId">Operator *</label>
                <select id="operatorPartyId" name="operatorPartyId" required>
                  <option value="">Select operator...</option>
                  {parties.map((party: Party) => (
                    <option key={party.partyId} value={party.partyId}>
                      {party.legalName} ({party.partyType})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="country">Country *</label>
                <input type="text" id="country" name="country" required placeholder="e.g., Peru" />
              </div>
              <div className="form-group full-width">
                <label htmlFor="address">Address</label>
                <input type="text" id="address" name="address" placeholder="Physical address" />
              </div>
              <div className="form-group">
                <label htmlFor="gpsLat">GPS Latitude</label>
                <input type="number" id="gpsLat" name="gpsLat" step="any" placeholder="-12.0464" />
              </div>
              <div className="form-group">
                <label htmlFor="gpsLng">GPS Longitude</label>
                <input type="number" id="gpsLng" name="gpsLng" step="any" placeholder="-77.0428" />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Facility'}
              </button>
            </div>
            {createMutation.isError && (
              <div className="error-message">{(createMutation.error as Error).message}</div>
            )}
          </form>
        </div>
      )}

      <div className="cards-grid">
        {facilities.map((facility: Facility) => (
          <div key={facility.facilityId} className="card facility-card">
            <div className="card-header">
              <span className={`badge badge-${facility.facilityType.toLowerCase()}`}>
                {facility.facilityType}
              </span>
            </div>
            <h3>{facility.facilityName}</h3>
            <div className="card-details">
              <div className="detail">
                <MapPin size={16} />
                <span>{facility.location?.country || 'Unknown'}</span>
              </div>
              {facility.operatorPartyId && (
                <div className="detail">
                  <User size={16} />
                  <span>{getPartyName(facility.operatorPartyId)}</span>
                </div>
              )}
              {facility.location?.region && (
                <div className="detail">
                  <Building2 size={16} />
                  <span>{facility.location.region}</span>
                </div>
              )}
            </div>
            <div className="card-footer">
              <code className="id-code">{facility.facilityId.slice(0, 8)}...</code>
              <span className="date">{new Date(facility.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
        {facilities.length === 0 && (
          <div className="empty-state">
            <Building2 size={48} />
            <h3>No facilities yet</h3>
            <p>Register your first facility to track locations</p>
          </div>
        )}
      </div>
    </div>
  );
}
