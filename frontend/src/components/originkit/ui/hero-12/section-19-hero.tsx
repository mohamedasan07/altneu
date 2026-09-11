// Delivered by Originkit · stack: nextjs · styling: tailwind


import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import StarBurst from "@/components/originkit/ui/hero-12/starburst";
import { HeroContent } from "@/components/originkit/ui/hero-12/hero-content";
import { HeroVisual } from "@/components/originkit/ui/hero-12/hero-visual";
import { Navbar } from "@/components/originkit/ui/hero-12/navbar";

/** Public asset under /sections/hero-12/assets */
function asset(file: string) {
  return `/originkit/hero-12/${file}`;
}

/** StarDust sits shorter than the glow container, pinned to the bottom. */
const STAR_DUST_HEIGHT = 80;

const EASE_OUT = [0.215, 0.61, 0.355, 1] as const;

type RevealPhase = "visual" | "nav" | "headline" | "content";

export const Section19Hero = () => {

  const prefersReducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<RevealPhase>("visual");

  useEffect(() => {
    if (prefersReducedMotion) setPhase("content");
  }, [prefersReducedMotion]);

  const showNav = prefersReducedMotion || phase !== "visual";
  const showHeadline =
    prefersReducedMotion || phase === "headline" || phase === "content";
  const showContent = prefersReducedMotion || phase === "content";

  const handleVisualReady = useCallback(() => {
    setPhase((current) => (current === "visual" ? "nav" : current));
  }, []);

  const handleNavComplete = () => {
    setPhase((current) => (current === "nav" ? "headline" : current));
  };

  const handleHeadlineComplete = () => {
    setPhase((current) => (current === "headline" ? "content" : current));
  };

  const handleStartAutomating = () => {
    window.location.hash = "#start";
  };

  const handleBookDemo = () => {
    window.location.hash = "#demo";
  };

  return (
    <section
      aria-label="ALTNEU responsive hero"
      className="relative isolate flex h-svh min-h-[700px] w-full flex-col overflow-hidden bg-black"
    >
      {/* Ambient layers — visible with visual, soft fade */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-full w-full desktop-sm:translate-x-[16%]"
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      >
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
      </motion.div>

      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-11 bg-[url(/originkit/hero-12/diagonal-line.png)] bg-size-[402px_874px] bg-top bg-repeat mix-blend-overlay"
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.05 }}
      />

      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-15 flex h-[250px] items-end justify-center overflow-hidden ipad:h-[150px] desktop-sm:h-[170px]"
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.1 }}
      >
        <img
          src={asset("bottom-glow.png")}
          alt=""
          width={1440}
          height={210}
          className="absolute inset-x-0 bottom-0 mx-auto h-[210px] w-full object-cover object-bottom mix-blend-screen mask-radial-[90%_100%] mask-radial-at-bottom mask-radial-from-20% mask-radial-to-75% mask-no-repeat desktop-sm:h-[150px]"
        />

      </motion.div>

      <div className="relative z-20 mx-auto flex h-full w-full max-w-[1440px] flex-col">
        {/* 2. Navbar — slides in after HeroVisual is ready */}
        <motion.div
          initial={prefersReducedMotion ? false : { y: "-120%", opacity: 0 }}
          animate={showNav ? { y: 0, opacity: 1 } : { y: "-120%", opacity: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
          onAnimationComplete={() => {
            if (showNav) handleNavComplete();
          }}
        >
          <Navbar />
        </motion.div>

        <div className="flex min-h-0 flex-1 w-full flex-col px-4 pb-10 pt-20 lg:flex-row lg:items-center lg:px-12 lg:pt-0">
          <div className="order-2 flex w-full flex-col items-center lg:order-1 lg:w-1/2 lg:items-start lg:justify-center">
            <HeroContent
              onStartAutomating={handleStartAutomating}
              onBookDemo={handleBookDemo}
              showHeadline={showHeadline}
              showContent={showContent}
              onHeadlineComplete={handleHeadlineComplete}
            />
          </div>

          <div className="order-1 flex w-full items-center justify-center lg:order-2 lg:w-1/2 lg:justify-end">
            <div className="w-[70vw] max-w-[340px] lg:w-[clamp(460px,35vw,560px)] lg:max-w-none">
              <HeroVisual onReady={handleVisualReady} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
