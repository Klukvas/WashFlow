import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type WashPhase = 'loading' | 'dirty' | 'washing' | 'clean';

export function HeroWash() {
  const { t } = useTranslation('landing');
  const stageRef = useRef<HTMLDivElement>(null);
  const cleanRef = useRef<HTMLImageElement>(null);
  const dirtyRef = useRef<HTMLImageElement>(null);
  const [phase, setPhase] = useState<WashPhase>('loading');
  const [isPaused, setIsPaused] = useState(true);

  useEffect(() => {
    let isActive = true;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => {
      if (motion.matches) setPhase('clean');
    };
    updateMotion();
    motion.addEventListener('change', updateMotion);
    let areImagesDecoded = false;
    let observer: IntersectionObserver | undefined;
    const updateVisibility = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const bounds = stage.getBoundingClientRect();
      const headerHeight = document.querySelector('.landing-nav')?.getBoundingClientRect().height ?? 64;
      const usableHeight = Math.max(0, window.innerHeight - headerHeight);
      const visibleHeight = Math.max(0, Math.min(bounds.bottom, window.innerHeight) - Math.max(bounds.top, headerHeight));
      const requiredHeight = Math.min(bounds.height * 0.65, usableHeight * 0.7);
      setIsPaused(!areImagesDecoded || document.visibilityState !== 'visible' || visibleHeight < requiredHeight);
    };
    const observeStage = () => {
      observer?.disconnect();
      const stage = stageRef.current;
      if (!stage) return;
      const headerHeight = document.querySelector('.landing-nav')?.getBoundingClientRect().height ?? 64;
      const stageHeight = stage.getBoundingClientRect().height;
      const requiredRatio = stageHeight > 0
        ? Math.min(0.65, Math.max(0, window.innerHeight - headerHeight) * 0.7 / stageHeight)
        : 0;
      observer = new IntersectionObserver(updateVisibility, {
        rootMargin: `-${headerHeight}px 0px 0px`,
        threshold: [0, requiredRatio, 1],
      });
      observer.observe(stage);
      updateVisibility();
    };
    observeStage();
    window.addEventListener('resize', observeStage);
    document.addEventListener('visibilitychange', updateVisibility);
    const images = [cleanRef.current, dirtyRef.current];
    void Promise.all(images.map((image) => image?.decode())).then(() => {
      if (isActive) {
        areImagesDecoded = true;
        setPhase(motion.matches ? 'clean' : 'dirty');
        updateVisibility();
      }
    }).catch(() => {
      if (isActive) setPhase('clean');
    });
    return () => {
      isActive = false;
      observer?.disconnect();
      window.removeEventListener('resize', observeStage);
      document.removeEventListener('visibilitychange', updateVisibility);
      motion.removeEventListener('change', updateMotion);
    };
  }, []);

  return (
    <>
      <div
        ref={stageRef}
        className="landing-hero-photo landing-hero-wash-stage"
        data-wash-active={phase === 'dirty' || phase === 'washing'}
        data-wash-paused={isPaused}
        data-wash-phase={phase}
        aria-hidden="true"
      >
        <picture className="landing-hero-wash-clean">
          <source media="(max-width: 959px)" srcSet="/images/landing/hero-wash-bay-v1-640.webp 640w, /images/landing/hero-wash-bay-v1-960.webp 960w" sizes="(max-width: 600px) 640px, 100vw" />
          <img ref={cleanRef} src="/images/landing/hero-wash-bay-v1-1600.webp" srcSet="/images/landing/hero-wash-bay-v1-960.webp 960w, /images/landing/hero-wash-bay-v1-1600.webp 1536w" sizes="100vw" width={1536} height={1024} alt="" loading="eager" fetchPriority="high" />
        </picture>
        <picture
          className="landing-hero-wash-dirty"
          onAnimationStart={() => setPhase('washing')}
          onAnimationEnd={() => setPhase('clean')}
        >
          <source media="(max-width: 959px)" srcSet="/images/landing/hero-wash-dirty-v1-640.webp 640w, /images/landing/hero-wash-dirty-v1-960.webp 960w" sizes="(max-width: 600px) 640px, 100vw" />
          <img ref={dirtyRef} src="/images/landing/hero-wash-dirty-v1-1600.webp" srcSet="/images/landing/hero-wash-dirty-v1-960.webp 960w, /images/landing/hero-wash-dirty-v1-1600.webp 1536w" sizes="100vw" width={1536} height={1024} alt="" loading="eager" fetchPriority="high" />
        </picture>
        <div className="landing-hero-wash-water" />
      </div>
      <div className="landing-hero-wash-controls">
        <span className="landing-hero-wash-status" role="status" aria-live="polite" aria-atomic="true">
          <span aria-hidden="true" />{t(`hero.wash.${phase}`)}
        </span>
      </div>
    </>
  );
}
