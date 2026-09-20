import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button/Button';
import styles from './AboutPage.module.css';

export default function AboutPage() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <main className={styles.page}>
      {/* 1. HERO */}
      <section className={styles.hero} aria-label="About ALTNEU Hero">
        <picture>
          <source media="(max-width: 639px)" srcSet="/images/hero/traviscott mobile.png" />
          <img
            src="/images/hero/traviscott 2.png"
            alt="ALTNEU Hero"
            className={styles.heroImage}
            loading="eager"
          />
        </picture>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>FOR THE UNFILTERED.</h1>
        </div>
      </section>

      {/* 2. WHO WE ARE */}
      <section className={styles.section} aria-labelledby="about-who-we-are">
        <h2 id="about-who-we-are" className={styles.sectionTitle}>WHO WE ARE</h2>
        <p className={styles.sectionBody}>
          ALTNEU is built on the foundation of individuality and self-expression.
          We believe streetwear is more than just clothing; it is a canvas for personal style.
          Our designs are made for those who challenge the status quo and wear their authenticity with pride.
        </p>
      </section>

      {/* 3. WHY ALTNEU? */}
      <section className={styles.section} aria-labelledby="about-why">
        <h2 id="about-why" className={styles.sectionTitle}>WHY ALTNEU?</h2>
        <p className={styles.sectionBody}>
          We strip away the noise to focus on what matters: the attitude behind the garment.
          Our philosophy centers on bold silhouettes and a refusal to conform. ALTNEU is for the unapologetic.
        </p>
      </section>

      {/* 4. BRAND MANIFESTO */}
      <section className={styles.manifestoSection} aria-label="Brand Manifesto">
        <h2 className={styles.manifestoText}>
          WE DON'T DRESS <span>TO FIT IN.</span>
          <br />
          WE DRESS <span>TO EXPRESS.</span>
        </h2>
      </section>

      {/* 5. WHAT WE BELIEVE */}
      <section className={styles.section} aria-labelledby="about-beliefs">
        <h2 id="about-beliefs" className={styles.sectionTitle}>WHAT WE BELIEVE</h2>
        <div className={styles.pillarsGrid}>
          <div>
            <h3 className={styles.pillarTitle}>INDIVIDUALITY</h3>
            <p className={styles.pillarBody}>Your style is your signature. We design pieces that let you stand out.</p>
          </div>
          <div>
            <h3 className={styles.pillarTitle}>COMFORT</h3>
            <p className={styles.pillarBody}>True confidence starts with feeling good in what you wear.</p>
          </div>
          <div>
            <h3 className={styles.pillarTitle}>EXPRESSION</h3>
            <p className={styles.pillarBody}>Fashion is the loudest voice without speaking a word.</p>
          </div>
          <div>
            <h3 className={styles.pillarTitle}>COMMUNITY</h3>
            <p className={styles.pillarBody}>United by attitude, driven by a shared refusal to compromise.</p>
          </div>
        </div>
      </section>

      {/* 6. WHAT WE MAKE */}
      <section className={styles.section} aria-labelledby="about-what-we-make">
        <h2 id="about-what-we-make" className={styles.sectionTitle}>WHAT WE MAKE</h2>
        <div className={styles.makeGrid}>
          <div className={styles.makeImageWrapper}>
             <img src="/images/categories/baggy.png" alt="ALTNEU Apparel" className={styles.makeImage} loading="lazy" />
          </div>
          <div className={styles.makeContent}>
            <p className={styles.sectionBody}>
              Our collections are designed with intention. We favor strong structures, minimalist aesthetics with loud details, and materials that withstand the rhythm of the streets. No fake promises, just honest design for everyday wear.
            </p>
          </div>
        </div>
      </section>

      {/* 7. FINAL CTA */}
      <section className={styles.ctaSection} aria-label="Shop Call to Action">
        <h2 className={styles.ctaTitle}>YOUR STYLE. YOUR RULES.</h2>
        <Button to="/collections" variant="primary" size="lg">
          SHOP COLLECTION
        </Button>
      </section>
    </main>
  );
}
