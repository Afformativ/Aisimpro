import { useQuery } from '@tanstack/react-query';
import { Clock, User, FileText, Database, Filter } from 'lucide-react';
import * as api from '../services/api';
import type { AuditLogEntry } from '../types';
import { useState } from 'react';

export default function Audit() {
  const [filter, setFilter] = useState('');

  const { data: auditLog = [], isLoading, error } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.getAuditLog(),
  });

  const filteredLog = filter
    ? auditLog.filter((entry: AuditLogEntry) => 
        entry.entityType.toLowerCase().includes(filter.toLowerCase()) ||
        entry.action.toLowerCase().includes(filter.toLowerCase())
      )
    : auditLog;

  if (isLoading) return <div className="loading">Loading audit log...</div>;
  if (error) return <div className="error">Error: {(error as Error).message}</div>;

  const getActionIcon = (action: string) => {
    if (action.includes('CREATE')) return <Database size={16} />;
    if (action.includes('UPDATE')) return <FileText size={16} />;
    return <Clock size={16} />;
  };

  const getActionColor = (action: string) => {
    if (action.includes('CREATE')) return 'action-create';
    if (action.includes('UPDATE')) return 'action-update';
    if (action.includes('DELETE')) return 'action-delete';
    return 'action-other';
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Audit Log</h1>
          <p className="subtitle">Complete history of all system actions</p>
        </div>
      </div>

      <div className="card filter-card">
        <div className="filter-group">
          <Filter size={20} />
          <input
            type="text"
            placeholder="Filter by action or entity type..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="filter-input"
          />
        </div>
        <div className="audit-stats">
          <span className="stat">{auditLog.length} total entries</span>
          {filter && <span className="stat">{filteredLog.length} matching</span>}
        </div>
      </div>

      <div className="table-container">
        <table className="data-table audit-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Entity Type</th>
              <th>Entity ID</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredLog.map((entry: AuditLogEntry, index: number) => (
              <tr key={index}>
                <td>
                  <div className="timestamp-cell">
                    <Clock size={14} />
                    {new Date(entry.timestamp).toLocaleString()}
                  </div>
                </td>
                <td>
                  <span className={`action-badge ${getActionColor(entry.action)}`}>
                    {getActionIcon(entry.action)}
                    {entry.action}
                  </span>
                </td>
                <td>
                  <span className="entity-type">{entry.entityType}</span>
                </td>
                <td>
                  <code className="entity-id">{entry.entityId.slice(0, 12)}...</code>
                </td>
                <td>
                  <div className="details-cell">
                    {Object.entries(entry.details || {}).slice(0, 3).map(([key, value]) => (
                      <span key={key} className="detail-tag">
                        {key}: {typeof value === 'string' ? value.slice(0, 20) : String(value)}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredLog.length === 0 && (
          <div className="empty-state">
            <FileText size={48} />
            <h3>No audit entries</h3>
            <p>{filter ? 'No entries match your filter' : 'Actions will appear here'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
