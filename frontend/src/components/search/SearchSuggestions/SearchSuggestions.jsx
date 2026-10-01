import { useMemo, useState, useRef, useEffect } from 'react';
import { cn } from '../../../utils/cn';
import { resolveUrl } from '../../../services';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import ImageSkeleton from '../../skeleton/ImageSkeleton/ImageSkeleton';
import styles from './SearchSuggestions.module.css';

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Split text on `query`; matched segments are wrapped in <mark>. */
export function Highlight({ text = '', query = '' }) {
  const parts = useMemo(() => {
    const term = query.trim();
    if (!term) return [{ text, match: false }];
    const regex = new RegExp(`(${escapeRegExp(term)})`, 'ig');
    return text
      .split(regex)
      .filter(Boolean)
      .map((segment) => ({ text: segment, match: segment.toLowerCase() === term.toLowerCase() }));
  }, [text, query]);

  return (
    <span>
      {parts.map((part, i) =>
        part.match ? (
          <mark key={i} className={styles.mark}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}

const inr = (n) => n.toLocaleString('en-IN');

/**
 * Live results listbody + “See all” escape hatch.
 * `activeIndex` drives aria-activedescendant + roving highlight for the
 * keyboard (handled by the parent overlay).
 */
export default function SearchSuggestions({
  results,
  query,
  status,
  error,
  activeIndex,
  onHover,
  onSelect,
  listboxId,
}) {
  const searching = Boolean(query.trim());

  if (status === 'loading' && searching) {
    return (
      <div className={styles.list} role="listbox" id={listboxId} aria-label="Search results">
        <div className={styles.pending}>Searching…</div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={styles.list} role="listbox" id={listboxId} aria-label="Search results">
        <p className={styles.emptyCopy}>Search is unavailable right now.</p>
      </div>
    );
  }

  if (!searching) {
    return null;
  }

  if (results.length === 0) {
    return (
      <div className={styles.list} role="listbox" id={listboxId} aria-label="Search results">
        <motion.div
          className={styles.none}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className={styles.noneTitle}>No products found.</p>
          <p className={styles.noneCopy}>Try a different style, colour or keyword.</p>
          <Link className={styles.noneLink} to="/collections">
            Browse all collections
          </Link>
        </motion.div>
      </div>
    );
  }

  const visible = results.slice(0, 6);

  return (
    <div className={styles.list} role="listbox" id={listboxId} aria-label="Search results">
      {visible.map((product, index) => (
        <SuggestionRow
          key={product.id}
          product={product}
          index={index}
          activeIndex={activeIndex}
          listboxId={listboxId}
          query={query}
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}

      <div className={styles.footWrap}>
{results.length > 6 ? (
          <Link
            className={cn(styles.viewAll, activeIndex === visible.length && styles.viewAllActive)}
            to={`/collections?q=${encodeURIComponent(query.trim())}`}
          >
            View all {results.length} results
          </Link>
        ) : (
          <p className={styles.footCount}>
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </p>
        )}
      </div>
    </div>
  );
}

function SuggestionRow({ product, index, activeIndex, listboxId, query, onHover, onSelect }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    if (imgRef.current?.complete) {
      setImageLoaded(true);
    }
  }, []);

  const handleLoad = () => setImageLoaded(true);
  const handleError = (e) => {
    setImageLoaded(true);
    e.currentTarget.style.opacity = '0';
  };

  return (
    <button
      type="button"
      role="option"
      id={`${listboxId}-option-${index}`}
      aria-selected={index === activeIndex}
      className={cn(styles.row, index === activeIndex && styles.rowActive)}
      onMouseEnter={() => onHover(index)}
      onClick={() => onSelect(product)}
    >
      <div className={styles.thumbWrapper}>
        {!imageLoaded && <ImageSkeleton />}
        <img
          ref={imgRef}
          className={cn(styles.thumb, !imageLoaded && styles.imgHidden)}
          src={resolveUrl(product.imageUrl)}
          alt=""
          aria-hidden="true"
          loading="lazy"
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
      <div className={styles.info}>
        <span className={styles.name}>
          <Highlight text={product.name} query={query} />
        </span>
        <span className={styles.meta}>
          {product.category} · ₹ {inr(Number(product.price) || 0)}
        </span>
      </div>
      {product.sale && <span className={styles.sale}>Sale</span>}
    </button>
  );
}