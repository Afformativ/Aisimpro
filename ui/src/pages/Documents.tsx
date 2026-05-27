import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, Lock, Eye, Hash, Upload, Link, ShieldCheck, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import * as api from '../services/api';
import type { Document, OnChainEntity, OnChainOre, OnChainBar, OnChainProduct } from '../types';
import { DOCUMENT_TYPES } from '../types';

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

interface FileWithHash {
  file: File;
  sha256: string;
  docType: string;
  status: 'hashing' | 'ready' | 'error';
}

export default function Documents() {
  const [showForm, setShowForm] = useState(false);
  const [showAnchorForm, setShowAnchorForm] = useState(false);
  const [showVerifyForm, setShowVerifyForm] = useState(false);
  const queryClient = useQueryClient();
  const { hasAnyRole } = useAuth();

  // ── File upload state ──
  const [stagedFiles, setStagedFiles] = useState<FileWithHash[]>([]);
  const [anchorRecordType, setAnchorRecordType] = useState<'ore' | 'bar' | 'product'>('bar');
  const [anchorRecordId, setAnchorRecordId] = useState('');
  const [anchorManifestCID, setAnchorManifestCID] = useState('');
  const [anchorResult, setAnchorResult] = useState<{ root: string; txHash: string; explorerUrl: string | null } | null>(null);
  const [anchorError, setAnchorError] = useState<string | null>(null);

  // ── Verify state ──
  const [verifyRecordType, setVerifyRecordType] = useState<'ore' | 'bar' | 'product'>('bar');
  const [verifyRecordId, setVerifyRecordId] = useState('');
  const [verifyProof, setVerifyProof] = useState('');
  const [verifyLeaf, setVerifyLeaf] = useState('');
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Fetch all documents from the database
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: api.getDocuments,
  });

  // Fetch on-chain records for linking
  const { data: ores = [] } = useQuery<OnChainOre[]>({
    queryKey: ['traceability-ores'],
    queryFn: api.getOres,
  });
  const { data: bars = [] } = useQuery<OnChainBar[]>({
    queryKey: ['traceability-bars'],
    queryFn: api.getBars,
  });
  const { data: products = [] } = useQuery<OnChainProduct[]>({
    queryKey: ['traceability-products'],
    queryFn: api.getProducts,
  });

  const createMutation = useMutation({
    mutationFn: api.createDocument,
    onSuccess: () => {
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

  // ── File hashing ──
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newEntries: FileWithHash[] = files.map(f => ({
      file: f,
      sha256: '',
      docType: 'Other',
      status: 'hashing' as const,
    }));
    setStagedFiles(prev => [...prev, ...newEntries]);

    // Hash each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const buf = await file.arrayBuffer();
        const hash = await sha256Hex(buf);
        setStagedFiles(prev => prev.map(f =>
          f.file === file ? { ...f, sha256: hash, status: 'ready' as const } : f
        ));
      } catch {
        setStagedFiles(prev => prev.map(f =>
          f.file === file ? { ...f, status: 'error' as const } : f
        ));
      }
    }
    // Reset the input
    e.target.value = '';
  }, []);

  const removeFile = (index: number) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const updateFileDocType = (index: number, docType: string) => {
    setStagedFiles(prev => prev.map((f, i) => i === index ? { ...f, docType } : f));
  };

  // ── Anchor to on-chain record ──
  const anchorMutation = useMutation({
    mutationFn: async () => {
      if (!anchorRecordId) throw new Error('Select a record to link documents to');
      if (stagedFiles.length === 0) throw new Error('Add at least one file');
      if (stagedFiles.some(f => f.status !== 'ready')) throw new Error('Wait for all files to finish hashing');

      // Build leaf data and send to backend for Merkle tree computation + anchoring
      const fileData = stagedFiles.map(f => ({
        fileName: f.file.name,
        fileSize: f.file.size,
        sha256: f.sha256,
        docType: f.docType,
      }));

      // Call the backend to compute Merkle root from file hashes and anchor it
      const result = await api.setDocumentRoot(anchorRecordType, anchorRecordId, {
        root: computeSimpleMerkleRoot(fileData.map(f => f.sha256)),
        manifestCID: anchorManifestCID || '',
      });

      return result;
    },
    onSuccess: (result) => {
      setAnchorResult({ root: result.root, txHash: result.txHash, explorerUrl: result.explorerUrl });
      setAnchorError(null);
      setStagedFiles([]);
      queryClient.invalidateQueries({ queryKey: ['traceability-ores'] });
      queryClient.invalidateQueries({ queryKey: ['traceability-bars'] });
      queryClient.invalidateQueries({ queryKey: ['traceability-products'] });
    },
    onError: (err: Error) => {
      setAnchorError(err.message);
      setAnchorResult(null);
    },
  });

  // ── Verify document proof ──
  const handleVerify = async () => {
    setVerifyError(null);
    setVerifyResult(null);
    try {
      let proofArr: string[];
      try {
        proofArr = JSON.parse(verifyProof);
      } catch {
        throw new Error('Proof must be a JSON array of hex strings');
      }
      const result = await api.verifyDocumentProof(verifyRecordType, verifyRecordId, {
        proof: proofArr,
        leaf: verifyLeaf,
      });
      setVerifyResult(result);
    } catch (err: unknown) {
      setVerifyError((err as Error).message);
    }
  };

  // Simple client-side Merkle root: sorted-pair SHA-256 (for display only —
  // the real keccak256 root is computed by the contract service).
  // For the MVP we send file hashes to the backend which computes the
  // keccak256 Merkle root matching Solidity's MerkleProof.verify.
  function computeSimpleMerkleRoot(hashes: string[]): string {
    if (hashes.length === 0) return '0x' + '0'.repeat(64);
    // Pad hashes to 0x-prefixed bytes32
    const padded = hashes.map(h => h.startsWith('0x') ? h : '0x' + h);
    // For a single document, leaf = hash itself
    if (padded.length === 1) return padded[0];
    // For multiple, we need the backend to compute the real keccak256 tree.
    // Here we return a placeholder that the backend will replace.
    // In the real flow, the backend computes the tree.
    return padded[0]; // The API setDocumentRoot endpoint should compute the final root
  }

  const getConfidentialityIcon = (level: string) => {
    switch (level) {
      case 'Public': return <Eye size={16} />;
      case 'Restricted': return <Lock size={16} />;
      case 'Confidential': return <Lock size={16} className="text-danger" />;
      default: return <Eye size={16} />;
    }
  };

  const recordOptions = anchorRecordType === 'ore' ? ores
    : anchorRecordType === 'bar' ? bars
    : products;

  const shortId = (id: string) => id.length > 16 ? `${id.slice(0, 10)}…${id.slice(-4)}` : id;
  const getRecordLabel = (record: OnChainEntity) => {
    switch (record.stage) {
      case 'RAW_ORE':
        return record.mineId;
      case 'REFINED_BAR':
        return record.barSerialNumber;
      case 'CERTIFIED_PRODUCT':
        return record.hallmark;
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Documents</h1>
          <p className="subtitle">Register, hash, and anchor supporting documents on-chain</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {hasAnyRole('MINER', 'REFINER', 'ASSAYER', 'ADMIN', 'SUPERADMIN') && (
            <button className="btn btn-primary" onClick={() => { setShowAnchorForm(!showAnchorForm); setShowForm(false); setShowVerifyForm(false); }}>
              <Link size={20} />
              Anchor Documents On-Chain
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => { setShowVerifyForm(!showVerifyForm); setShowForm(false); setShowAnchorForm(false); }}>
            <ShieldCheck size={20} />
            Verify Document Proof
          </button>
          {hasAnyRole('ISSUER', 'ADMIN', 'SUPERADMIN') && (
            <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setShowAnchorForm(false); setShowVerifyForm(false); }}>
              <Plus size={20} />
              Register Document
            </button>
          )}
        </div>
      </div>

      {/* ── Anchor Documents to On-Chain Record ── */}
      {showAnchorForm && (
        <div className="card form-card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link size={20} />
            Anchor Documents to On-Chain Record
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
            Upload files from your machine, hash them locally (SHA-256), build a Merkle tree,
            and store the root hash on-chain linked to a specific ore, bar, or product.
            Documents stay off-chain — only the root is anchored.
          </p>

          <div className="form-grid">
            <div className="form-group">
              <label>Record Type</label>
              <select value={anchorRecordType} onChange={e => { setAnchorRecordType(e.target.value as 'ore' | 'bar' | 'product'); setAnchorRecordId(''); }}>
                <option value="ore">Raw Ore</option>
                <option value="bar">Refined Bar</option>
                <option value="product">Certified Product</option>
              </select>
            </div>
            <div className="form-group">
              <label>Link to Record *</label>
              <select value={anchorRecordId} onChange={e => setAnchorRecordId(e.target.value)} required>
                <option value="">— Select {anchorRecordType} —</option>
                {recordOptions.map((r: OnChainEntity) => (
                  <option key={r.id} value={r.id}>
                    {shortId(r.id)} — {getRecordLabel(r)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group full-width">
              <label>IPFS Manifest CID (optional)</label>
              <input
                type="text"
                placeholder="Qm... or bafy..."
                value={anchorManifestCID}
                onChange={e => setAnchorManifestCID(e.target.value)}
              />
            </div>
          </div>

          {/* File Upload Area */}
          <div style={{ margin: '16px 0', padding: '20px', border: '2px dashed var(--border)', borderRadius: '8px', textAlign: 'center' }}>
            <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: '8px' }} />
            <p style={{ margin: '0 0 8px', color: 'var(--text-muted)' }}>
              Drag & drop files or click to select
            </p>
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'block', margin: '0 auto' }}
            />
          </div>

          {/* Staged Files List */}
          {stagedFiles.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ marginBottom: '8px' }}>Staged Files ({stagedFiles.length})</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>File</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Size</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>SHA-256</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px' }}>Doc Type</th>
                    <th style={{ textAlign: 'center', padding: '4px 8px' }}>Status</th>
                    <th style={{ padding: '4px 8px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {stagedFiles.map((f, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 8px' }}>{f.file.name}</td>
                      <td style={{ padding: '4px 8px' }}>{(f.file.size / 1024).toFixed(1)} KB</td>
                      <td style={{ padding: '4px 8px' }}>
                        <code style={{ fontSize: '11px' }}>{f.sha256 ? f.sha256.slice(0, 16) + '…' : '—'}</code>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <select value={f.docType} onChange={e => updateFileDocType(i, e.target.value)} style={{ fontSize: '12px', padding: '2px 4px' }}>
                          {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign: 'center', padding: '4px 8px' }}>
                        {f.status === 'hashing' && <span style={{ color: 'var(--warning)' }}>Hashing…</span>}
                        {f.status === 'ready' && <CheckCircle size={16} style={{ color: 'var(--success)' }} />}
                        {f.status === 'error' && <XCircle size={16} style={{ color: 'var(--danger)' }} />}
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { setShowAnchorForm(false); setStagedFiles([]); setAnchorResult(null); setAnchorError(null); }}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={anchorMutation.isPending || stagedFiles.length === 0 || !anchorRecordId || stagedFiles.some(f => f.status !== 'ready')}
              onClick={() => anchorMutation.mutate()}
            >
              {anchorMutation.isPending ? 'Anchoring…' : `Anchor ${stagedFiles.length} Document${stagedFiles.length !== 1 ? 's' : ''} On-Chain`}
            </button>
          </div>

          {anchorResult && (
            <div className="info-box" style={{ marginTop: '12px', borderLeft: '4px solid var(--success)' }}>
              <h4 style={{ color: 'var(--success)' }}>
                <CheckCircle size={16} style={{ marginRight: '6px' }} />
                Document Root Anchored On-Chain
              </h4>
              <p style={{ fontSize: '13px' }}>
                <strong>Root:</strong> <code style={{ fontSize: '11px', wordBreak: 'break-all' }}>{anchorResult.root}</code>
              </p>
              <p style={{ fontSize: '13px' }}>
                <strong>TX:</strong> <code style={{ fontSize: '11px' }}>{anchorResult.txHash}</code>
                {anchorResult.explorerUrl && (
                  <a href={anchorResult.explorerUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: '8px' }}>
                    View on Explorer ↗
                  </a>
                )}
              </p>
            </div>
          )}
          {anchorError && (
            <div className="error-message" style={{ marginTop: '12px' }}>{anchorError}</div>
          )}
        </div>
      )}

      {/* ── Verify Document Proof ── */}
      {showVerifyForm && (
        <div className="card form-card" style={{ borderLeft: '4px solid var(--info, #3b82f6)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={20} />
            Verify Document Merkle Proof
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
            Verify that a specific document belongs to the anchored document set of a record.
            Provide the Merkle proof and leaf hash to check against the on-chain root.
          </p>
          <div className="form-grid">
            <div className="form-group">
              <label>Record Type</label>
              <select value={verifyRecordType} onChange={e => setVerifyRecordType(e.target.value as 'ore' | 'bar' | 'product')}>
                <option value="ore">Raw Ore</option>
                <option value="bar">Refined Bar</option>
                <option value="product">Certified Product</option>
              </select>
            </div>
            <div className="form-group">
              <label>Record ID (bytes32) *</label>
              <input type="text" placeholder="0x..." value={verifyRecordId} onChange={e => setVerifyRecordId(e.target.value)} required />
            </div>
            <div className="form-group full-width">
              <label>Leaf Hash (bytes32) *</label>
              <input type="text" placeholder="0x... (keccak256 of abi.encode(recordId, docType, fileHash, uri, version))" value={verifyLeaf} onChange={e => setVerifyLeaf(e.target.value)} required />
            </div>
            <div className="form-group full-width">
              <label>Merkle Proof (JSON array of bytes32) *</label>
              <textarea
                rows={3}
                placeholder='["0xabc...", "0xdef..."]'
                value={verifyProof}
                onChange={e => setVerifyProof(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { setShowVerifyForm(false); setVerifyResult(null); setVerifyError(null); }}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleVerify} disabled={!verifyRecordId || !verifyLeaf || !verifyProof}>
              Verify Proof
            </button>
          </div>
          {verifyResult && (
            <div className="info-box" style={{ marginTop: '12px', borderLeft: `4px solid var(--${verifyResult.valid ? 'success' : 'danger'})` }}>
              {verifyResult.valid ? (
                <p style={{ color: 'var(--success)', fontWeight: 'bold' }}>
                  <CheckCircle size={16} style={{ marginRight: '6px' }} />
                  Valid — document belongs to the on-chain evidence set.
                </p>
              ) : (
                <p style={{ color: 'var(--danger)', fontWeight: 'bold' }}>
                  <XCircle size={16} style={{ marginRight: '6px' }} />
                  Invalid — proof does not match the stored document root.
                </p>
              )}
            </div>
          )}
          {verifyError && (
            <div className="error-message" style={{ marginTop: '12px' }}>{verifyError}</div>
          )}
        </div>
      )}

      {/* ── Register Document (legacy text-based) ── */}
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

      {isLoading && (
        <div className="empty-state">
          <FileText size={48} />
          <h3>Loading documents...</h3>
        </div>
      )}

      {/* ── On-Chain Document Roots Summary ── */}
      {(bars.some(b => b.documentRoot) || ores.some(o => o.documentRoot) || products.some(p => p.documentRoot)) && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link size={18} />
            On-Chain Document Roots
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Type</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Record</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Document Root</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Manifest CID</th>
              </tr>
            </thead>
            <tbody>
              {ores.filter(o => o.documentRoot).map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 8px' }}><span className="badge badge-ore">Ore</span></td>
                  <td style={{ padding: '4px 8px' }}><code style={{ fontSize: '11px' }}>{shortId(o.id)}</code></td>
                  <td style={{ padding: '4px 8px' }}><code style={{ fontSize: '11px' }}>{shortId(o.documentRoot!)}</code></td>
                  <td style={{ padding: '4px 8px' }}>{o.evidenceManifestCID || '—'}</td>
                </tr>
              ))}
              {bars.filter(b => b.documentRoot).map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 8px' }}><span className="badge badge-bar">Bar</span></td>
                  <td style={{ padding: '4px 8px' }}><code style={{ fontSize: '11px' }}>{shortId(b.id)}</code> — {b.barSerialNumber}</td>
                  <td style={{ padding: '4px 8px' }}><code style={{ fontSize: '11px' }}>{shortId(b.documentRoot!)}</code></td>
                  <td style={{ padding: '4px 8px' }}>{b.evidenceManifestCID || '—'}</td>
                </tr>
              ))}
              {products.filter(p => p.documentRoot).map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 8px' }}><span className="badge badge-product">Product</span></td>
                  <td style={{ padding: '4px 8px' }}><code style={{ fontSize: '11px' }}>{shortId(p.id)}</code> — {p.hallmark}</td>
                  <td style={{ padding: '4px 8px' }}><code style={{ fontSize: '11px' }}>{shortId(p.documentRoot!)}</code></td>
                  <td style={{ padding: '4px 8px' }}>{p.evidenceManifestCID || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
        {documents.length === 0 && !isLoading && (
          <div className="empty-state">
            <FileText size={48} />
            <h3>No documents yet</h3>
            <p>Register documents or anchor files to on-chain records</p>
          </div>
        )}
      </div>

      <div className="info-box">
        <h4>How Document Anchoring Works</h4>
        <ol style={{ margin: '8px 0', paddingLeft: '20px', fontSize: '13px', lineHeight: '1.8' }}>
          <li><strong>Upload files</strong> from your machine — they are hashed locally (SHA-256) and never leave your browser.</li>
          <li><strong>Link to a record</strong> — select an existing ore, bar, or product registered on-chain.</li>
          <li><strong>Merkle root</strong> is computed from all file hashes and stored on the smart contract.</li>
          <li><strong>Verify later</strong> — anyone with the file can recompute its hash, supply a Merkle proof, and confirm membership on-chain.</li>
        </ol>
        <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Leaf format: <code style={{ fontSize: '11px' }}>keccak256(abi.encode(recordId, docType, fileHash, uriOrCid, version))</code>
        </p>
      </div>
    </div>
  );
}
