import useProducts from '../../hooks/useProducts';
import Hero from '../../components/Hero/Hero';
import Marquee from '../../components/Marquee/Marquee';
import NewArrivals from '../../components/home/NewArrivals';
import ShopByCategory from '../../components/home/ShopByCategory';
import TopCategories from '../../components/home/TopCategories';
import StorefrontSkeleton from '../../components/skeleton/StorefrontSkeleton/StorefrontSkeleton';

export default function HomePage() {
  const { products, status } = useProducts();

  if (status === 'loading') {
    return <StorefrontSkeleton variant="home" />;
  }

  return (
    <>
      <Hero />
      <Marquee />
      <NewArrivals products={products} status={status} />
      <ShopByCategory products={products} status={status} />
      <TopCategories />
    </>
  );
}