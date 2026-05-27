import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { X, ExternalLink, Download, Copy, CheckCircle } from 'lucide-react';
import {
  describeUntpCredential,
  getUntpApiPath,
  getUntpViewerPath,
  type UntpCredentialTarget,
} from '../utils/untpCredentials';

interface UntpCredentialModalProps {
  target: UntpCredentialTarget;
  onClose: () => void;
}

export default function UntpCredentialModal({ target, onClose }: UntpCredentialModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [credential, setCredential] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const viewerPath = getUntpViewerPath(target);
  const viewerUrl = `${window.location.origin}${window.location.pathname}#${viewerPath}`;
  const apiBase = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000/api`;
  const serverBase = apiBase.replace(/\/api\/?$/, '');
  const credentialUrl = `${serverBase}${getUntpApiPath(target)}`;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(credentialUrl, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('gp_access_token') || ''}`,
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setCredential(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [credentialUrl]);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, viewerUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    });
  }, [viewerUrl]);

  const description = describeUntpCredential(target, credential);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${target.entityType}-${target.kind}-vc-${target.id.slice(0, 12)}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(viewerUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel qr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{description?.qrTitle || 'UNTP Credential'}</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="qr-modal-body">
          <div className="qr-modal-left qr-modal-left-full">
            <canvas ref={canvasRef} />
            <p className="qr-caption">{description?.qrCaption || 'Scan to open this UNTP credential'}</p>
            <div className="qr-actions">
              <button className="btn btn-secondary btn-sm" onClick={handleDownload}>
                <Download size={14} /> Download
              </button>
              <button className="btn btn-secondary btn-sm" onClick={handleCopyUrl}>
                {copied ? <CheckCircle size={14} color="#4caf50" /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy URL'}
              </button>
              <a
                className="btn btn-secondary btn-sm"
                href={viewerUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={14} /> Open VC
              </a>
            </div>
            {loading && <div className="qr-loading">Loading credential…</div>}
            {error && <div className="error-message">Could not load credential: {error}</div>}
            {!loading && !error && description && (
              <div className="qr-compact-note">
                <div className="qr-compact-title">{description.title}</div>
                <div className="qr-compact-text">
                  Use the QR code to scan on another device, or open the full UNTP credential in a new window.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
