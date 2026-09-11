// Delivered by Originkit · stack: nextjs · styling: tailwind


import { motion } from "motion/react";
import RollingLetters from "@/components/originkit/ui/hero-12/rolling-text";
import { Button } from "@/components/originkit/ui/hero-12/button";

type HeroContentProps = {
  onStartAutomating: () => void;
  onBookDemo: () => void;
  showHeadline?: boolean;
  showContent?: boolean;
  onHeadlineComplete?: () => void;
};

// Removed SIDE_CALLOUTS as they are not in the new design

const EASE_OUT = [0.215, 0.61, 0.355, 1] as const;

export const HeroContent = ({
  onStartAutomating,
  onBookDemo,
  showHeadline = true,
  showContent = true,
  onHeadlineComplete,
}: HeroContentProps) => {
  return (
    <div className="relative z-20 mx-auto flex w-full max-w-[370px] flex-col items-center gap-6 px-4 desktop-sm:mx-0 desktop-sm:max-w-none desktop-sm:items-stretch desktop-sm:gap-0 desktop-sm:px-0">
      {/* Eyebrow + headline */}
      <div className="flex w-full flex-col items-center gap-3 text-center desktop-sm:max-w-[923px] desktop-sm:items-start desktop-sm:gap-6 desktop-sm:text-left">
        <motion.p
          initial={false}
          animate={showHeadline ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="font-sans text-[16px] font-semibold leading-normal tracking-wide text-[#c98bff] whitespace-nowrap desktop-sm:text-[18px]"
        >
          ALTNEU
        </motion.p>

        <div className="flex w-full flex-col items-center gap-2 desktop-sm:items-start desktop-sm:gap-0">
          <RollingLetters
            tag="h1"
            className="w-full text-balance text-center font-sans font-bold text-[40px] leading-[1.1] tracking-tight desktop-sm:text-left desktop-sm:text-[64px]"
            color="#ffffff"
            startFrom="bottom"
            staggerFrom="start"
            animate={showHeadline}
            onAnimationComplete={onHeadlineComplete}
            transition={{
              duration: 0.4,
              delay: 0.05,
              ease: EASE_OUT,
              staggerChildren: 0.022,
            }}
            text={"WEAR YOUR\nATTITUDE."}
          />

          {/* Mobile / tablet description stays under the headline */}
          <motion.p
            initial={false}
            animate={showContent ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="w-full max-w-[332px] font-sans text-[15px] font-normal leading-[1.5] text-white/80 text-center text-pretty desktop-sm:hidden mt-4"
          >
            Express yourself with clothing that speaks louder than words. 
            Join the movement and redefine your style.
          </motion.p>
        </div>
      </div>

      {/* CTAs — stacked on mobile, row on desktop */}
      <motion.div
        initial={false}
        animate={showContent ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
        className="flex w-full flex-col items-center gap-3 pb-[58px] desktop-sm:mt-10 desktop-sm:w-auto desktop-sm:flex-row desktop-sm:items-center desktop-sm:gap-3 desktop-sm:pb-0"
      >
        <Button
          variant="primary"
          aria-label="Start Automating"
          onClick={onStartAutomating}
          className="w-full desktop-sm:w-fit"
        >
          Start Automating
        </Button>
        <Button
          variant="secondary"
          aria-label="Book a Demo"
          onClick={onBookDemo}
          className="w-full desktop-sm:w-fit"
        >
          Book a Demo
        </Button>
      </motion.div>

      {/* Desktop description — lower left */}
      <motion.p
        initial={false}
        animate={showContent ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.1 }}
        className="mt-6 hidden max-w-[420px] font-sans text-[18px] leading-[1.6] text-white/80 desktop-sm:block"
      >
        Express yourself with clothing that speaks louder than words.
        Join the movement and redefine your style.
      </motion.p>

      {/* Desktop side callouts removed */}
    </div>
  );
};
