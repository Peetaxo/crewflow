import { createPortal } from 'react-dom';

// The document owns the animated SVG so a handoff between gates keeps its timeline.
export default function AppLoadingMark() {
  const status = <span role="status" aria-label="Připravuji aplikaci" />;
  const host = document.getElementById('nodu-loading-status');
  return host ? createPortal(status, host) : status;
}
