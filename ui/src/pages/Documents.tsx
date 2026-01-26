import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, Lock, Eye, Hash } from 'lucide-react';
import * as api from '../services/api';
import type { Document } from '../types';
import { DOCUMENT_TYPES } from '../types';

export default function Documents() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  // We don't have a getDocuments endpoint, so we'll track locally created ones
  const [documents, setDocuments] = useState<Document[]>([]);

  const createMutation = useMutation({
    mutationFn: api.createDocument,
    onSuccess: (newDoc) => {
      setDocuments([...documents, newDoc]);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      documentType: formData.get('documentType') as string,
      description: formData.get('description') as string,
      content: formData.get('content') as string,
      issuedBy: formData.get('issuedBy') as string || undefined,
      issuedAt: formData.get('issuedAt') as string || undefined,
      confidentiality: formData.get('confidentiality') as string || 'Restricted',
    });
  };

  const getConfidentialityIcon = (level: string) => {
    switch (level) {
      case 'Public': return <Eye size={16} />;
      case 'Restricted': return <Lock size={16} />;
      case 'Confidential': return <Lock size={16} className="text-danger" />;
      default: return <Eye size={16} />;
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Documents</h1>
          <p className="subtitle">Register and hash supporting documents</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={20} />
          Register Document
        </button>
      </div>

      {showForm && (
        <div className="card form-card">
          <h3>Register New Document</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="documentType">Document Type *</label>
                <select id="documentType" name="documentType" required>
                  {DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="confidentiality">Confidentiality *</label>
                <select id="confidentiality" name="confidentiality" required defaultValue="Restricted">
                  <option value="Public">Public</option>
                  <option value="Restricted">Restricted</option>
                  <option value="Confidential">Confidential</option>
                </select>
              </div>
              <div className="form-group full-width">
                <label htmlFor="description">Description *</label>
                <input type="text" id="description" name="description" required placeholder="Document description" />
              </div>
              <div className="form-group full-width">
                <label htmlFor="content">Content *</label>
                <textarea 
                  id="content" 
                  name="content" 
                  required 
                  rows={4}
                  placeholder="Document content (will be hashed)"
                />
              </div>
              <div className="form-group">
                <label htmlFor="issuedBy">Issued By</label>
                <input type="text" id="issuedBy" name="issuedBy" placeholder="Issuing authority" />
              </div>
              <div className="form-group">
                <label htmlFor="issuedAt">Issue Date</label>
                <input type="date" id="issuedAt" name="issuedAt" />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Registering...' : 'Register Document'}
              </button>
            </div>
            {createMutation.isError && (
              <div className="error-message">{(createMutation.error as Error).message}</div>
            )}
          </form>
        </div>
      )}

      <div className="cards-grid">
        {documents.map((doc: Document) => (
          <div key={doc.documentId} className="card document-card">
            <div className="card-header">
              <span className={`badge badge-${doc.documentType.toLowerCase().replace(/\s+/g, '-')}`}>
                {doc.documentType}
              </span>
              <span className={`confidentiality-badge conf-${doc.confidentialityLevel.toLowerCase()}`}>
                {getConfidentialityIcon(doc.confidentialityLevel)}
                {doc.confidentialityLevel}
              </span>
            </div>
            <h3>{doc.fileName}</h3>
            <div className="card-details">
              {doc.issuerPartyId && (
                <div className="detail">
                  <FileText size={16} />
                  <span>Issued by: {doc.issuerPartyId.slice(0, 8)}...</span>
                </div>
              )}
              <div className="detail hash-detail">
                <Hash size={16} />
                <code>{doc.sha256Hash.slice(0, 24)}...</code>
              </div>
            </div>
            <div className="card-footer">
              <code className="id-code">{doc.documentId.slice(0, 8)}...</code>
              <span className="date">{new Date(doc.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
        {documents.length === 0 && (
          <div className="empty-state">
            <FileText size={48} />
            <h3>No documents yet</h3>
            <p>Register documents to attach to batches</p>
          </div>
        )}
      </div>

      <div className="info-box">
        <h4>💡 How Documents Work</h4>
        <p>
          Documents are hashed using SHA-256 and can be attached to batches. 
          The hash is anchored to the blockchain, providing tamper-evident proof.
          Original document content stays off-chain for privacy.
        </p>
      </div>
    </div>
  );
}
