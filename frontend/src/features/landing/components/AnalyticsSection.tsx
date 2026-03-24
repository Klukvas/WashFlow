import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function AnalyticsSection() {
  return (
    <section className="landing-section-bordered">
      <div className="landing-container">
        <div className="landing-two-col-grid landing-two-col-analytics">
          <MockupSide />
          <TextSide />
        </div>
      </div>
    </section>
  );
}

const KPI = [
  { label: 'Revenue', value: '₴189k', delta: '↑ 14.2%' },
  { label: 'Orders', value: '2,614', delta: '↑ 8.7%' },
  { label: 'Avg. Check', value: '₴723', delta: '↑ 5.1%' },
  { label: 'Completion', value: '91.4%', delta: '↑ 1.8%' },
];

const BRANCHES = [
  { name: 'Центральний', value: '₴72,410', width: '100%', opacity: 1 },
  { name: 'Лівобережний', value: '₴63,820', width: '88%', opacity: 0.7 },
  { name: 'Подільський', value: '₴52,770', width: '72%', opacity: 0.5 },
];

const SERVICES = [
  { name: 'Exp. wash', count: 836, width: '95%' },
  { name: 'Full wash', count: 601, width: '68%' },
  { name: 'Interior', count: 453, width: '51%' },
  { name: 'Polishing', count: 318, width: '36%' },
  { name: 'Ceramic', count: 194, width: '22%' },
];

const EMPLOYEES = [
  { name: 'О. Марченко', orders: 142, revenue: '₴28,410', cancel: '1.4%', cancelColor: '#4ADE80' },
  { name: 'М. Ковален.', orders: 128, revenue: '₴24,880', cancel: '2.3%', cancelColor: '#4ADE80' },
  { name: 'В. Петренко', orders: 97, revenue: '₴19,240', cancel: '7.2%', cancelColor: '#FACC15' },
];

function MockupSide() {
  return (
    <div className="reveal" style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: -20, left: -20, width: 200, height: 200, background: 'radial-gradient(ellipse at center,rgba(56,189,248,0.05) 0%,transparent 70%)', pointerEvents: 'none' }} />
      <div className="landing-browser-frame">
        <div className="landing-browser-chrome">
          <div className="landing-browser-dot r" />
          <div className="landing-browser-dot y" />
          <div className="landing-browser-dot g" />
          <div className="landing-browser-url">app.washflow.com/analytics</div>
        </div>

        <div style={{ padding: '14px 16px 16px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.02em' }}>Analytics</div>
            <div style={{ display: 'flex', gap: 5 }}>
              <Chip>Mar 2025</Chip>
              <Chip>All branches</Chip>
              <Chip accent>↓ Export CSV</Chip>
            </div>
          </div>

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
            {KPI.map((k) => (
              <div key={k.label} style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 7, padding: '10px 10px 8px' }}>
                <div style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.03em' }}>{k.value}</div>
                <div style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", color: '#4ADE80', marginTop: 2 }}>{k.delta}</div>
              </div>
            ))}
          </div>

          {/* Two charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8, marginBottom: 10 }}>
            {/* Branch performance */}
            <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 7, padding: 10 }}>
              <ChartLabel>Branch Performance</ChartLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {BRANCHES.map((b) => (
                  <div key={b.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, marginBottom: 3 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{b.name}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-primary)' }}>{b.value}</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--bg-input)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: b.width, background: 'var(--accent)', opacity: b.opacity, borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
              {/* Order source */}
              <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <ChartLabel>Order source</ChartLabel>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {['INTERNAL 60%', 'WEB 20%', 'WIDGET 15%', 'API 5%'].map((s, i) => (
                    <span key={s} style={{
                      fontSize: 8, fontFamily: "'DM Mono', monospace", padding: '2px 5px', borderRadius: 3,
                      background: i === 0 ? 'rgba(56,189,248,0.1)' : 'rgba(56,189,248,0.06)',
                      color: i === 0 ? 'var(--accent)' : 'var(--text-secondary)',
                      border: i === 0 ? '1px solid rgba(56,189,248,0.2)' : '1px solid var(--border)',
                    }}>{s}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Top services */}
            <div style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 7, padding: 10 }}>
              <ChartLabel>Top Services</ChartLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {SERVICES.map((s, i) => (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ fontSize: 8, color: 'var(--text-secondary)', width: 58, flexShrink: 0 }}>{s.name}</div>
                    <div style={{ flex: 1, height: 4, background: 'var(--bg-input)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: s.width, background: 'var(--accent)', opacity: 1 - i * 0.15, borderRadius: 2 }} />
                    </div>
                    <div style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", color: 'var(--text-tertiary)', width: 26, textAlign: 'right' }}>{s.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Anomaly alert */}
          <div style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.18)', borderRadius: 7, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#F87171', marginBottom: 1 }}>Anomaly detected — Подільський</div>
              <div style={{ fontSize: 8, color: 'var(--text-secondary)' }}>Cancel rate ↑ 18.4% this week vs 3.2% avg — check staffing</div>
            </div>
            <div style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>View details →</div>
          </div>

          {/* Employee table */}
          <div style={{ marginTop: 8, background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 8, fontFamily: "'DM Mono', monospace", color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', gap: 4 }}>
              <span style={{ flex: 1.5 }}>Employee</span>
              <span style={{ flex: 0.8, textAlign: 'right' }}>Orders</span>
              <span style={{ flex: 1, textAlign: 'right' }}>Revenue</span>
              <span style={{ flex: 0.7, textAlign: 'right' }}>Cancel%</span>
            </div>
            <div style={{ padding: '0 10px' }}>
              {EMPLOYEES.map((emp, i) => (
                <div key={emp.name} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 0', borderBottom: i < EMPLOYEES.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 9 }}>
                  <span style={{ flex: 1.5, color: 'var(--text-primary)', fontWeight: 600 }}>{emp.name}</span>
                  <span style={{ flex: 0.8, textAlign: 'right', fontFamily: "'DM Mono', monospace", color: 'var(--text-secondary)' }}>{emp.orders}</span>
                  <span style={{ flex: 1, textAlign: 'right', fontFamily: "'DM Mono', monospace", color: 'var(--text-primary)' }}>{emp.revenue}</span>
                  <span style={{ flex: 0.7, textAlign: 'right', fontFamily: "'DM Mono', monospace", color: emp.cancelColor }}>{emp.cancel}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TextSide() {
  const { t } = useTranslation('landing');

  const bullets = [
    t('analytics.bullet1'),
    t('analytics.bullet2'),
    t('analytics.bullet3'),
  ];

  return (
    <div className="reveal">
      <div className="landing-section-label">{t('analytics.label')}</div>
      <h2
        className="landing-section-title"
        style={{ fontSize: 'clamp(26px,3.2vw,40px)' }}
        dangerouslySetInnerHTML={{ __html: t('analytics.title') }}
      />
      <p className="landing-section-sub" style={{ marginTop: 14 }}>
        {t('analytics.desc')}
      </p>
      <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bullets.map((b) => (
          <div key={b} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--accent)', marginTop: 1 }}>◆</span>
            <span>{b}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 28, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <TagBadge color="#F87171" bg="rgba(248,113,113,0.08)" border="rgba(248,113,113,0.2)">⚠ Anomaly alerts</TagBadge>
        <TagBadge color="var(--accent)" bg="rgba(56,189,248,0.08)" border="rgba(56,189,248,0.2)">↓ CSV export</TagBadge>
        <TagBadge color="var(--accent)" bg="rgba(56,189,248,0.08)" border="rgba(56,189,248,0.2)">Branch filter</TagBadge>
      </div>
    </div>
  );
}

function Chip({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <div style={{
      fontSize: 9, padding: '3px 8px', borderRadius: 4,
      background: accent ? 'var(--accent)' : 'var(--bg-raised)',
      border: accent ? 'none' : '1px solid var(--border)',
      color: accent ? '#090E18' : 'var(--text-secondary)',
      fontFamily: "'DM Mono', monospace",
      fontWeight: accent ? 700 : 400,
    }}>
      {children}
    </div>
  );
}

function ChartLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
      {children}
    </div>
  );
}

function TagBadge({ children, color, bg, border }: { children: ReactNode; color: string; bg: string; border: string }) {
  return (
    <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", padding: '4px 10px', borderRadius: 5, background: bg, color, border: `1px solid ${border}` }}>
      {children}
    </span>
  );
}
