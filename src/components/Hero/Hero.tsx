import React from 'react';
import styles from './Hero.module.css';

interface HeroProps {
  title: string;
  subtitle: string;
}

export const Hero: React.FC<HeroProps> = ({ title, subtitle }) => {
  return (
    <section className={styles.hero}>
      <h1 className={styles.hero__title}>{title}</h1>
      <p className={styles.hero__subtitle}>{subtitle}</p>
    </section>
  );
};
