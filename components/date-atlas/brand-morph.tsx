import styles from "./brand-morph.module.css";

export function BrandMorph() {
  return <span className={`atlas-wordmark ${styles.brand}`} role="img" aria-label="A Date Atlas · adal.">
    <span aria-hidden="true">a<span className={styles.gap}> </span>d<span className={styles.date}>ate </span>a<span className={styles.at}>t</span>l<span className={styles.las}>as</span><span className={styles.dot}>.</span></span>
  </span>;
}
