import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const STEPS = ['register', 'branches', 'team', 'goLive'] as const;

const SLOT_GRID = [
  { label: 'Bay 1', cells: ['busy', 'busy', 'free', 'free', 'now', 'free', 'busy', 'busy'] },
  { label: 'Bay 2', cells: ['free', 'busy', 'busy', 'busy', 'free', 'busy', 'busy', 'free'] },
  { label: 'Bay 3', cells: ['busy', 'free', 'free', 'busy', 'busy', 'free', 'free', 'busy'] },
  { label: 'Bay 4', cells: ['free', 'free', 'busy', 'busy', 'free', 'free', 'free', 'free'] },
] as const;

const CELL_LABEL: Record<string, string> = {
  busy: '', free: 'FREE', now: '← NOW',
};

export function HowItWorksSection() {
  const { t } = useTranslation('landing');
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section id="how" style={{ padding: '96px 24px', borderTop: '1px solid var(--border)' }}>
      <div className="landing-container">
        <div className="landing-how-grid">
          <div className="reveal">
            <div className="landing-section-label">{t('howItWorks.label')}</div>
            <h2
              className="landing-section-title"
              style={{ fontSize: 'clamp(26px,3.5vw,40px)' }}
              dangerouslySetInnerHTML={{ __html: t('howItWorks.title') }}
            />
            <div className="landing-steps-list" style={{ marginTop: 36 }}>
              {STEPS.map((step, i) => (
                <div
                  key={step}
                  className={`landing-step-item${i === activeStep ? ' active' : ''}`}
                  onMouseEnter={() => setActiveStep(i)}
                >
                  <div className="landing-step-num">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className="landing-step-content">
                    <h4>{t(`howItWorks.steps.${step}.title`)}</h4>
                    <p>{t(`howItWorks.steps.${step}.desc`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scheduling Visual */}
          <div className="landing-how-visual reveal">
            <div className="landing-hv-header">
              <span className="landing-hv-title">{t('howItWorks.visual.title')}</span>
              <span className="landing-hv-date">{t('howItWorks.visual.branch')}</span>
            </div>
            <div style={{
              fontSize: 9, fontFamily: "'DM Mono', monospace",
              color: 'var(--text-tertiary)', marginBottom: 10,
              display: 'flex', gap: 12, padding: '0 36px',
            }}>
              <span>08:00</span>
              <span style={{ marginLeft: 'auto' }}>10:00</span>
              <span>12:00</span>
              <span style={{ marginLeft: 'auto' }}>14:00</span>
              <span>16:00</span>
            </div>
            <div className="landing-slot-grid">
              {SLOT_GRID.map((row) => (
                <div key={row.label} className="landing-slot-row">
                  <span className="landing-slot-label">{row.label}</span>
                  {row.cells.map((cell, ci) => (
                    <div
                      key={ci}
                      className={`landing-slot-cell ${
                        cell === 'free' ? 'landing-slot-free' :
                        cell === 'now' ? 'landing-slot-cur' :
                        'landing-slot-busy'
                      }`}
                    >
                      {CELL_LABEL[cell]}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Lock indicator */}
            <div style={{
              marginTop: 16, padding: 12, background: 'var(--bg-raised)',
              border: '1px solid rgba(56,189,248,0.2)', borderRadius: 8,
            }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: 'var(--accent)', marginBottom: 6 }}>
                ● {t('howItWorks.visual.lockTitle')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {t('howItWorks.visual.lockDetail')}
              </div>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: 'var(--text-tertiary)', marginTop: 4 }}>
                {t('howItWorks.visual.lockTech')}
              </div>
            </div>

            {/* Legend */}
            <div style={{ marginTop: 10, display: 'flex', gap: 10, fontSize: 10, fontFamily: "'DM Mono', monospace" }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--accent)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(56,189,248,0.2)', border: '1px solid rgba(56,189,248,0.3)', display: 'inline-block' }} />
                Free
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--danger)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.2)', display: 'inline-block' }} />
                Occupied
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-primary)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(56,189,248,0.35)', border: '1px solid rgba(56,189,248,0.5)', display: 'inline-block' }} />
                Now
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
