import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Fab
} from '@mui/material';
import { login } from '../services/auth';
import SafariCompatibilityWarning from '../components/SafariCompatibilityWarning';
import { logLoginAttempt, showSafariAlert, detectBrowser, testStorage } from '../services/safariDebug';
import { runQuickSafariDebug, showSimpleStorageInfo } from '../services/simpleSafariDebug';
import MobileDebugger from '../components/MobileDebugger';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [showMobileDebugger, setShowMobileDebugger] = useState(false);
  const [lastError, setLastError] = useState<any>(null);
  const [certificateDialogOpen, setCertificateDialogOpen] = useState(false);
  const [certificateUrl, setCertificateUrl] = useState('');
  const [debugMode, setDebugMode] = useState(false);
  const [expiredMessage, setExpiredMessage] = useState('');
  const [isCertificateApprovalFlow, setIsCertificateApprovalFlow] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Get the return URL from location state, or default to '/'
  const from = (location.state as any)?.from?.pathname || '/';

  // Check for expired session parameter
  useEffect(() => {
    const expired = searchParams.get('expired');
    if (expired === 'true') {
      setExpiredMessage('Your session has expired. Please log in again.');
    }
  }, [searchParams]);

  // Safari debugging on component mount
  useEffect(() => {
    const browser = detectBrowser();
    const storage = testStorage();
    
    console.log('🔍 Login Component Loaded');
    console.log('Browser:', browser);
    console.log('Storage Status:', storage);
    
    if (debugMode && browser.includes('Safari')) {
      console.log('🦄 Safari detected - Enhanced debugging enabled');
      showSafariAlert(`Safari detected! Debug mode active.<br>Storage: ${storage.localStorage ? 'localStorage ✅' : storage.sessionStorage ? 'sessionStorage ⚠️' : 'blocked ❌'}`);
    }
  }, [debugMode]);

  // Safari-compatible localStorage with extensive logging
  const safariSetItem = (key: string, value: string) => {
    console.log(`🔧 Attempting to store ${key}...`);
    try {
      localStorage.setItem(key, value);
      console.log(`✅ localStorage.setItem(${key}) - SUCCESS`);
    } catch (e) {
      console.warn(`❌ localStorage.setItem(${key}) - FAILED:`, e);
      try {
        sessionStorage.setItem(key, value);
        console.log(`✅ sessionStorage.setItem(${key}) - SUCCESS (fallback)`);
        showSafariAlert(`Using sessionStorage fallback for ${key}`);
      } catch (sessionError) {
        console.error(`❌ sessionStorage.setItem(${key}) - FAILED:`, sessionError);
        showSafariAlert(`❌ Storage completely blocked! Login may not persist.`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Clear previous debug info
    setDebugInfo('');

    try {
      console.log('🚀 Login attempt starting...');
      console.log('Original email:', `"${email}"`);
      
      // Normalize email for Safari compatibility
      const normalizedEmail = email.toLowerCase().trim();
      console.log('Normalized email:', `"${normalizedEmail}"`);
      
      // Log the attempt for debugging
      const debugLog = logLoginAttempt(email);
      console.log('Debug log created:', debugLog);
      
      // Show debug info in UI for Safari users - only if debug mode is active
      if (debugMode && detectBrowser().includes('Safari')) {
        setDebugInfo(`Attempting login with: "${normalizedEmail}"`);
      }
      
      console.log('📡 Calling login API...');
      const { token, email: responseEmail, name, role, userId } = await login(normalizedEmail, password);
      
      console.log('✅ Login API response received');
      console.log('Token present:', !!token);
      console.log('Response email:', responseEmail);
      console.log('User name:', name);
      console.log('User ID:', userId);
      
      // Use Safari-compatible storage
      console.log('💾 Storing authentication data...');
      safariSetItem('token', token);
      safariSetItem('userName', name);
      safariSetItem('userEmail', responseEmail);
      safariSetItem('userRole', role);
      safariSetItem('userId', userId);
      
      console.log('🎯 Login successful, navigating...');
      if (debugMode) {
        showSafariAlert('✅ Login successful!');
      }
      // Reset certificate approval flow on successful login
      setIsCertificateApprovalFlow(false);
      navigate(from, { replace: true });
      
    } catch (err: any) {
      console.error('❌ Login failed - Full error details:', err);
      
      // Enhanced error logging for Safari debugging
      const errorDetails = {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        code: err.code,
        stack: err.stack
      };
      
             logLoginAttempt(email, errorDetails);
       setLastError(errorDetails);
       
       // Enhanced error handling for Safari
      let errorMessage = 'Invalid email or password';
      
      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
        console.log('Server error message:', errorMessage);
      } else if (err.code === 'ERR_NETWORK' || err.message.includes('Network Error')) {
        errorMessage = 'Network error. Please check your connection and try again.';
        console.log('Network error detected');
        
        // Check if this might be a certificate issue
        if (err.message.includes('Load failed') || err.message.includes('NetworkError')) {
          const getApiUrl = () => {
            const protocol = 'https';
            const hostname = window.location.hostname;
            return `${protocol}://${hostname}:5001`;
          };
          const baseUrl = getApiUrl();
          setCertificateUrl(baseUrl);
          setCertificateDialogOpen(true);
        }
      } else if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
        errorMessage = 'Request timeout. Please try again.';
        console.log('Timeout error detected');
      }
      
      setError(errorMessage);
      
             // Show detailed error for Safari debugging - only if debug mode is active
       if (debugMode && detectBrowser().includes('Safari')) {
         const failedEmail = email.toLowerCase().trim();
         const debugDetails = `
❌ Login Failed in Safari
Email: "${email}" → "${failedEmail}"
Error: ${errorMessage}
Status: ${err.response?.status || 'No response'}
Code: ${err.code || 'Unknown'}
         `;
         setDebugInfo(debugDetails);
         showSafariAlert(`❌ Login failed: ${errorMessage}<br>Check console for details.`);
       }
      
    } finally {
      setLoading(false);
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const originalValue = e.target.value;
    // Prevent Safari's auto-capitalization and auto-correction
    const value = originalValue.toLowerCase().trim();
    console.log(`📝 Email input: "${originalValue}" → "${value}"`);
    setEmail(value);
  };

  // Custom testApiOnly with dialog support
  const testApiOnly = async () => {
    const getApiUrl = () => {
      const protocol = 'https';
      const hostname = window.location.hostname;
      return `${protocol}://${hostname}:5001/api`;
    };

    const apiUrl = getApiUrl();
    
    // Check for mixed content first
    const frontendProtocol = window.location.protocol;
    const apiProtocol = apiUrl.startsWith('https') ? 'https:' : 'http:';
    
    if (frontendProtocol === 'https:' && apiProtocol === 'http:') {
      alert('🚨 MIXED CONTENT DETECTED!\n\nHTTPS page cannot call HTTP API.\n\nThe backend server must use HTTPS.');
      return;
    }
    
    try {
      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(`✅ HTTPS API Connection: SUCCESS\n\nServer Status: ${data.status}\nMessage: ${data.message}\nProtocol: ${data.protocol}\nSecure: ${data.secure}`);
      } else {
        alert(`❌ HTTPS API Connection: FAILED\nStatus: ${response.status}\n\nThe server responded but the health endpoint returned an error.`);
      }
    } catch (error: any) {
      if (error.message.includes('Load failed') || error.message.includes('NetworkError')) {
        const baseUrl = apiUrl.replace('/api', '');
        setCertificateUrl(baseUrl);
        setCertificateDialogOpen(true);
      } else {
        alert(`❌ HTTPS API Connection: ERROR\n${error.message}\n\nCheck:\n- Server running on HTTPS?\n- Same network?\n- Certificate valid?`);
      }
    }
  };

  const toggleDebugMode = () => {
    setDebugMode(!debugMode);
    // Clear debug info when turning off debug mode
    if (debugMode) {
      setDebugInfo('');
    }
  };

  // Handle "Go to the site anyway" action for certificate approval
  const handleGoToSiteAnyway = () => {
    setIsCertificateApprovalFlow(true);
    setCertificateDialogOpen(false);
    
    // Open the backend URL in a new tab/window
    const backendUrl = certificateUrl;
    const newWindow = window.open(backendUrl, '_blank');
    
    if (newWindow) {
      // Show a message to the user
      alert('🔒 Certificate Approval Required\n\nA new tab has opened with the backend server.\n\nPlease:\n1. Click "Advanced" on the security warning\n2. Click "Continue to [IP address] (unsafe)"\n3. Close that tab and return here\n4. Try logging in again');
      
      // Focus back to the current window after a short delay
      setTimeout(() => {
        window.focus();
      }, 1000);
    } else {
      // If popup was blocked, show instructions
      alert('🔒 Popup Blocked\n\nPlease manually navigate to:\n' + backendUrl + '\n\nThen:\n1. Click "Advanced" on the security warning\n2. Click "Continue to [IP address] (unsafe)"\n3. Return here and try logging in again');
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: 4
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 4,
            width: '100%',
            maxWidth: 400
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Typography variant="h4" component="h1" gutterBottom>
              Sign In
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in to your account to continue
            </Typography>
          </Box>

          {/* Expired Session Message */}
          {expiredMessage && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {expiredMessage}
            </Alert>
          )}

          {/* Certificate Approval Flow Indicator */}
          {isCertificateApprovalFlow && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>Certificate Approval in Progress</strong>
                <br />
                Please complete the certificate approval in the new tab, then return here to log in.
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setIsCertificateApprovalFlow(false)}
                sx={{ mt: 1 }}
              >
                I've completed the approval
              </Button>
            </Alert>
          )}

          {/* Debug Information - Only show when debug mode is active */}
          {debugMode && (
            <>
              <SafariCompatibilityWarning />
              
              {/* Safari Debug Info Display */}
              {debugInfo && detectBrowser().includes('Safari') && (
                <Alert severity="info" sx={{ mb: 2, fontSize: '0.8rem' }}>
                  <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                    {debugInfo}
                  </Typography>
                </Alert>
              )}
            </>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              margin="normal"
              required
              autoFocus
              // Safari-specific attributes
              inputProps={{
                autoComplete: "email",
                autoCapitalize: "none",
                autoCorrect: "off",
                spellCheck: "false"
              }}
              // Additional Safari input handling
              onBlur={(e) => {
                // Ensure email is normalized on blur
                const normalizedEmail = e.target.value.toLowerCase().trim();
                console.log(`👁️ Email blur: "${e.target.value}" → "${normalizedEmail}"`);
                if (normalizedEmail !== email) {
                  setEmail(normalizedEmail);
                }
              }}
            />
            
            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              // Safari-specific attributes
              inputProps={{
                autoComplete: "current-password",
                autoCapitalize: "none",
                autoCorrect: "off",
                spellCheck: "false"
              }}
            />

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 3, mb: 2 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Sign In'}
            </Button>

            {/* Debug Buttons */}
            {debugMode && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setShowMobileDebugger(true)}
                  sx={{ fontSize: '0.7rem' }}
                >
                  🔍 Open Safari Debugger
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => runQuickSafariDebug(email, password)}
                  sx={{ fontSize: '0.7rem' }}
                >
                  ⚡ Quick Debug Test
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={testApiOnly}
                  sx={{ fontSize: '0.7rem' }}
                >
                  🔗 Test API Only
                </Button>
              </Box>
            )}

            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Typography variant="body2">
                Don't have an account?{' '}
                <Link to="/register" style={{ textDecoration: 'none' }}>
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{
                      color: 'primary.main',
                      cursor: 'pointer',
                      '&:hover': {
                        textDecoration: 'underline'
                      }
                    }}
                  >
                    Sign up here
                  </Typography>
                </Link>
              </Typography>
            </Box>
          </form>
        </Paper>
      </Box>
      
      {/* Mobile Safari Debugger */}
      <MobileDebugger
        open={showMobileDebugger}
        onClose={() => setShowMobileDebugger(false)}
        lastError={lastError}
        lastEmailInput={email}
      />

      {/* Certificate Dialog */}
      <Dialog
        open={certificateDialogOpen}
        onClose={() => setCertificateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ backgroundColor: '#f44336', color: 'white' }}>
          🔒 HTTPS Security Issue
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="h6">Certificate Not Trusted</Typography>
            <Typography variant="body2">
              The backend server's HTTPS certificate needs to be accepted before you can log in.
            </Typography>
          </Alert>
          
          <Typography variant="body1" sx={{ mb: 2 }}>
            This is a development server with a self-signed certificate. You need to approve it:
          </Typography>
          
          <Paper sx={{ p: 2, backgroundColor: '#f5f5f5', mb: 2 }}>
            <Typography 
              variant="h6" 
              component="a" 
              href={certificateUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ 
                color: '#1976d2',
                textDecoration: 'underline',
                wordBreak: 'break-all',
                display: 'block'
              }}
            >
              {certificateUrl}
            </Typography>
          </Paper>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            <strong>Steps to approve:</strong>
            <br />1. Click "Go to the site anyway" below
            <br />2. Click "Advanced" on the security warning
            <br />3. Click "Continue to [IP address] (unsafe)"
            <br />4. Return here and try logging in again
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={handleGoToSiteAnyway}
            variant="contained"
            color="primary"
            size="large"
            sx={{ mr: 1 }}
          >
            🔗 Go to the site anyway
          </Button>
          <Button 
            onClick={() => setCertificateDialogOpen(false)}
            variant="outlined"
            size="large"
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

        {/* Debug Toggle Circle */}
        <Fab
          size="small"
          onClick={toggleDebugMode}
          sx={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            backgroundColor: debugMode ? '#4caf50' : '#c0c0c0',
            color: debugMode ? 'white' : '#666',
            width: 40,
            height: 40,
            minHeight: 40,
            '&:hover': {
              backgroundColor: debugMode ? '#45a049' : '#b0b0b0'
            },
            fontSize: '0.8rem',
            zIndex: 1000
          }}
        >
          🔍
        </Fab>
      </Container>
    );
  };

export default Login; 