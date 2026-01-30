import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Box
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import { getUsers, deleteUser, enableUser, disableUser, updateUserRole } from '../services/api';

interface User {
  email: string;
  name: string;
  enabled: boolean;
  role: string;
  pin?: string;
}

const UsersContent: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await getUsers();
      setUsers(data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    try {
      await deleteUser(selectedUser.email);
      setUsers(users.filter(user => user.email !== selectedUser.email));
      setSuccess('User deleted successfully');
      setDeleteDialogOpen(false);
      setSelectedUser(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    try {
      if (user.enabled) {
        await disableUser(user.email);
        setUsers(users.map(u => 
          u.email === user.email ? { ...u, enabled: false } : u
        ));
        setSuccess('User disabled successfully');
      } else {
        await enableUser(user.email);
        setUsers(users.map(u => 
          u.email === user.email ? { ...u, enabled: true } : u
        ));
        setSuccess('User enabled successfully');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update user status');
    }
  };

  const handleUpdateRole = async (user: User, newRole: string) => {
    try {
      await updateUserRole(user.email, newRole);
      setUsers(users.map(u => 
        u.email === user.email ? { ...u, role: newRole } : u
      ));
      setSuccess('User role updated successfully');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update user role');
    }
  };

  const openDeleteDialog = (user: User) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const getRoleColor = (role: string) => {
    const normalizedRole = normalizeRole(role);
    switch (normalizedRole) {
      case 'Admin':
        return 'error';
      case 'Service advisor':
        return 'warning';
      case 'Technician':
        return 'info';
      default:
        return 'default';
    }
  };

  // Normalize role from database to match Select options
  const normalizeRole = (role: string): string => {
    if (!role) return 'Technician';
    const lowerRole = role.toLowerCase();
    if (lowerRole === 'admin') return 'Admin';
    if (lowerRole === 'service advisor' || lowerRole === 'serviceadvisor' || lowerRole === 'service_advisor') return 'Service advisor';
    if (lowerRole === 'technician') return 'Technician';
    return 'Technician'; // Default fallback
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        User Management
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>PIN</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.email}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                      <Select
                        value={normalizeRole(user.role)}
                        onChange={(e) => handleUpdateRole(user, e.target.value)}
                        sx={{ 
                          '& .MuiSelect-select': { 
                            py: 0.5,
                            px: 1
                          }
                        }}
                      >
                        <MenuItem value="Technician">Technician</MenuItem>
                        <MenuItem value="Service advisor">Service Advisor</MenuItem>
                        <MenuItem value="Admin">Admin</MenuItem>
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontFamily: 'monospace',
                        fontSize: '1rem',
                        color: user.pin ? 'text.primary' : 'text.disabled'
                      }}
                    >
                      {user.pin || 'Not Set'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={user.enabled ? 'Active' : 'Inactive'} 
                      color={user.enabled ? 'success' : 'default'}
                      size="small"
                      onClick={() => handleToggleUserStatus(user)}
                      sx={{ 
                        cursor: 'pointer',
                        '&:hover': {
                          opacity: 0.8
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      onClick={() => openDeleteDialog(user)}
                      size="small"
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete {selectedUser?.name} ({selectedUser?.email})?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteUser} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UsersContent; 