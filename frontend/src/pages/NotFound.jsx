import { Link } from 'react-router-dom';
import { Sprout } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="center-pad" style={{ minHeight: '100dvh' }}>
      <Sprout size={48} color="var(--emerald-700)" aria-hidden />
      <h1>Page not found</h1>
      <p className="muted">This path doesn’t lead to any field we know.</p>
      <Link className="btn btn-primary" to="/">Go home</Link>
    </div>
  );
}
