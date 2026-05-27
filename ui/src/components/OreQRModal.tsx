import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { X, ExternalLink, Download, Copy, CheckCircle } from 'lucide-react';

interface OreQRModalProps {
  oreId: string;
  onClose: () => void;
}

export default function OreQRModal({ oreId, onClose }: OreQRModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [credential, setCredential] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // QR points to the human-readable viewer page (public, no login needed).
  // Uses the current page's origin so it works on GitHub Pages, Render, and LAN.
  const viewerUrl = `${window.location.origin}${window.location.pathname}#/vc/ore/${oreId}`;

  // Raw API URL used internally to fetch the credential data to display.
  const apiBase = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000/api`;
  const serverBase = apiBase.replace(/\/api\/?$/, '');
  const credentialUrl = `${serverBase}/api/credentials/dte/ore/${oreId}`;

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
    return () => { cancelled = true; };
  }, [credentialUrl]);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, viewerUrl, {
      width: 220,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    });
  }, [viewerUrl]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `ore-vc-${oreId.slice(0, 12)}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(viewerUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Pull out the interesting UNTP fields from the credential
  const vc = credential as any;
  const subject = vc?.credentialSubject;
  const events: any[] = subject?.traceabilityEvent || subject?.event ? [subject?.event] : [];
  const issuer = typeof vc?.issuer === 'object' ? vc.issuer : { id: vc?.issuer };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel qr-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>UNTP Digital Traceability Event</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="qr-modal-body">
          {/* Left: QR + actions */}
          <div className="qr-modal-left">
            <canvas ref={canvasRef} />
            <p className="qr-caption">Scan to verify this ore's UNTP credential</p>
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
          </div>

          {/* Right: credential details */}
          <div className="qr-modal-right">
            {loading && <div className="qr-loading">Loading credential…</div>}
            {error && <div className="error-message">Could not load credential: {error}</div>}
            {credential && !loading && (
              <>
                <div className="qr-section">
                  <div className="qr-field"><span className="detail-label">Type</span>{vc?.type?.join(', ') || '—'}</div>
                  <div className="qr-field"><span className="detail-label">Issuer</span>{issuer?.name || issuer?.id || '—'}</div>
                  <div className="qr-field"><span className="detail-label">Issued</span>{vc?.validFrom || vc?.issuanceDate || '—'}</div>
                </div>

                {subject && (
                  <div className="qr-section">
                    <div className="qr-section-title">Subject</div>
                    <div className="qr-field"><span className="detail-label">ID</span><code>{String(subject.id || '—')}</code></div>
                    {subject.name && <div className="qr-field"><span className="detail-label">Name</span>{subject.name}</div>}
                    {subject.metal && <div className="qr-field"><span className="detail-label">Metal</span>{subject.metal}</div>}
                    {subject.mineId && <div className="qr-field"><span className="detail-label">Mine ID</span>{subject.mineId}</div>}
                    {subject.originCountry && <div className="qr-field"><span className="detail-label">Country</span>{subject.originCountry}</div>}
                    {subject.mineralType && <div className="qr-field"><span className="detail-label">Mineral Type</span>{subject.mineralType}</div>}
                    {subject.weightGrams != null && <div className="qr-field"><span className="detail-label">Weight</span>{Number(subject.weightGrams).toLocaleString()} g</div>}
                    {subject.estimatedGrade && <div className="qr-field"><span className="detail-label">Grade</span>{subject.estimatedGrade}</div>}
                    {subject.currentCustodian && <div className="qr-field"><span className="detail-label">Custodian</span><code className="addr-truncate">{subject.currentCustodian}</code></div>}
                    {subject.txHash && <div className="qr-field"><span className="detail-label">TX Hash</span><code className="addr-truncate">{subject.txHash}</code></div>}
                  </div>
                )}

                {events.length > 0 && events[0] && (
                  <div className="qr-section">
                    <div className="qr-section-title">Traceability Events</div>
                    {events.map((ev: any, i: number) => (
                      <div key={i} className="qr-event-row">
                        <span className="detail-label">{ev?.type || 'Event'}</span>
                        {ev?.eventTime && <span>{new Date(ev.eventTime).toLocaleString()}</span>}
                      </div>
                    ))}
                  </div>
                )}

                <div className="qr-section">
                  <div className="qr-section-title">Viewer URL</div>
                  <code className="qr-url">{viewerUrl}</code>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
