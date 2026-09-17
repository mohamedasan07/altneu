import useProducts from '../../hooks/useProducts';
import Hero from '../../components/Hero/Hero';
import Marquee from '../../components/Marquee/Marquee';
import NewArrivals from '../../components/home/NewArrivals';
import ShopByCategory from '../../components/home/ShopByCategory';
import BrandStory from '../../components/home/BrandStory';

export default function HomePage() {
  const { products, status } = useProducts();

  return (
    <>
      <Hero />
      <Marquee />
      <NewArrivals products={products} status={status} />
      <ShopByCategory products={products} status={status} />
      <BrandStory />
    </>
  );
}