// ALTNEU — reusable Framer Motion variants.
// Shared by the Hero and future sections so motion stays consistent.

export const EASE_OUT = [0.22, 1, 0.36, 1];

export const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE_OUT },
  },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.8, ease: EASE_OUT } },
};

// Line reveal: parent spans are overflow hidden; child slides up.
export const lineMask = {
  hidden: { y: '115%' },
  visible: {
    y: '0%',
    transition: { duration: 0.9, ease: EASE_OUT },
  },
};

export const scaleFadeIn = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.8, ease: EASE_OUT },
  },
};

export const stagger = (delayChildren = 0.1, staggerChildren = 0.12) => ({
  hidden: {},
  visible: {
    transition: { delayChildren, staggerChildren },
  },
});

// Escape hatch for reduced-motion: skip variants entirely.
export const shouldAnimate = (prefersReduced) => ({
  initial: prefersReduced ? false : 'hidden',
  animate: 'visible',
});