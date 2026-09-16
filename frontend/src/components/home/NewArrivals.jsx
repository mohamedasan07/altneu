import { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Draggable } from 'gsap/Draggable';
import ProductCard from '../ProductCard/ProductCard';
import Container from '../ui/Container/Container';
import { fadeUp, stagger } from '../../utils/motion';
import styles from './NewArrivals.module.css';

gsap.registerPlugin(Draggable, useGSAP);

export default function NewArrivals({ products = [], status = 'loading' }) {
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const tween = useRef(null);

  const arrivals = useMemo(
    () => [...products].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 8),
    [products]
  );

  useGSAP(
    () => {
      if (status !== 'loading' && trackRef.current && arrivals.length > 0) {
        tween.current = gsap.to(trackRef.current, {
          xPercent: -50,
          repeat: -1,
          ease: 'none',
          duration: 25,
        });

        const proxy = document.createElement('div');
        const track = trackRef.current;
        let dragRatio = 1;

        Draggable.create(proxy, {
          trigger: track,
          type: 'x',
          inertia: false,
          onPress() {
            tween.current.pause();
            const halfWidth = track.scrollWidth / 2;
            dragRatio = halfWidth > 0 ? 1 / halfWidth : 1;
            // Align proxy to match current tween progress
            gsap.set(this.target, { x: -tween.current.progress() / dragRatio });
            this.update();
          },
          onDrag() {
            // Drag left = proxy x becomes negative = progress increases
            const p = gsap.utils.wrap(0, 1, -this.x * dragRatio);
            tween.current.progress(p);
          },
          onRelease() {
            tween.current.play();
          },
        });
      }
    },
    { dependencies: [status, arrivals.length], scope: containerRef }
  );

  const handleMouseEnter = () => tween.current?.pause();
  const handleMouseLeave = () => tween.current?.resume();

  return (
    <section className={styles.section} aria-labelledby="newarrivals-title">
      <Container>
        <motion.div
          className={styles.head}
          variants={stagger(0.1, 0.12)}
          initial={false}
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
        >
          <motion.div variants={fadeUp}>
            <p className={styles.kicker}>Just in</p>
            <h2 id="newarrivals-title" className={styles.title}>
              New arrivals
            </h2>
          </motion.div>
        </motion.div>
      </Container>

      <motion.div
        ref={containerRef}
        className={styles.rail}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.15 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerEnter={handleMouseEnter}
        onPointerLeave={handleMouseLeave}
      >
        <div className={styles.track} ref={trackRef}>
          {status === 'loading'
            ? Array.from({ length: 10 }).map((_, i) => (
                <div className={styles.skeleton} key={`skeleton-${i}`}>
                  <span />
                </div>
              ))
            : [...arrivals, ...arrivals].map((product, index) => {
                const isNew = index % arrivals.length < 3;
                return (
                  <div className={styles.item} key={`${product.id}-${index}`}>
                    <ProductCard product={product} isNew={isNew} />
                  </div>
                );
              })}
        </div>
      </motion.div>
    </section>
  );
}