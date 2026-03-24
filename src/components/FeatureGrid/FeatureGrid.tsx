import styles from './FeatureGrid.module.css';
import { siteConfig } from '../../config/site';

export const FeatureGrid = () => {
  return (
    <section className={styles['feature-grid']}>
      <div className={styles['feature-grid__container']}>
        {siteConfig.features.map((feature, index) => (
          <div key={index} className={styles['feature-grid__item']}>
            <h3 className={styles['feature-grid__item-title']}>{feature.title}</h3>
            <p className={styles['feature-grid__item-desc']}>{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
