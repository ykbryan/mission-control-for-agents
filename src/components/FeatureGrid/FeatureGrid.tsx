import React from 'react';
import styles from './FeatureGrid.module.css';

interface Feature {
  id: string;
  title: string;
  description: string;
}

interface FeatureGridProps {
  features: Feature[];
}

export const FeatureGrid: React.FC<FeatureGridProps> = ({ features }) => {
  return (
    <section className={styles['feature-grid']}>
      <div className={styles['feature-grid__container']}>
        {features.map((feature) => (
          <div key={feature.id} className={styles['feature-grid__item']}>
            <h2 className={styles['feature-grid__title']}>{feature.title}</h2>
            <p className={styles['feature-grid__desc']}>{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
