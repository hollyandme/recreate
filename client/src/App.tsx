import { NavLink, Outlet } from 'react-router-dom';
import { LibraryProvider } from './lib/store';

/**
 * Embed mode (?embed=1) hides Recreate's own sidebar so the app can be framed
 * inside another shell (e.g. the Cadence dashboard) without a duplicate nav.
 */
function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  const fromQuery = p.get('embed') === '1' || p.get('embed') === 'true';
  // Sticky: internal navigations (idea → brief, print) drop the query string,
  // so remember the mode for the lifetime of this frame's session.
  try {
    if (fromQuery) sessionStorage.setItem('recreate:embed', '1');
    return fromQuery || sessionStorage.getItem('recreate:embed') === '1';
  } catch {
    return fromQuery;
  }
}

export function App() {
  const embed = isEmbedded();

  return (
    <LibraryProvider>
      <div className={`app-root${embed ? ' is-embed' : ''}`}>
        <div className="ground no-print" />
        <div className="ground-lens no-print" />

        <div className={`shell${embed ? ' is-embed' : ''}`}>
          {!embed && (
            <aside className="sidebar no-print">
              <div className="brand">
                <span className="medallion">
                  <i className="ph ph-bookmarks-simple" />
                </span>
                <span>Recreate</span>
              </div>
              <nav className="sidenav">
                <NavLink
                  to="/ideas"
                  className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
                >
                  <i className="ph ph-bookmarks-simple" />
                  <span>Format ideas</span>
                </NavLink>
                <NavLink
                  to="/briefs"
                  className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
                >
                  <i className="ph ph-list-numbers" />
                  <span>Creator briefs</span>
                </NavLink>
              </nav>
            </aside>
          )}

          <main className="main">
            <Outlet />
          </main>
        </div>
      </div>
    </LibraryProvider>
  );
}
