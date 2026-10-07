import { AnimatePresence } from 'framer-motion';
import { useCart } from '../../hooks/useCart';
import Button from '../../components/ui/Button/Button';
import CartItem from '../../components/cart/CartItem/CartItem';
import CartSummary from '../../components/cart/CartSummary/CartSummary';
import EmptyCart from '../../components/cart/EmptyCart/EmptyCart';
import styles from './CartPage.module.css';

export default function CartPage() {
  const { items, count, totals, removeFromCart, increaseQuantity, decreaseQuantity } = useCart();

  if (items.length === 0) {
    return (
      <section className={`page ${styles.section}`} aria-labelledby="cart-title">
        <header className={styles.header}>
          <p className="page-kicker">Bag</p>
          <h1 id="cart-title" className="page-title">
            Your Bag.
          </h1>
        </header>
        <EmptyCart />
      </section>
    );
  }

  return (
    <section className={`page ${styles.section}`} aria-labelledby="cart-title">
      <header className={styles.header}>
        <p className="page-kicker">Bag</p>
        <h1 id="cart-title" className="page-title">
          Your Bag.
        </h1>
        <p className="page-lead">
          {count} {count === 1 ? 'piece' : 'pieces'} ready for the next fit.
        </p>
      </header>

      <div className={styles.layout}>
        <ul className={styles.list} aria-label="Cart items">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <CartItem
                key={item.id}
                item={item}
                onRemove={() => removeFromCart(item.id)}
                onIncrease={() => increaseQuantity(item.id)}
                onDecrease={() => decreaseQuantity(item.id)}
              />
            ))}
          </AnimatePresence>
        </ul>

        <aside className={styles.aside} aria-label="Order summary">
          <CartSummary items={items} />
          <Button to="/checkout" variant="primary" size="lg" className={styles.checkout}>
            Checkout
          </Button>
          <Button to="/collections" variant="outline" size="lg" className={styles.continue}>
            Continue Shopping
          </Button>
        </aside>
      </div>
    </section>
  );
}