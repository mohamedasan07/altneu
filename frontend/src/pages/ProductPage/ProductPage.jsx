import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';
import { resolveUrl } from '../../services';
import { DEFAULT_SIZE } from '../../utils/cartConfig';
import useProducts from '../../hooks/useProducts';
import { useCart } from '../../hooks/useCart';
import { fadeUp } from '../../utils/motion';
import Loader from '../../components/ui/Loader/Loader';
import ProductGallery from '../../components/product/ProductGallery';

import SizeSelector from '../../components/product/SizeSelector';
import QuantitySelector from '../../components/product/QuantitySelector';
import WishlistButton from '../../components/wishlist/WishlistButton/WishlistButton';
import Accordion from '../../components/product/Accordion';
import DeliveryInfo from '../../components/product/DeliveryInfo';
import RelatedProducts from '../../components/product/RelatedProducts';
import RecentlyViewed from '../../components/product/RecentlyViewed';
import styles from './ProductPage.module.css';

const inr = (n) => n.toLocaleString('en-IN');



const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// UI-only heuristic so a couple of sizes read as sold out.
const pickUnavailable = (id) => {
  const n = Number(id) || 0;
  if (n % 3 === 0) return ['XXL'];
  if (n % 3 === 1) return ['XS', 'XXL'];
  return [];
};

function buildAccordion(product) {
  return [
    {
      title: 'Description',
      content: (
        <p>
          {product.description ||
            'A ALTNEU piece. Cut for the unfiltered — clean lines, real weight.'}
        </p>
      ),
    },
    {
      title: 'Materials',
      content: (
        <p>
          100% heavyweight cotton — 280 GSM. Garment-dyed for a lived-in fade
          that stays yours. Machine wash cold, hang dry.
        </p>
      ),
    },
    {
      title: 'Size Guide',
      content: (
        <table className={styles.sizeTable}>
          <thead>
            <tr>
              <th scope="col">Size</th>
              <th scope="col">Chest (in)</th>
              <th scope="col">Length (in)</th>
              <th scope="col">Shoulder (in)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>XS</td><td>19</td><td>26</td><td>16</td></tr>
            <tr><td>S</td><td>20</td><td>27</td><td>17</td></tr>
            <tr><td>M</td><td>21.5</td><td>28</td><td>18</td></tr>
            <tr><td>L</td><td>23</td><td>29</td><td>19</td></tr>
            <tr><td>XL</td><td>24.5</td><td>30</td><td>20</td></tr>
            <tr><td>XXL</td><td>26</td><td>31</td><td>21</td></tr>
          </tbody>
        </table>
      ),
    },
    {
      title: 'Shipping & Returns',
      content: (
        <ul className={styles.list}>
          <li>Dispatched within 24 hours, delivered in 2–4 days.</li>
          <li>Free shipping on all orders above ₹2,499.</li>
          <li>7-day no-questions returns. Size swaps are free.</li>
        </ul>
      ),
    },
  ];
}

export default function ProductPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { products, status } = useProducts();
  const { addToCart, openCart } = useCart();

  const product = useMemo(
    () => products.find((p) => String(p.id) === String(productId)),
    [products, productId]
  );


  const [size, setSize] = useState(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  // Reset per-product chooser state on navigation.
  useEffect(() => {

    setSize(null);
    setQty(1);
    setAdded(false);
  }, [productId]);

  const related = useMemo(
    () => products.filter((p) => p.category === product?.category && p.id !== product?.id),
    [products, product]
  );

  const youMayAlsoLike = useMemo(
    () => products.filter((p) => p.id !== product?.id && p.category !== product?.category),
    [products, product]
  );

  if (status === 'loading') {
    return <Loader fullscreen label="Loading product" />;
  }

  if (!product) {
    return (
      <section className={`page ${styles.section}`}>
        <p className="page-kicker">Product</p>
        <h1 className="page-title">Not found.</h1>
        <p className="page-lead">This piece doesn&apos;t exist.</p>
        <Link className={styles.backToBags} to="/collections">
          Back to collections
        </Link>
      </section>
    );
  }

  const price = Number(product.price) || 0;
  const oldPrice = Number(product.oldPrice) || 0;
  const showOld = oldPrice > 0 && oldPrice > price;
  const discount = showOld ? Math.round((1 - price / oldPrice) * 100) : 0;
  const stockQuantity = Number(product.stockQuantity) || 0;
  const outOfStock = stockQuantity <= 0;
  const lowStock = !outOfStock && stockQuantity <= 5;
  const unavailable = pickUnavailable(product.id);

  const gallery = [
    product.imageUrl,
    ...(Array.isArray(product.imageGallery) ? product.imageGallery : []),
  ]
    .map(resolveUrl)
    .filter(Boolean);

  const productSizes = Array.isArray(product.sizes) && product.sizes.length > 0
    ? product.sizes
    : SIZES;

  const handleAdd = () => {
    if (outOfStock || added) return;
    addToCart(product, {
      size: size || DEFAULT_SIZE,
      quantity: qty,
    });
    openCart();
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2200);
  };

  const handleBuyNow = () => {
    if (outOfStock) return;
    addToCart(product, {
      size: size || DEFAULT_SIZE,
      quantity: qty,
    });
    navigate('/cart');
  };

  const parent = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.05 } },
  };

  return (
    <>
      <div className={`page ${styles.page}`}>
        <article className={styles.article}>
          <div className={styles.gallery}>
            <ProductGallery images={gallery} productName={product.name} />
          </div>

          <motion.div
            className={styles.info}
            variants={parent}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={fadeUp}>
              <p className={styles.cat}>{product.category}</p>
              <h1 className={styles.title}>{product.name}</h1>
            </motion.div>

            <motion.div variants={fadeUp} className={styles.priceBlock}>
              <div className={styles.priceRow}>
                <span className={styles.price}>₹ {inr(price)}</span>
                {showOld && <span className={styles.old}>₹ {inr(oldPrice)}</span>}
                {showOld && (
                  <span className={styles.discount} aria-hidden="true">
                    −{discount}%
                  </span>
                )}
              </div>
              <p className={cn(styles.availability, lowStock && styles.availabilityLow)}>
                <span className={styles.dot} aria-hidden="true" />
                {outOfStock
                  ? 'Currently unavailable'
                  : lowStock
                    ? `Only ${stockQuantity} left in stock`
                    : `In stock · ${stockQuantity}`}
              </p>
            </motion.div>

            <motion.p variants={fadeUp} className={styles.desc}>
              {product.description ||
                'A ALTNEU piece. Clean lines, real weight, zero noise.'}
            </motion.p>

            <motion.div variants={fadeUp} className={styles.choosers}>

              <SizeSelector
                sizes={productSizes}
                value={size}
                onChange={setSize}
                unavailable={unavailable}
              />
              <QuantitySelector value={qty} onChange={setQty} disabled={outOfStock} />
            </motion.div>

            <motion.div variants={fadeUp} className={styles.actions}>
              <button
                type="button"
                className={cn(styles.add, added && styles.added)}
                onClick={handleAdd}
                disabled={outOfStock}
              >
                {added ? 'Added ✓' : 'Add to Cart'}
              </button>
              <button
                type="button"
                className={styles.buy}
                onClick={handleBuyNow}
                disabled={outOfStock}
              >
                Buy Now
              </button>
              <WishlistButton product={product} size="md" className={styles.wishlist} />
            </motion.div>

            <motion.div variants={fadeUp}>
              <DeliveryInfo />
            </motion.div>

            <motion.div variants={fadeUp} className={styles.accordion}>
              <Accordion items={buildAccordion(product)} />
            </motion.div>

          </motion.div>
        </article>
      </div>

      <div className={styles.rails}>
        <RelatedProducts title="Related Products" products={related.slice(0, 4)} viewAllTo="/collections" id="related" />
        <RelatedProducts title="You May Also Like" products={youMayAlsoLike.slice(0, 4)} viewAllTo="/collections" id="youmayalso" />
        <RecentlyViewed products={products} excludedId={product.id} />
      </div>
    </>
  );
}