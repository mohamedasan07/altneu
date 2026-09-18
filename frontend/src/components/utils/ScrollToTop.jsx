import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export default function ScrollToTop() {
  const location = useLocation();
  const navType = useNavigationType();
  const currentKey = useRef(location.key);

  // Opt-out of browser's automatic scroll restoration to avoid jumping
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    return () => {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'auto';
      }
    };
  }, []);

  // Save scroll position for the current location key
  useEffect(() => {
    const handleScroll = () => {
      try {
        sessionStorage.setItem(`scroll_pos_${currentKey.current}`, window.scrollY.toString());
      } catch (e) {
        // Ignored
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle scroll on route change
  useEffect(() => {
    if (navType === 'POP') {
      try {
        const savedPosition = sessionStorage.getItem(`scroll_pos_${location.key}`);
        if (savedPosition !== null) {
          // A short timeout gives React time to mount the new DOM nodes
          // so the browser has enough height to scroll down.
          setTimeout(() => {
            window.scrollTo({
              top: parseInt(savedPosition, 10),
              left: 0,
              behavior: 'instant',
            });
          }, 50);
        }
      } catch (e) {
        // Ignored
      }
    } else {
      // PUSH or REPLACE
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'instant',
      });
    }

    currentKey.current = location.key;
  }, [location, navType]);

  return null;
}
