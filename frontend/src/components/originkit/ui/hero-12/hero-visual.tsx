// Delivered by Originkit · stack: nextjs · styling: tailwind

import { useEffect, useRef, useState } from "react";
import PixelCard from "@/components/originkit/ui/hero-12/pixel-card";
import { ElectricLine } from "@/components/originkit/ui/hero-12/electric-line";

/** Public asset under /sections/hero-12/assets */
function asset(file: string) {
  return `/originkit/hero-12/${file}`;
}

/**
 * Hero visual layers (Figma element 2146:692 / desktop 1:1670).
 * Layer order: thunder-mask (z-0) → ThunderStrike (z-5) → circle/mask (z-10) → pixels (z-20).
 */

/** Matches `--breakpoint-ipad` / `--breakpoint-desktop-sm` in globals.css */
const IPAD_MIN = 768;
const DESKTOP_MIN = 1280;

type Breakpoint = "mobile" | "ipad" | "desktop";

const CIRCLE_SIZE = {
  mobile: 280,
  ipad: 542,
  desktop: 624,
} as const;

/** Kept at ~1.27× the circle so the halo scales with the orb rather than
 *  clinging to it as the circle grows. */
const MASK_SIZE = {
  mobile: 350,
  ipad: 700,
  desktop: 794,
} as const;

/** Native asset aspect 299×637 — height is derived from width. */
const THUNDER_ASPECT = 637 / 299;
const THUNDER_MASK_W = {
  mobile: 292,
  ipad: 490,
  desktop: 520,
} as const;

const THUNDER_MASK_H = {
  mobile: Math.round(THUNDER_MASK_W.mobile * THUNDER_ASPECT),
  ipad: Math.round(THUNDER_MASK_W.ipad * THUNDER_ASPECT),
  desktop: Math.round(THUNDER_MASK_W.desktop * THUNDER_ASPECT),
} as const;

const BOLT_MASK = [
  "linear-gradient(to bottom, transparent 0%, #000 12%, #000 100%)",
  "linear-gradient(to right, transparent 0%, #000 22%, #000 78%, transparent 100%)",
].join(", ");

/** How far the lightning bolt continues past `circleTop`, into the orb. */
const THUNDER_BOLT_DIP = 90;

/** How far the beam dips into the circle so they visually join. */
const THUNDER_OVERLAP = {
  mobile: 96,
  ipad: 280,
  desktop: 320,
} as const;

/**
 * Vertical shift of the visual within its stage.
 * Positive moves it down; negative pulls it up (may paint over the navbar).
 */
const HERO_VISUAL_OFFSET_Y = {
  mobile: -580,
  ipad: -750,
  desktop: -740,
} as const;

/** Pixel wash over the orb — purple/white to match the glow. */
const CIRCLE_PIXEL_PROPS = {
  colors: ["#6A4A9D", "#000"],
  appearFrom: "top" as const,
  trigger: "auto" as const,
  position: "middle" as const,
  replay: true,
  gap: 8,
  pixelSize: 7.9,
  speed: 700,
  backgroundColor: "transparent",
  padding: 0,
  borderWidth: 0,
  borderColor: "transparent",
  radius: 9999,
  showLabel: false,
  transition: { type: "tween" as const, duration: 0.8, ease: "easeOut" },
};

/** Minimum gap between the visual stage bottom and HeroContent (stacked layouts). */
export const HERO_CONTENT_GAP = 24;

/** Mobile defaults — prefer `useHeroVisualLayout` for live sizes. */
export const HERO_VISUAL_HEIGHT =
  THUNDER_MASK_H.mobile - THUNDER_OVERLAP.mobile + CIRCLE_SIZE.mobile;
export const HERO_VISUAL_STAGE_HEIGHT = Math.max(
  0,
  HERO_VISUAL_HEIGHT + HERO_VISUAL_OFFSET_Y.mobile,
);

type HeroVisualLayout = {
  breakpoint: Breakpoint;
  circleSize: number;
  maskSize: number;
  thunderMaskW: number;
  thunderMaskH: number;
  circleTop: number;
  offsetY: number;
  visualHeight: number;
  /** In-flow stage height; 0 on desktop where the visual is absolutely positioned. */
  stageHeight: number;
};

const getBreakpoint = (width: number): Breakpoint => {
  if (width >= DESKTOP_MIN) return "desktop";
  if (width >= IPAD_MIN) return "ipad";
  return "mobile";
};

const getLayout = (breakpoint: Breakpoint): HeroVisualLayout => {
  const circleSize = CIRCLE_SIZE[breakpoint];
  const maskSize = MASK_SIZE[breakpoint];
  const thunderMaskW = THUNDER_MASK_W[breakpoint];
  const thunderMaskH = THUNDER_MASK_H[breakpoint];
  const circleTop = thunderMaskH - THUNDER_OVERLAP[breakpoint];
  const offsetY = HERO_VISUAL_OFFSET_Y[breakpoint];
  const visualHeight = circleTop + circleSize;
  const isDesktop = breakpoint === "desktop";

  return {
    breakpoint,
    circleSize,
    maskSize,
    thunderMaskW,
    thunderMaskH,
    circleTop,
    offsetY,
    visualHeight,
    stageHeight: isDesktop ? visualHeight : Math.max(0, visualHeight + offsetY),
  };
};

/** Responsive thunder/circle/mask sizes + stage metrics. */
export const useHeroVisualLayout = (): HeroVisualLayout => {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
    typeof window !== 'undefined' ? getBreakpoint(window.innerWidth) : 'mobile'
  );

  useEffect(() => {
    const update = () => {
      setBreakpoint(getBreakpoint(window.innerWidth));
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return getLayout(breakpoint);
};

import { motion, MotionStyle } from "framer-motion";

type HeroVisualProps = {
  /** Fires once critical visual assets are loaded (or after a short fallback). */
  onReady?: () => void;
  parallaxStyle?: MotionStyle;
};

const HERO_VISUAL_ASSETS = [
  asset("thunder-mask.png"),
  asset("ipad-mask.png"),
  asset("mask.png"),
  "/images/altneu-logo.png",
] as const;

export const HeroVisual = ({
  onReady,
  parallaxStyle,
}: HeroVisualProps) => {
  const {
    breakpoint,
    circleSize,
    maskSize,
    thunderMaskW,
    thunderMaskH,
    circleTop,
    offsetY,
    visualHeight,
    stageHeight,
  } = useHeroVisualLayout();

  const readyRef = useRef(false);

  useEffect(() => {
    if (!onReady) return;

    let cancelled = false;

    const loadImage = (src: string) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        img.onload = done;
        img.onerror = done;
        img.src = src;
        if (img.complete) done();
      });

    const finish = () => {
      if (cancelled || readyRef.current) return;
      readyRef.current = true;
      // Wait a frame so the visual can paint before UI orchestration starts
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) onReady();
        });
      });
    };

    void Promise.all(HERO_VISUAL_ASSETS.map(loadImage)).then(finish);

    // Don't block UI forever if an asset hangs
    const fallback = window.setTimeout(finish, 1800);

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [onReady]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative w-full shrink-0 overflow-visible lg:static"
      style={{ height: breakpoint === "desktop" ? "100%" : stageHeight }}
    >
      <motion.div
        className="absolute inset-x-0 overflow-visible"
        style={{
          ...parallaxStyle,
          top: offsetY,
          height: visualHeight,
          marginLeft: breakpoint === "desktop" ? "-36px" : "-12px",
        }}
      >
        <div aria-hidden="true" className="relative size-full overflow-visible">
          {/* Soft thunder glow — lowest (tapered conical plume) */}
          <div
            className="absolute top-0 left-1/2 z-0 -translate-x-1/2 overflow-visible ipad:-translate-y-[9%] lg:translate-y-[-11%]"
            style={{
              width: thunderMaskW,
              height: thunderMaskH,
              marginLeft: breakpoint === "desktop" ? "-76px" : "0px",
            }}
          >
            {/* Mobile Only: Pink Tinted Plume (restored) */}
            <div className="block ipad:hidden pointer-events-none absolute inset-0 size-full max-w-none">
              <div
                className="absolute inset-0 size-full mix-blend-screen"
                style={{
                  backgroundColor: "#FF80D5",
                  opacity: 0.8,
                  maskImage: `url(${asset("thunder-mask.png")})`,
                  WebkitMaskImage: `url(${asset("thunder-mask.png")})`,
                  maskSize: "contain",
                  WebkitMaskSize: "contain",
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                  maskPosition: "center",
                  WebkitMaskPosition: "center",
                }}
              />
            </div>
            {/* iPad Only: Original Untinted Plume */}
            <img
              src={asset("ipad-mask.png")}
              alt=""
              width={thunderMaskW}
              height={thunderMaskH}
              className="hidden ipad:block lg:hidden pointer-events-none absolute inset-0 size-full max-w-none object-contain mix-blend-screen"
              style={{ display: "none" }} // TEMPORARY DIAGNOSTIC DISABLE
            />

            {/* Desktop Only: Pink Tinted Plume (reduces white center, adds #FF80D5 glow) */}
            <div className="hidden lg:block pointer-events-none absolute inset-0 size-full max-w-none">
              {/* Base pink alpha mask */}
              <div
                className="absolute inset-0 size-full mix-blend-screen"
                style={{
                  backgroundColor: "#FF80D5",
                  opacity: 0.8,
                  maskImage: `url(${asset("ipad-mask.png")})`,
                  WebkitMaskImage: `url(${asset("ipad-mask.png")})`,
                  maskSize: "contain",
                  WebkitMaskSize: "contain",
                  maskRepeat: "no-repeat",
                  WebkitMaskRepeat: "no-repeat",
                  maskPosition: "center",
                  WebkitMaskPosition: "center",
                }}
              />
            </div>
          </div>
          {/*
            Bolt runs the length of the beam and dips into the orb, so it spans from
            the top of the thunder mask down past `circleTop`. Masked at both ends so
            it fades into the glow instead of stopping at the canvas edge.
          */}
          <div
            style={{
              // Native aspect of the Figma frame (58 × 575) so the turbulence is
              // not stretched sideways, which would smear the kinks into waves.
              width: (circleTop + THUNDER_BOLT_DIP) * (58 / 575) * 1.35,
              height: circleTop + THUNDER_BOLT_DIP,
              // Both axes: the additive halo is wide, and without a horizontal fade
              // it gets sliced flat at the canvas edges.
              maskImage: BOLT_MASK,
              WebkitMaskImage: BOLT_MASK,
              maskComposite: "intersect",
              WebkitMaskComposite: "source-in",
              marginLeft: breakpoint === "desktop" ? "-76px" : "0px",
            }}
            className="pointer-events-none absolute top-0 left-1/2 z-9 -translate-x-1/2"
          >
            <ElectricLine weight={1.8} strands={3} className="size-full" />
          </div>

          {/* Circle + mask — above thunder strike; pixels shimmer on top of the orb */}
          <div
            className="absolute left-1/2 z-10 -translate-x-1/2 overflow-visible"
            style={{
              top: circleTop,
              width: circleSize,
              height: circleSize,
              marginLeft: breakpoint === "desktop" ? "-76px" : "0px",
            }}
          >
            {/* Isolated Corona Layer using mask.png purely as an alpha shape */}
            <div
              className="pointer-events-none absolute z-0 max-w-none mix-blend-screen"
              style={{
                top: "50%",
                left: "50%",
                width: maskSize,
                height: maskSize,
                transform: "translate(-50%, -50%)",
                backgroundColor: "#FF80D5",
                opacity: 0.55,
                // Use a 2-part intersecting mask:
                // 1. The elliptical gradient smoothly fades the horizontal spread and corners.
                // 2. mask.png provides the organic alpha shape.
                maskImage: [
                  `radial-gradient(ellipse 50% 100% at center, #000 65%, transparent 100%)`,
                  `url(${asset("mask.png")})`
                ].join(", "),
                WebkitMaskImage: [
                  `radial-gradient(ellipse 50% 100% at center, #000 65%, transparent 100%)`,
                  `url(${asset("mask.png")})`
                ].join(", "),
                maskComposite: "intersect",
                WebkitMaskComposite: "source-in",
                maskSize: "100% 100%, contain",
                WebkitMaskSize: "100% 100%, contain",
                maskPosition: "center, center",
                WebkitMaskPosition: "center, center",
                maskRepeat: "no-repeat, no-repeat",
                WebkitMaskRepeat: "no-repeat, no-repeat",
                // Soften the asset into a true diffuse organic glow
                filter: "blur(24px)",
              }}
            />
            <img
              src="/images/altneu-logo.png"
              alt=""
              width={circleSize}
              height={circleSize}
              className="pointer-events-none absolute z-20 max-w-none object-contain"
              style={{
                width: "96%",
                height: "96%",
                left: "2%",
                top: "2%",
              }}
            />
            {/*
              Clip and blend must be on separate nodes — mix-blend-mode on the
              same element as clip-path/overflow often drops circular clipping.
            */}
            <div
              className="pointer-events-none absolute inset-[12%] z-10"
              style={{
                clipPath: "circle(50%)",
                WebkitClipPath: "circle(50%)",
                // Circle clip + fade out toward the bottom of the orb
                maskImage: [
                  "radial-gradient(circle closest-side at center, #000 99%, transparent 100%)",
                  "linear-gradient(to bottom, #000 0%, #000 40%, rgba(0,0,0,0.35) 70%, transparent 100%)",
                ].join(", "),
                WebkitMaskImage: [
                  "radial-gradient(circle closest-side at center, #000 99%, transparent 100%)",
                  "linear-gradient(to bottom, #000 0%, #000 40%, rgba(0,0,0,0.35) 70%, transparent 100%)",
                ].join(", "),
                maskSize: "100% 100%",
                WebkitMaskSize: "100% 100%",
                maskRepeat: "no-repeat",
                WebkitMaskRepeat: "no-repeat",
                maskComposite: "intersect",
                WebkitMaskComposite: "source-in",
                transform: "translateZ(0)",
              }}
            >
              <div className="size-full opacity-25 mix-blend-screen">
                <PixelCard
                  {...CIRCLE_PIXEL_PROPS}
                  style={{
                    width: "100%",
                    height: "100%",
                    minWidth: 0,
                    minHeight: 0,
                    borderRadius: "50%",
                    overflow: "hidden",
                    clipPath: "circle(50%)",
                    WebkitClipPath: "circle(50%)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
