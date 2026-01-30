import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from '@mui/material';
import {
  Add as AddIcon,
  Analytics as AnalyticsIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useStateInspectionStore } from '../stores/stateInspectionStore';
import { 
  getStateInspectionRecords, 
  getFleetAccounts, 
  getStateInspectionStats,
  PaginatedResponse
} from '../services/stateInspectionApi';
import { StateInspectionRecord } from '../types/stateInspection';
import AddRecordForm from '../components/StateInspection/AddRecordForm';
import RecordDeckView from '../components/StateInspection/RecordDeckView';
import AnalyticsView from '../components/StateInspection/AnalyticsView';
import { useNotification } from '../hooks/useNotification';
import NotificationSnackbar from '../components/NotificationSnackbar';

const StateInspectionRecords: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [autoReopen, setAutoReopen] = useState(false);
  const { notification, showSuccess, hideNotification, handleApiCall } = useNotification();

  
  const {
    records,
    fleetAccounts,
    stats,
    pagination,
    loading,
    error,
    setRecords,
    setPaginatedRecords,
    setFleetAccounts,
    setStats,
    setPagination,
    setLoading,
    setError,
    clearError,
    resetPagination
  } = useStateInspectionStore();

  // Check if we should show analytics based on URL parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === '2') {
      setShowAnalytics(true);
    }
  }, [searchParams]);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = useCallback(async (page = 1, pageSize = 50) => {
    setLoading(true);
    setError(null);
    
    try {
      const [recordsResponse, fleetAccountsData, statsData] = await Promise.all([
        getStateInspectionRecords({}, { page, pageSize }),
        getFleetAccounts(),
        getStateInspectionStats()
      ]);
      
      console.log('Loaded records response:', recordsResponse);
      console.log('Loaded fleet accounts data:', fleetAccountsData);
      console.log('Loaded stats data:', statsData);
      
      // Handle paginated response
      if (recordsResponse && 'data' in recordsResponse) {
        const paginatedData = recordsResponse as PaginatedResponse<StateInspectionRecord>;
        setPaginatedRecords(paginatedData.data, paginatedData.total, paginatedData.page, paginatedData.pageSize);
      } else {
        // Backward compatibility - non-paginated response
        setRecords((recordsResponse || []) as StateInspectionRecord[]);
      }
      
      setFleetAccounts(fleetAccountsData || []);
      setStats(statsData || { total: 0, passed: 0, failed: 0 });
    } catch (err: any) {
      console.error('Failed to load state inspection data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [setPaginatedRecords, setRecords, setFleetAccounts, setStats, setLoading, setError]);

  const handleRecordCreated = () => {
    // Show success notification
    showSuccess('State inspection record created successfully');
    
    // Refresh data after creating a new record
    loadData();
    
    // If auto-reopen is enabled, keep the form open
    if (autoReopen) {
      // Form will stay open for next record
      return;
    }
    
    // Otherwise close the form
    setShowAddForm(false);
  };

  const handleOpenAddForm = () => {
    setShowAddForm(true);
    setAutoReopen(true); // Enable auto-reopen when opened via button
  };

  const handleCloseAddForm = () => {
    setShowAddForm(false);
    setAutoReopen(false); // Disable auto-reopen when manually closed
  };



  if (loading && records.length === 0) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              State Inspections
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Manage state inspection records and track payments
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              startIcon={<AnalyticsIcon />}
              onClick={() => setShowAnalytics(true)}
              variant="outlined"
              size="small"
            >
              Analytics
            </Button>
            <Button
              startIcon={<AddIcon />}
              onClick={handleOpenAddForm}
              variant="contained"
              size="small"
            >
              Add Inspection
            </Button>
          </Box>
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert 
            severity="error" 
            onClose={clearError} 
            sx={{ mb: 3 }}
          >
            {error}
          </Alert>
        )}

        {/* Records Deck View */}
        <RecordDeckView
          records={records}
          fleetAccounts={fleetAccounts}
          pagination={pagination}
          onDataChange={loadData}
          onPageChange={(page, pageSize) => loadData(page, pageSize)}
        />



        {/* Add Record Dialog */}
        <Dialog 
          open={showAddForm} 
          onClose={handleCloseAddForm}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              State Inspection Form
              <IconButton onClick={handleCloseAddForm}>
                <CloseIcon />
              </IconButton>
            </Box>
          </DialogTitle>
          <DialogContent>
            <AddRecordForm 
              onRecordCreated={handleRecordCreated}
              fleetAccounts={fleetAccounts}
            />
          </DialogContent>
        </Dialog>

        {/* Analytics Dialog */}
        <Dialog 
          open={showAnalytics} 
          onClose={() => setShowAnalytics(false)}
          maxWidth="xl"
          fullWidth
          PaperProps={{
            sx: { height: '90vh' }
          }}
        >
          <DialogTitle>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              State Inspection Analytics
              <IconButton onClick={() => setShowAnalytics(false)}>
                <CloseIcon />
              </IconButton>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ p: 0 }}>
            <AnalyticsView
              records={records}
              stats={stats}
              onRefresh={loadData}
            />
          </DialogContent>
        </Dialog>
      </Box>

      {/* Notification Snackbar */}
      <NotificationSnackbar
        notification={notification}
        onClose={hideNotification}
      />
    </Container>
  );
};

export default StateInspectionRecords; 