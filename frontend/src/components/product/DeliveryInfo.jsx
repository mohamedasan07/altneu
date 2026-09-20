import styles from './DeliveryInfo.module.css';

const CARDS = [
  {
    title: 'Delivery',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 7h11v9H3z" />
        <path d="M14 10h4l3 3v3h-7z" />
        <path d="M3 13h11" />
        <circle cx="7" cy="18" r="1.8" />
        <circle cx="17" cy="18" r="1.8" />
      </svg>
    ),
    body: 'Ships in 2–4 days. Free over ₹2,499.',
  },
  {
    title: 'Returns',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
      </svg>
    ),
    body: '7-day easy returns. No questions asked.',
  },
  {
    title: 'Support',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 6h16v11H4z" />
        <path d="M4 6l8 7 8-7" />
      </svg>
    ),
    body: 'altneu07@gmail.com · 24h replies.',
  },
];

export default function DeliveryInfo() {
  return (
    <ul className={styles.grid}>
      {CARDS.map((card) => (
        <li key={card.title} className={styles.card}>
          <span className={styles.icon}>{card.icon}</span>
          <span className={styles.body}>
            <strong className={styles.title}>{card.title}</strong>
            {card.body}
          </span>
        </li>
      ))}
    </ul>
  );
}