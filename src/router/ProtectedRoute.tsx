import { useEffect, useState, type ReactElement } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { detectApiBaseFromLocation } from '@/utils/connection';

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const managementKey = useAuthStore((state) => state.managementKey);
  const apiBase = useAuthStore((state) => state.apiBase);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const tryRestore = async () => {
      if (!isAuthenticated && managementKey && apiBase) {
        setChecking(true);
        try {
          const detectedBase = detectApiBaseFromLocation();
          const hostedManagementPage =
            typeof window !== 'undefined' &&
            /\/management\.html$/i.test(window.location.pathname);
          const result = await restoreSession({
            expectedMode: 'local',
            expectedPanelBase: hostedManagementPage ? detectedBase : undefined,
          });
          if (result) navigate(location.pathname, { replace: true });
        } finally {
          setChecking(false);
        }
      }
    };
    tryRestore();
  }, [apiBase, isAuthenticated, location.pathname, managementKey, navigate, restoreSession]);

  if (checking) {
    return (
      <div className="main-content">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
