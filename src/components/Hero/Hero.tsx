import styles from './Hero.module.css';
import { siteConfig } from '../../config/site';

export const Hero = () => {
  return (
    <section className={styles.hero}>
      <div className={styles.hero__container}>
        <h1 className={styles.hero__title}>{siteConfig.name}</h1>
        <p className={styles.hero__subtitle}>{siteConfig.description}</p>
        <button className={styles.hero__button}>INITIALIZE SYSTEM</button>
      </div>
    </section>
  );
};
