import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';

import './styles.css';
import { App } from './App';
import { IdeasScreen } from './screens/IdeasScreen';
import { BriefsScreen } from './screens/BriefsScreen';
import { PrintScreen } from './screens/PrintScreen';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/ideas" replace /> },
      { path: 'ideas', element: <IdeasScreen /> },
      { path: 'briefs', element: <BriefsScreen /> },
      { path: 'briefs/:id', element: <BriefsScreen /> },
      { path: 'briefs/:id/print', element: <PrintScreen /> },
      { path: '*', element: <Navigate to="/ideas" replace /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
