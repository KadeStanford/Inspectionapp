import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getItem } from '../services/safariStorage';
import tokenManager from '../services/tokenManager';
import { CircularProgress, Box } from '@mui/material';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  useEffect(() => {
    // Wait for Firebase auth to be ready
    const checkAuth = () => {
      if (tokenManager.isReady()) {
        const token = getItem('token');
        const hasValidAuth = !!token && !tokenManager.isTokenExpired(token);
        setIsAuthenticated(hasValidAuth);
        setIsLoading(false);
      } else {
        // Check again in 100ms if auth not ready yet
        setTimeout(checkAuth, 100);
      }
    };
    
    checkAuth();
  }, []);
  
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  
  if (!isAuthenticated) {
    console.log('🔐 Not authenticated in ProtectedRoute - redirecting to login');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return <>{children}</>;
};

export default ProtectedRoute; 