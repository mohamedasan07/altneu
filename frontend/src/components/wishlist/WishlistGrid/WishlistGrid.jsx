import { AnimatePresence, motion } from 'framer-motion';
import ProductCard from '../../ProductCard/ProductCard';
import { useWishlist } from '../../../hooks/useWishlist';
import { useCart } from '../../../hooks/useCart';
import { colorNameFor, DEFAULT_COLOR, DEFAULT_SIZE } from '../../../utils/cartConfig';
import { getStockInfo } from '../../../utils/stock';
import { EASE_OUT, stagger } from '../../../utils/motion';
import styles from './WishlistGrid.module.css';

/**
 * Saved-product grid. Reuses ProductCard; each cell exposes explicit
 * Move to Cart / Remove actions. Remove animates the cell out.
 */
export default function WishlistGrid({ products = [] }) {
  const { removeFromWishlist } = useWishlist();
  const { addToCart } = useCart();

  const moveToCart = (product) => {
    if (getStockInfo(product).outOfStock) return;
    addToCart(product, {
      size: DEFAULT_SIZE,
      color: DEFAULT_COLOR,
      colorName: colorNameFor(DEFAULT_COLOR),
      quantity: 1,
    });
    removeFromWishlist(product.id);
  };

  const cell = {
    hidden: { opacity: 0, y: 22 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.55, ease: EASE_OUT },
    },
    exit: {
      opacity: 0,
      scale: 0.96,
      transition: { duration: 0.28, ease: EASE_OUT },
    },
  };

  return (
    <motion.ul
      className={styles.grid}
      variants={stagger(0.05, 0.08)}
      initial="hidden"
      animate="visible"
      aria-label="Saved items"
    >
      <AnimatePresence>
        {products.map((product) => {
          const soldOut = getStockInfo(product).outOfStock;
          return (
            <motion.li key={product.id} className={styles.cell} variants={cell} layout>
              <ProductCard product={product} />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.move}
                  onClick={() => moveToCart(product)}
                  disabled={soldOut}
                  aria-label={
                    soldOut
                      ? `${product.name} is sold out`
                      : `Move ${product.name} to cart`
                  }
                >
                  {soldOut ? 'Sold Out' : 'Move to Cart'}
                </button>
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => removeFromWishlist(product.id)}
                  aria-label={`Remove ${product.name} from wishlist`}
                >
                  Remove
                </button>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </motion.ul>
  );
}