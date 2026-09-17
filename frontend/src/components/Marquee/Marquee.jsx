import styles from './Marquee.module.css';

const QUOTE = "LIFE ISN'T PERFECT BUT YOUR OUTFIT CAN BE.";

export default function Marquee() {
  const separator = "\u00A0\u00A0\u00A0•\u00A0\u00A0\u00A0";
  const repeatedText = Array(15).fill(QUOTE).join(separator);

  return (
    <div className={styles.marqueeContainer} aria-hidden="true">
      <div className={styles.marqueeTrack}>
        <div className={styles.marqueeText}>{repeatedText}{separator}</div>
        <div className={styles.marqueeText}>{repeatedText}{separator}</div>
      </div>
    </div>
  );
}
