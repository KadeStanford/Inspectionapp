import React, { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Avatar,
  Chip
} from '@mui/material';
import Grid from '../components/CustomGrid';
import {
  Security as SecurityIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { updateProfile, getUserProfile } from '../services/api';
import { auth } from '../services/firebase';
import { updatePassword as firebaseUpdatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';

interface UserData {
  name: string;
  email: string;
  pin: string;
}

const Profile: React.FC = () => {
  const [userData, setUserData] = useState<UserData>({
    name: '',
    email: '',
    pin: ''
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [pinData, setPinData] = useState({
    newPin: '',
    confirmPin: ''
  });
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    try {
      setProfileLoading(true);
      const profile = await getUserProfile();
      setUserData({
        name: profile.name,
        email: profile.email,
        pin: profile.pin || ''
      });
      // Also update localStorage
      localStorage.setItem('userName', profile.name);
      localStorage.setItem('userEmail', profile.email);
    } catch (err: any) {
      console.error('Failed to load profile:', err);
      // Fallback to localStorage
      const userName = localStorage.getItem('userName') || '';
      const userEmail = localStorage.getItem('userEmail') || '';
      setUserData({ name: userName, email: userEmail, pin: '' });
    } finally {
      setProfileLoading(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const names = name.trim().split(' ');
    if (names.length === 1) {
      return names[0].charAt(0).toUpperCase();
    }
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      await updateProfile(userData.name, userData.email);
      localStorage.setItem('userName', userData.name);
      localStorage.setItem('userEmail', userData.email);
      setSuccess('Profile updated successfully!');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handlePinUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');

    if (pinData.newPin !== pinData.confirmPin) {
      setPinError('PINs do not match');
      return;
    }

    if (!/^\d{4}$/.test(pinData.newPin)) {
      setPinError('PIN must be exactly 4 digits');
      return;
    }

    setPinLoading(true);

    try {
      await updateProfile(userData.name, userData.email, pinData.newPin);
      setPinSuccess('PIN updated successfully!');
      setPinData({ newPin: '', confirmPin: '' });
      setUserData({ ...userData, pin: pinData.newPin });
    } catch (err: any) {
      setPinError(err.response?.data?.error || 'Failed to update PIN');
    } finally {
      setPinLoading(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long');
      return;
    }

    setPasswordLoading(true);

    try {
      const user = auth?.currentUser;
      if (!user || !user.email) {
        throw new Error('No authenticated user found. Please log in again.');
      }

      // Re-authenticate the user first
      const credential = EmailAuthProvider.credential(user.email, passwordData.currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Now update the password
      await firebaseUpdatePassword(user, passwordData.newPassword);
      
      setPasswordSuccess('Password updated successfully!');
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (err: any) {
      console.error('Password update error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPasswordError('Current password is incorrect');
      } else if (err.code === 'auth/weak-password') {
        setPasswordError('New password is too weak. Please choose a stronger password.');
      } else if (err.code === 'auth/requires-recent-login') {
        setPasswordError('Please log out and log back in before changing your password.');
      } else {
        setPasswordError(err.message || 'Failed to update password');
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  if (profileLoading) {
    return (
      <Container maxWidth="md">
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom align="center">
          Profile Settings
        </Typography>

        <Grid container spacing={4}>
          {/* Profile Information */}
          <Grid item xs={12} md={6}>
            <Paper elevation={3} sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Avatar
                  sx={{
                    width: 80,
                    height: 80,
                    fontSize: '2rem',
                    bgcolor: 'primary.main',
                    mr: 2
                  }}
                >
                  {getInitials(userData.name)}
                </Avatar>
                <Box>
                  <Typography variant="h6" component="h2">
                    {userData.name || 'User'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {userData.email}
                  </Typography>
                </Box>
              </Box>

              <Typography variant="h6" gutterBottom>
                Update Profile Information
              </Typography>

              <form onSubmit={handleProfileUpdate}>
                <TextField
                  fullWidth
                  label="Full Name"
                  value={userData.name}
                  onChange={(e) => setUserData({ ...userData, name: e.target.value })}
                  margin="normal"
                  required
                  autoComplete="name"
                />
                
                <TextField
                  fullWidth
                  label="Email"
                  type="email"
                  value={userData.email}
                  onChange={(e) => setUserData({ ...userData, email: e.target.value })}
                  margin="normal"
                  required
                  autoComplete="email"
                />

                {error && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {error}
                  </Alert>
                )}

                {success && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    {success}
                  </Alert>
                )}

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={loading}
                  sx={{ mt: 3 }}
                >
                  {loading ? <CircularProgress size={24} /> : 'Update Profile'}
                </Button>
              </form>
            </Paper>
          </Grid>

          {/* Password Update */}
          <Grid item xs={12} md={6}>
            <Paper elevation={3} sx={{ p: 4 }}>
              <Typography variant="h6" gutterBottom>
                Change Password
              </Typography>

              <form onSubmit={handlePasswordUpdate}>
                <TextField
                  fullWidth
                  label="Current Password"
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  margin="normal"
                  required
                  autoComplete="current-password"
                />
                
                <TextField
                  fullWidth
                  label="New Password"
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  margin="normal"
                  required
                  autoComplete="new-password"
                  helperText="Password must be at least 6 characters long"
                />
                
                <TextField
                  fullWidth
                  label="Confirm New Password"
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  margin="normal"
                  required
                  autoComplete="new-password"
                />

                {passwordError && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {passwordError}
                  </Alert>
                )}

                {passwordSuccess && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    {passwordSuccess}
                  </Alert>
                )}

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={passwordLoading}
                  sx={{ mt: 3 }}
                >
                  {passwordLoading ? <CircularProgress size={24} /> : 'Update Password'}
                </Button>
              </form>
            </Paper>
          </Grid>

          {/* PIN Management */}
          <Grid item xs={12}>
            <Paper elevation={3} sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <SecurityIcon sx={{ mr: 2, fontSize: '2rem', color: 'primary.main' }} />
                <Box>
                  <Typography variant="h6" gutterBottom>
                    PIN Management
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Set or update your 4-digit PIN for quick identification on shared computers
                  </Typography>
                </Box>
                {userData.pin && (
                  <Chip
                    label={`Current PIN: ${userData.pin}`}
                    variant="outlined"
                    sx={{ ml: 'auto', fontFamily: 'monospace', fontSize: '1rem' }}
                  />
                )}
              </Box>

              <form onSubmit={handlePinUpdate}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="New 4-Digit PIN"
                      value={pinData.newPin}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setPinData({ ...pinData, newPin: value });
                      }}
                      margin="normal"
                      required
                      inputProps={{
                        maxLength: 4,
                        pattern: '[0-9]*',
                        inputMode: 'numeric',
                        style: { textAlign: 'center', fontSize: '1.2em', letterSpacing: '0.5em' }
                      }}
                      helperText="Choose a unique 4-digit PIN"
                    />
                  </Grid>
                  
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Confirm PIN"
                      value={pinData.confirmPin}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setPinData({ ...pinData, confirmPin: value });
                      }}
                      margin="normal"
                      required
                      inputProps={{
                        maxLength: 4,
                        pattern: '[0-9]*',
                        inputMode: 'numeric',
                        style: { textAlign: 'center', fontSize: '1.2em', letterSpacing: '0.5em' }
                      }}
                      helperText="Re-enter your PIN to confirm"
                    />
                  </Grid>
                </Grid>

                {pinError && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {pinError}
                  </Alert>
                )}

                {pinSuccess && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    {pinSuccess}
                  </Alert>
                )}

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={pinLoading || !pinData.newPin || !pinData.confirmPin}
                  sx={{ mt: 3 }}
                  startIcon={<SecurityIcon />}
                >
                  {pinLoading ? <CircularProgress size={24} /> : userData.pin ? 'Update PIN' : 'Set PIN'}
                </Button>
              </form>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
};

export default Profile; 