import { motion } from 'framer-motion';
import Container from '../ui/Container/Container';
import { fadeUp, stagger } from '../../utils/motion';
import styles from './BrandStory.module.css';

export default function BrandStory() {
  return (
    <section className={styles.section} aria-labelledby="brandstory-title">
      <Container>
        <motion.div
          className={styles.story}
          variants={stagger(0.12, 0.14)}
          initial={false}
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
        >
          <motion.div variants={fadeUp}>
            <p className={styles.kicker}>The brand</p>
            <h2 id="brandstory-title" className={styles.title}>
              Made for the
              <br />
              unfiltered<span className={styles.accent}>.</span>
            </h2>
          </motion.div>

          <motion.p className={styles.lead} variants={fadeUp}>
            ALTNEU exists for the ones who never fit a template. Between
            clean silhouettes and street-born edges, every piece is cut to move
            the way you do. No noise, no excess — just pieces that mean what
            they wear.
          </motion.p>

          <motion.p className={styles.body} variants={fadeUp}>
            We drop small, sharp capsules. When something sells out, it lives
            online — your fit stays yours. That&apos;s the whole point.
          </motion.p>
        </motion.div>
      </Container>
    </section>
  );
}