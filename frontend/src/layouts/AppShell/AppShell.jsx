import styles from "./AppShell.module.css";

export default function AppShell({ children }) {
  return (
    <div className={styles.shell}>
      {children}
    </div>
  );
}