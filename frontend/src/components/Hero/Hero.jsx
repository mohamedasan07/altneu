import { useRef } from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion';
import Button from '../ui/Button/Button';
import { fadeUp, lineMask, stagger } from '../../utils/motion';
import styles from './Hero.module.css';
import { HeroVisual } from '@/components/originkit/ui/hero-12/hero-visual';
import StarBurst from '@/components/originkit/ui/hero-12/starburst';

const ARROW_RIGHT = (
  <svg
    className={styles.ctaArrow}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 12h16" />
    <path d="M13 5l7 7-7 7" />
  </svg>
);

export default function Hero({
  eyebrow = 'ALTNEU',
  description =
    "Contemporary streetwear for those who move differently. Bold pieces, effortless fits, and a style that stands apart.",
  primaryCta = { label: 'SHOP COLLECTION', to: '/collections' },
  secondaryCta = { label: 'EXPLORE ALTNEU', to: '/collections' },
}) {
  const prefersReduced = useReducedMotion();
  const heroRef = useRef(null);

  // Subtle parallax driven by pointer position (motion values → no re-renders).
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 60, damping: 16, mass: 0.6 });
  const springY = useSpring(mouseY, { stiffness: 60, damping: 16, mass: 0.6 });
  const parallaxX = useTransform(springX, (v) => v * -22);
  const parallaxY = useTransform(springY, (v) => v * -16);

  const handlePointerMove = (e) => {
    if (prefersReduced) return;
    const rect = heroRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const visualStyle = prefersReduced ? undefined : { x: parallaxX, y: parallaxY };

  return (
    <section
      ref={heroRef}
      className={styles.hero}
      onPointerMove={handlePointerMove}
      aria-labelledby="hero-headline"
    >
      {/* ---------------- Originkit Ambient Background Layers ---------------- */}
      <div aria-hidden="true" className={styles.ambientLayer}>
        <div className="w-full h-full lg:translate-x-[16%]">
          <StarBurst 
            speed={7}
            starCount={140}
            color="#E8D4FF"
            centerX={50}
            centerY={0}
            starSize={18}
            opacity={28}
            flowerIntensity={2}
            twinkleSpeed={3}
          />
        </div>
        <div
          className={`${styles.ambientLayer} ${styles.diagonalLines}`}
          style={{
            maskImage: "linear-gradient(to bottom, #000 0%, transparent 60%)",
            WebkitMaskImage: "linear-gradient(to bottom, #000 0%, transparent 60%)",
          }}
        />
      </div>


      {/* ---------------- 2-Column Responsive Layout ---------------- */}
      
      <div className="flex min-h-0 flex-1 w-full flex-col px-4 pb-10 pt-20 lg:flex-row lg:items-center lg:px-12 lg:pt-0 max-w-[1440px] mx-auto z-10 relative">
        {/* Desktop: Left Column / Mobile: Bottom Layer */}
        <div className="order-2 flex w-full flex-col items-center lg:order-1 lg:w-1/2 lg:items-start lg:justify-center z-10">
          <div className={styles.contentWrap}>
            <motion.div
              className={styles.content}
              variants={stagger(0.15, 0.12)}
              initial={prefersReduced ? false : 'hidden'}
              animate="visible"
            >
              <motion.p variants={fadeUp} className={styles.eyebrow}>
                <span className={styles.eyebrowLine} aria-hidden="true" />
                {eyebrow}
              </motion.p>

              <h1 id="hero-headline" className={styles.headline}>
                <span className={styles.line}>
                  <motion.span variants={lineMask} className={styles.lineText}>
                    WEAR
                  </motion.span>
                </span>
                <span className={styles.line}>
                  <motion.span variants={lineMask} className={styles.lineText}>
                    YOUR&nbsp;ATTITUDE<span className={styles.accent}>.</span>
                  </motion.span>
                </span>
              </h1>

              <motion.p variants={fadeUp} className={styles.subheading}>
                {description}
              </motion.p>

              <motion.div variants={fadeUp} className={styles.ctaRow}>
                <Button to={primaryCta.to} variant="primary" size="lg" className={styles.cta}>
                  {primaryCta.label}
                  {ARROW_RIGHT}
                </Button>
                <Button to={secondaryCta.to} variant="outline" size="lg" className={styles.cta}>
                  {secondaryCta.label}
                  {ARROW_RIGHT}
                </Button>
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* Desktop: Right Column (Absolute) / Mobile: Top Layer (Flow) */}
        <div className="order-1 flex w-full items-center justify-center lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2 lg:justify-end z-5 pointer-events-none">
          <div className="w-[70vw] max-w-[340px] lg:w-[clamp(460px,35vw,560px)] lg:max-w-none lg:h-full lg:relative">
            <HeroVisual parallaxStyle={visualStyle} />
          </div>
        </div>
      </div>

      {/* ---------------- Scroll indicator ---------------- */}
      <div className={styles.scroll} aria-hidden="true">
        <motion.span
          className={styles.scrollLine}
          animate={
            prefersReduced
              ? undefined
              : { scaleY: [0.3, 1, 0.3] }
          }
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <span className={styles.scrollLabel}>Scroll</span>
      </div>
    </section>
  );
}