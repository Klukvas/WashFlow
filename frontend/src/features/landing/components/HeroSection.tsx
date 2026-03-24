import { useTranslation } from 'react-i18next';
import { useAuthModalStore } from '@/shared/stores/auth-modal.store';

export function HeroSection() {
  const { t } = useTranslation('landing');
  const openModal = useAuthModalStore((s) => s.open);

  return (
    <section className="landing-hero">
      <div className="landing-hero-badge a1">
        <div className="landing-hero-badge-dot" />
        {t('hero.badge')}
      </div>

      <h1 className="a2" dangerouslySetInnerHTML={{ __html: t('hero.title') }} />

      <p className="landing-hero-sub a3">{t('hero.subtitle')}</p>

      <div className="landing-hero-ctas a4">
        <button
          type="button"
          className="btn-lg-accent"
          onClick={() => openModal('register')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12h14M12 5l7 7-7 7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t('hero.cta')}
        </button>
      </div>

      {/* Dashboard Preview */}
      <div className="landing-preview-wrap a5">
        <div className="landing-preview">
          <BrowserTopbar url="app.washflow.com/dashboard" />
          <div className="landing-preview-body">
            <Sidebar />
            <MainContent />
          </div>
        </div>
      </div>
    </section>
  );
}

function BrowserTopbar({ url }: { url: string }) {
  return (
    <div className="landing-preview-topbar">
      <div className="landing-preview-dot r" />
      <div className="landing-preview-dot y" />
      <div className="landing-preview-dot g" />
      <div className="landing-preview-url">{url}</div>
    </div>
  );
}

function Sidebar() {
  return (
    <div className="landing-preview-sidebar">
      <div className="landing-ps-section">Main</div>
      <div className="landing-ps-item active">
        <span className="landing-ps-icon">◈</span> Dashboard{' '}
        <span className="landing-ps-badge">Live</span>
      </div>
      <div className="landing-ps-item">
        <span className="landing-ps-icon">≡</span> Orders
      </div>
      <div className="landing-ps-item">
        <span className="landing-ps-icon">⊡</span> Schedule
      </div>
      <div className="landing-ps-item">
        <span className="landing-ps-icon">◎</span> Clients
      </div>
      <div className="landing-ps-section">Business</div>
      <div className="landing-ps-item">
        <span className="landing-ps-icon">⊞</span> Branches
      </div>
      <div className="landing-ps-item">
        <span className="landing-ps-icon">⊙</span> Workforce
      </div>
      <div className="landing-ps-item">
        <span className="landing-ps-icon">▦</span> Services
      </div>
      <div className="landing-ps-section">Reports</div>
      <div className="landing-ps-item">
        <span className="landing-ps-icon">△</span> Analytics
      </div>
      <div className="landing-ps-item">
        <span className="landing-ps-icon">⊟</span> Audit Log
      </div>
    </div>
  );
}

const KPI_DATA = [
  { label: 'Revenue', value: '₴47,230', delta: '↑ 12.4%', dir: 'up' },
  { label: 'Orders', value: '184', delta: '↑ 8.1%', dir: 'up' },
  { label: 'Occupancy', value: '73%', delta: '↑ 5.6%', dir: 'up' },
  { label: 'Cancel Rate', value: '3.2%', delta: '↑ 0.4%', dir: 'down' },
] as const;

const BAR_HEIGHTS = [
  42, 55, 48, 60, 72, 65, 80, 58, 45, 70, 62, 75, 68, 55, 82, 90, 74, 66, 71, 85,
  15, 12, 10, 8,
];

const ORDERS = [
  { status: 'IN PROGRESS', cls: 'landing-s-inprog', car: 'Honda CR-V', service: 'Full detailing', price: '₴ 1,200' },
  { status: 'COMPLETED', cls: 'landing-s-done', car: 'BMW X5', service: 'Express wash', price: '₴ 250' },
  { status: 'BOOKED', cls: 'landing-s-booked', car: 'Toyota Camry', service: 'Body polishing', price: '₴ 850' },
] as const;

function MainContent() {
  return (
    <div className="landing-preview-main">
      <div className="landing-pm-header">
        <span className="landing-pm-title">Dashboard</span>
        <div className="landing-pm-actions">
          <button type="button" className="landing-pm-btn">Today</button>
          <button type="button" className="landing-pm-btn">Branch ▾</button>
          <button type="button" className="landing-pm-btn accent">+ New Order</button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="landing-kpi-row">
        {KPI_DATA.map((kpi) => (
          <div key={kpi.label} className="landing-kpi-card">
            <div className="landing-kpi-label">{kpi.label}</div>
            <div className="landing-kpi-value">{kpi.value}</div>
            <div className={`landing-kpi-delta ${kpi.dir}`}>{kpi.delta}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="landing-chart-area">
        <div className="landing-chart-label">Daily Revenue — March 2025</div>
        <div className="landing-chart-bars">
          {BAR_HEIGHTS.map((h, i) => {
            const isPeak = i === 4 || i === 15;
            const isToday = i === 19;
            const isFuture = i >= 20;
            return (
              <div
                key={i}
                className={`landing-chart-bar${isPeak ? ' peak' : ''}${isToday ? ' today' : ''}`}
                style={{
                  height: `${h}%`,
                  ...(isFuture ? { opacity: 0.3 - (i - 20) * 0.07 } : {}),
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Orders Strip */}
      <div className="landing-orders-strip">
        {ORDERS.map((o) => (
          <div key={o.car} className="landing-orders-row">
            <span className={`landing-orders-status ${o.cls}`}>{o.status}</span>
            <span className="landing-o-car">{o.car}</span>
            <span className="landing-o-service">{o.service}</span>
            <span className="landing-o-price">{o.price}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
