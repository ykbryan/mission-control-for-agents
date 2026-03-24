import { siteConfig } from "../config/site";
import { Hero } from "../components/Hero/Hero";
import { FeatureGrid } from "../components/FeatureGrid/FeatureGrid";

export default function Home() {
  return (
    <main>
      <Hero title={siteConfig.title} subtitle={siteConfig.subtitle} />
      <FeatureGrid features={siteConfig.features} />
    </main>
  );
}
