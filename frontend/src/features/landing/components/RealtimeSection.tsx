import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface FeedEvent {
  readonly id: number;
  readonly icon: string;
  readonly action: string;
  readonly detail: string;
  readonly badge: string;
  readonly badgeBg: string;
  readonly badgeColor: string;
  readonly time: string;
}

type EventTemplate = Omit<FeedEvent, 'id'>;

const SEED_EVENTS: readonly EventTemplate[] = [
  { icon: '🆕', action: 'New booking', detail: 'Олена М. · Honda CR-V · Express wash', badge: 'BOOKED', badgeBg: 'rgba(56,189,248,0.1)', badgeColor: '#38BDF8', time: 'just now' },
  { icon: '⚙️', action: 'Status changed', detail: 'BMW X5 · Full detailing → In Progress', badge: 'IN PROGRESS', badgeBg: 'rgba(56,189,248,0.1)', badgeColor: '#38BDF8', time: '1m ago' },
  { icon: '✅', action: 'Order completed', detail: 'Toyota Camry · Body polishing', badge: 'DONE ₴850', badgeBg: 'rgba(74,222,128,0.1)', badgeColor: '#4ADE80', time: '3m ago' },
  { icon: '💳', action: 'Payment recorded', detail: 'Андрій К. · Card · ₴1,200', badge: 'PAID', badgeBg: 'rgba(250,204,21,0.1)', badgeColor: '#FACC15', time: '5m ago' },
  { icon: '🌐', action: 'Web booking', detail: 'Марія С. · Audi A6 · Ceramic coating', badge: 'BOOKED', badgeBg: 'rgba(56,189,248,0.1)', badgeColor: '#38BDF8', time: '7m ago' },
  { icon: '❌', action: 'Order cancelled', detail: 'Volkswagen Golf · Express wash', badge: 'CANCELLED', badgeBg: 'rgba(248,113,113,0.1)', badgeColor: '#F87171', time: '9m ago' },
  { icon: '👤', action: 'New client', detail: 'Дмитро Петренко · +380 97 *** 4521', badge: 'CREATED', badgeBg: 'rgba(255,255,255,0.05)', badgeColor: '#94A3B8', time: '12m ago' },
];

const LIVE_EVENTS: readonly EventTemplate[] = [
  { icon: '🆕', action: 'New booking', detail: 'Сергій К. · Mazda CX-5 · Full wash', badge: 'BOOKED', badgeBg: 'rgba(56,189,248,0.1)', badgeColor: '#38BDF8', time: 'just now' },
  { icon: '⚙️', action: 'Status changed', detail: 'Audi A4 · Express wash → In Progress', badge: 'IN PROGRESS', badgeBg: 'rgba(56,189,248,0.1)', badgeColor: '#38BDF8', time: 'just now' },
  { icon: '✅', action: 'Order completed', detail: 'Nissan Rogue · Express wash', badge: 'DONE ₴250', badgeBg: 'rgba(74,222,128,0.1)', badgeColor: '#4ADE80', time: 'just now' },
  { icon: '🌐', action: 'Web booking', detail: 'Ірина В. · Tesla Model 3 · Detailing', badge: 'BOOKED', badgeBg: 'rgba(56,189,248,0.1)', badgeColor: '#38BDF8', time: 'just now' },
  { icon: '💳', action: 'Payment recorded', detail: 'Олег Б. · Online · ₴3,500', badge: 'PAID', badgeBg: 'rgba(250,204,21,0.1)', badgeColor: '#FACC15', time: 'just now' },
];

const MAX_EVENTS = 8;
const FEED_INTERVAL_MS = 3500;

export function RealtimeSection() {
  const { t } = useTranslation('landing');
  const [events, setEvents] = useState<FeedEvent[]>(() =>
    SEED_EVENTS.map((e, i) => ({ ...e, id: i })),
  );
  const idRef = useRef(SEED_EVENTS.length);
  const liveIdxRef = useRef(0);

  const addEvent = useCallback(() => {
    const ev = LIVE_EVENTS[liveIdxRef.current % LIVE_EVENTS.length];
    liveIdxRef.current += 1;
    const newId = idRef.current;
    idRef.current += 1;

    setEvents((prev) => {
      const next = [{ ...ev, id: newId }, ...prev];
      return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(addEvent, FEED_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [addEvent]);

  return (
    <section id="realtime" className="landing-section-bordered">
      <div className="landing-container landing-two-col-grid">
        <div className="reveal">
          <div className="landing-section-label">{t('realtime.label')}</div>
          <h2
            className="landing-section-title"
            style={{ fontSize: 'clamp(26px,3.5vw,40px)' }}
            dangerouslySetInnerHTML={{ __html: t('realtime.title') }}
          />
          <p className="landing-section-sub" style={{ marginTop: 16 }}>
            {t('realtime.desc')}
          </p>
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--accent)', fontSize: 16 }}>⊙</span>
                <span dangerouslySetInnerHTML={{ __html: t(`realtime.bullet${i}`) }} />
              </div>
            ))}
          </div>
        </div>

        <div className="landing-rt-events reveal">
          <div className="landing-rt-topbar">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="4" fill="currentColor" />
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            /events · tenant:demo
            <span className="landing-rt-live">
              <span className="landing-rt-live-dot" />
              LIVE
            </span>
          </div>
          <div className="landing-rt-feed">
            {events.map((ev) => (
              <div key={ev.id} className="landing-rt-event">
                <span className="landing-rt-event-icon">{ev.icon}</span>
                <span className="landing-rt-event-text">
                  <strong>{ev.action}</strong> — {ev.detail}
                </span>
                <span
                  className="landing-rt-event-badge"
                  style={{ background: ev.badgeBg, color: ev.badgeColor }}
                >
                  {ev.badge}
                </span>
                <span className="landing-rt-event-time">{ev.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
