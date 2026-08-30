import { NavLink, Outlet } from 'react-router-dom';
import { LibraryProvider } from './lib/store';

export function App() {
  return (
    <LibraryProvider>
      <div className="app-root">
        <div className="ground no-print" />
        <div className="ground-lens no-print" />

        <div className="shell">
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

          <main className="main">
            <Outlet />
          </main>
        </div>
      </div>
    </LibraryProvider>
  );
}
