import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function ScheduleSection() {
  return (
    <section className="landing-section-bordered">
      <div className="landing-container">
        <div className="landing-two-col-grid landing-two-col-schedule">
          <TextSide />
          <MockupSide />
        </div>
      </div>
    </section>
  );
}

function TextSide() {
  const { t } = useTranslation('landing');

  const bullets = [
    t('schedule.bullet1'),
    t('schedule.bullet2'),
    t('schedule.bullet3'),
  ];

  return (
    <div className="reveal">
      <div className="landing-section-label">{t('schedule.label')}</div>
      <h2
        className="landing-section-title"
        style={{ fontSize: 'clamp(26px,3.2vw,40px)' }}
        dangerouslySetInnerHTML={{ __html: t('schedule.title') }}
      />
      <p className="landing-section-sub" style={{ marginTop: 14 }}>
        {t('schedule.desc')}
      </p>
      <div
        style={{
          marginTop: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {bullets.map((b) => (
          <div
            key={b}
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              fontSize: 13,
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ color: 'var(--accent)', marginTop: 1 }}>◆</span>
            <span>{b}</span>
          </div>
        ))}
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  const items = [
    {
      label: 'Free slot',
      bg: 'rgba(56,189,248,0.25)',
      border: 'rgba(56,189,248,0.5)',
    },
    {
      label: 'Booking block',
      bg: 'rgba(56,189,248,0.7)',
      border: 'var(--accent)',
    },
    {
      label: 'In progress',
      bg: 'rgba(250,204,21,0.3)',
      border: 'rgba(250,204,21,0.4)',
    },
    {
      label: 'Completed',
      bg: 'rgba(74,222,128,0.2)',
      border: 'rgba(74,222,128,0.3)',
    },
  ];

  return (
    <div style={{ marginTop: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {items.map((it) => (
        <span
          key={it.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            fontFamily: "'DM Mono', monospace",
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            background: 'var(--bg-raised)',
            padding: '4px 10px',
            borderRadius: 5,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: it.bg,
              border: `1px solid ${it.border}`,
              display: 'inline-block',
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

const TIME_HEADERS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
];
const NOW_COL = 5;

type SlotType = 'booked' | 'done' | 'inprogress' | 'free' | 'now';

interface Slot {
  type: SlotType;
  label?: string;
  width?: number;
}

const BAYS: readonly { name: string; slots: readonly Slot[] }[] = [
  {
    name: 'Bay 1',
    slots: [
      { type: 'booked', label: 'BMW X5', width: 3 },
      { type: 'done', width: 1 },
      { type: 'free', width: 1 },
      { type: 'inprogress', label: 'Camry', width: 2 },
      { type: 'free', width: 1 },
      { type: 'now', width: 1 },
      { type: 'booked', label: 'Honda CR-V', width: 3 },
      { type: 'free', width: 2 },
    ],
  },
  {
    name: 'Bay 2',
    slots: [
      { type: 'free', width: 1 },
      { type: 'booked', label: 'Toyota RAV4', width: 4 },
      { type: 'free', width: 2 },
      { type: 'inprogress', label: 'Audi A6', width: 2 },
      { type: 'now', width: 2 },
      { type: 'booked', label: 'Volvo XC', width: 2 },
      { type: 'free', width: 1 },
    ],
  },
  {
    name: 'Bay 3',
    slots: [
      { type: 'done', label: 'Kia K5', width: 2 },
      { type: 'free', width: 1 },
      { type: 'booked', label: 'Nissan Qash', width: 3 },
      { type: 'free', width: 2 },
      { type: 'now', width: 1 },
      { type: 'booked', label: 'Mercedes E', width: 4 },
      { type: 'free', width: 1 },
    ],
  },
  {
    name: 'Bay 4',
    slots: [
      { type: 'free', width: 2 },
      { type: 'booked', label: 'Porsche Cayenne', width: 5 },
      { type: 'free', width: 1 },
      { type: 'now', width: 2 },
      { type: 'free', width: 1 },
      { type: 'booked', label: 'Tesla M3', width: 2 },
      { type: 'free', width: 1 },
    ],
  },
];

const SLOT_STYLES: Record<SlotType, CSSProperties> = {
  booked: {
    background: 'rgba(56,189,248,0.18)',
    border: '1px solid rgba(56,189,248,0.4)',
    color: 'var(--accent)',
  },
  done: {
    background: 'rgba(74,222,128,0.15)',
    border: '1px solid rgba(74,222,128,0.25)',
    color: '#4ADE80',
  },
  inprogress: {
    background: 'rgba(250,204,21,0.15)',
    border: '1px solid rgba(250,204,21,0.3)',
    color: '#FACC15',
  },
  free: {
    background: 'rgba(56,189,248,0.05)',
    border: '1px dashed rgba(56,189,248,0.15)',
    color: 'transparent',
  },
  now: {
    background: 'rgba(56,189,248,0.12)',
    border: '1px solid rgba(56,189,248,0.35)',
    color: 'transparent',
    boxShadow: '0 0 6px rgba(56,189,248,0.1)',
  },
};

function MockupSide() {
  const { t } = useTranslation('landing');

  return (
    <div className="reveal" style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: -20,
          right: -20,
          width: 180,
          height: 180,
          background:
            'radial-gradient(ellipse at center,rgba(56,189,248,0.06) 0%,transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div className="landing-browser-frame">
        <div className="landing-browser-chrome">
          <div className="landing-browser-dot r" />
          <div className="landing-browser-dot y" />
          <div className="landing-browser-dot g" />
          <div className="landing-browser-url">{t('schedule.browserUrl')}</div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--border)',
            padding: '0 16px',
            background: 'var(--bg-surface)',
          }}
        >
          <div
            style={{
              padding: '9px 14px',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
            }}
          >
            Orders
          </div>
          <div
            style={{
              padding: '9px 14px',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--accent)',
              borderBottom: '2px solid var(--accent)',
              cursor: 'pointer',
            }}
          >
            Schedule
          </div>
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              gap: 6,
              padding: '6px 0',
            }}
          >
            <DateChip>Mon 24 Mar ▾</DateChip>
            <DateChip>Центральний ▾</DateChip>
          </div>
        </div>

        {/* Schedule Grid */}
        <div style={{ padding: '12px 14px', overflowX: 'auto' }}>
          <div style={{ display: 'flex', marginLeft: 60, marginBottom: 4 }}>
            {TIME_HEADERS.map((h, i) => (
              <div
                key={h}
                style={{
                  fontSize: 8,
                  fontFamily: "'DM Mono', monospace",
                  color:
                    i === NOW_COL ? 'var(--accent)' : 'var(--text-tertiary)',
                  fontWeight: i === NOW_COL ? 600 : 400,
                  width: 48,
                  textAlign: 'center',
                  flexShrink: 0,
                }}
              >
                {h}
              </div>
            ))}
          </div>

          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: `calc(60px + 48px*${NOW_COL} + 14px)`,
                top: 0,
                bottom: 0,
                width: 1,
                background: 'var(--accent)',
                opacity: 0.6,
                zIndex: 2,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: `calc(60px + 48px*${NOW_COL} + 11px)`,
                top: -1,
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--accent)',
                zIndex: 3,
              }}
            />

            {BAYS.map((bay) => (
              <div
                key={bay.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <div
                  style={{
                    width: 60,
                    fontSize: 9,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    fontFamily: "'DM Mono', monospace",
                    flexShrink: 0,
                    paddingRight: 8,
                    textAlign: 'right',
                  }}
                >
                  {bay.name}
                </div>
                {bay.slots.map((slot, si) => {
                  const w = (slot.width ?? 1) * 24 - 2;
                  return (
                    <div
                      key={`${bay.name}-${si}`}
                      style={{
                        width: w,
                        height: 26,
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 5px',
                        flexShrink: 0,
                        marginLeft: si > 0 ? 2 : 0,
                        cursor: 'pointer',
                        fontSize: 8,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        ...SLOT_STYLES[slot.type],
                      }}
                    >
                      {slot.label && <span>{slot.label}</span>}
                      {slot.type === 'done' && !slot.label && (
                        <span style={{ fontSize: 7 }}>✓</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Capacity footer */}
        <div
          style={{
            padding: '8px 14px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-raised)',
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontFamily: "'DM Mono', monospace",
              color: 'var(--text-tertiary)',
            }}
          >
            Workforce capacity:
          </div>
          <div
            style={{
              flex: 1,
              height: 4,
              background: 'var(--bg-input)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: '72%',
                background: 'var(--accent)',
                borderRadius: 2,
              }}
            />
          </div>
          <div
            style={{
              fontSize: 9,
              fontFamily: "'DM Mono', monospace",
              color: 'var(--accent)',
            }}
          >
            3/4 workers on shift
          </div>
          <div
            style={{
              fontSize: 9,
              fontFamily: "'DM Mono', monospace",
              padding: '2px 7px',
              borderRadius: 3,
              background: 'rgba(74,222,128,0.1)',
              color: '#4ADE80',
              border: '1px solid rgba(74,222,128,0.2)',
            }}
          >
            3 free bays
          </div>
        </div>
      </div>
    </div>
  );
}

function DateChip({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        padding: '3px 9px',
        borderRadius: 4,
        border: '1px solid var(--border)',
        background: 'var(--bg-raised)',
        color: 'var(--text-secondary)',
        fontFamily: "'DM Mono', monospace",
      }}
    >
      {children}
    </div>
  );
}
