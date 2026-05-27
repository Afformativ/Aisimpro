import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Award,
  Building2,
  CheckCircle,
  Clock,
  ExternalLink,
  Flame,
  Gem,
  Hash,
  MapPin,
  Pickaxe,
  Scale,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  describeUntpCredential,
  getUntpApiPath,
  resolveUntpRouteTarget,
} from '../utils/untpCredentials';

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000/api`;
const SERVER_BASE = API_BASE.replace(/\/api\/?$/, '');

function HeaderIcon({ entityType, kind }: { entityType: string; kind: string }) {
  if (kind === 'dcc') return <ShieldCheck size={28} color="#fff" />;
  if (kind === 'dfr' || entityType === 'facility') return <Building2 size={28} color="#fff" />;
  if (kind === 'dia' || entityType === 'party') return <User size={28} color="#fff" />;
  if (entityType === 'ore') return <Pickaxe size={28} color="#fff" />;
  if (entityType === 'bar') return <Flame size={28} color="#fff" />;
  return <Award size={28} color="#fff" />;
}

function StatIcon({ label }: { label: string }) {
  const key = label.toLowerCase();
  if (key.includes('weight')) return <Scale size={20} />;
  if (key.includes('country')) return <MapPin size={20} />;
  if (key.includes('mineral')) return <Pickaxe size={20} />;
  if (key.includes('fineness')) return <Gem size={20} />;
  if (key.includes('issued')) return <Clock size={20} />;
  if (key.includes('product')) return <Award size={20} />;
  if (key.includes('input')) return <Flame size={20} />;
  return <Hash size={20} />;
}

export default function UntpCredential() {
  const params = useParams<{ id: string; credentialKind?: string; entityType?: string; eventId?: string }>();
  const target = resolveUntpRouteTarget(params);
  const [vc, setVc] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setLoading(false);
      setError('Unsupported UNTP credential route.');
      return;
    }

    let cancelled = false;

    fetch(`${SERVER_BASE}${getUntpApiPath(target)}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setVc(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target]);

  if (loading) {
    return (
      <div className="vc-page">
        <div className="vc-loading">
          <div className="loading-spinner" />
          <p>Loading credential…</p>
        </div>
      </div>
    );
  }

  if (error || !target || !vc) {
    return (
      <div className="vc-page">
        <div className="vc-error">
          <ShieldCheck size={48} color="#e53e3e" />
          <h2>Credential Not Found</h2>
          <p>{error || 'This credential could not be loaded.'}</p>
        </div>
      </div>
    );
  }

  const description = describeUntpCredential(target, vc);

  if (!description) {
    return (
      <div className="vc-page">
        <div className="vc-error">
          <ShieldCheck size={48} color="#e53e3e" />
          <h2>Credential Not Available</h2>
          <p>This UNTP credential type is not currently supported by the viewer.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vc-page">
      <div className="vc-card">
        <div className="vc-header" style={{ borderColor: description.accentColor }}>
          <div className="vc-header-icon" style={{ background: description.accentColor }}>
            <HeaderIcon entityType={target.entityType} kind={target.kind} />
          </div>
          <div className="vc-header-text">
            <div className="vc-badge">{description.badge}</div>
            <h1 className="vc-title">{description.title}</h1>
            <p className="vc-subtitle">{description.subtitle}</p>
          </div>
          <div className="vc-verified-badge">
            <CheckCircle size={20} color="#38a169" />
            <span>Verifiable Credential</span>
          </div>
        </div>

        {description.stats.length > 0 && (
          <div className="vc-stats">
            {description.stats.map((item) => (
              <div key={item.label} className="vc-stat">
                <div style={{ color: description.accentColor }}>
                  <StatIcon label={item.label} />
                </div>
                <div>
                  <div className="vc-stat-value">{item.value}</div>
                  <div className="vc-stat-label">{item.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="vc-sections">
          {description.metaFields.length > 0 && (
            <div className="vc-section">
              <div className="vc-section-title"><ShieldCheck size={15} /> Metadata</div>
              {description.metaFields.map((item) => (
                <div key={item.label} className="vc-field">
                  <span className="vc-field-label">{item.label}</span>
                  {item.href ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={item.mono ? 'vc-field-mono' : 'vc-field-value'}
                    >
                      {item.value} <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span className={item.mono ? 'vc-field-mono' : 'vc-field-value'}>{item.value}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {description.sections.map((section) => (
            <div
              key={section.title}
              className={`vc-section ${section.title === 'Proof' ? 'vc-section-proof' : ''} ${section.title === 'Credential ID' ? 'vc-section-id' : ''}`}
            >
              <div className="vc-section-title">
                {section.title === 'Proof' ? <ShieldCheck size={15} /> : <Hash size={15} />}
                {section.title}
              </div>
              {section.fields.map((item) => (
                <div key={`${section.title}-${item.label}`} className="vc-field">
                  <span className="vc-field-label">{item.label}</span>
                  {item.href ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={item.mono ? 'vc-field-mono' : 'vc-field-value'}
                    >
                      {item.value} <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span className={item.mono ? 'vc-field-mono' : 'vc-field-value'}>{item.value}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="vc-footer">
          <span>{description.footer}</span>
          <a href="https://uncefact.github.io/spec-untp/" target="_blank" rel="noopener noreferrer">
            Learn more <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  );
}
