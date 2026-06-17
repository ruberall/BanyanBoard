import { Link } from 'react-router-dom'
import styles from './NotFoundPage.module.css'

export function NotFoundPage() {
  return (
    <div className={styles.page}>
      <h1>Not Found</h1>
      <p>The page you were looking for does not exist.</p>
      <Link to="/">Back to boards</Link>
    </div>
  )
}
