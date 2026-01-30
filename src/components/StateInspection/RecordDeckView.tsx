import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Menu,
  Fade,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Avatar,
  Divider,
  InputAdornment,
  Autocomplete,
  Alert,
  Drawer,
  Toolbar,
  List,
  ListItem,
  Pagination,
  Stack,
} from '@mui/material';
import Grid from '../CustomGrid';
import {
  FilterList as FilterIcon,
  MoreVert as MoreVertIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  AttachFile as AttachFileIcon,
  Payment as PaymentIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon,
  AttachMoney as CashIcon,
  RequestPage as CheckIcon,
  DirectionsCar as FleetIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { StateInspectionRecord, FleetAccount, StateInspectionFilters } from '../../types/stateInspection';
import { deleteStateInspectionRecord, getUploadUrl } from '../../services/stateInspectionApi';
import { useStateInspectionStore, PaginationState } from '../../stores/stateInspectionStore';

interface RecordDeckViewProps {
  records: StateInspectionRecord[];
  fleetAccounts: FleetAccount[];
  pagination: PaginationState;
  onDataChange: () => void;
  onPageChange: (page: number, pageSize: number) => void;
}

const RecordDeckView: React.FC<RecordDeckViewProps> = ({ records, fleetAccounts, pagination, onDataChange, onPageChange }) => {
  const [filters, setFilters] = useState<StateInspectionFilters>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<StateInspectionRecord | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuRecord, setMenuRecord] = useState<StateInspectionRecord | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const { removeRecord, setError } = useStateInspectionStore();

  // NOTE: Auto-refresh on filter change has been disabled to prevent infinite loops.
  // Users can manually refresh using the refresh button if needed.

  const handleFilterChange = (key: keyof StateInspectionFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined
    }));
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, record: StateInspectionRecord) => {
    setMenuAnchor(event.currentTarget);
    setMenuRecord(record);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuRecord(null);
  };

  const handleViewRecord = (record: StateInspectionRecord) => {
    console.log('Viewing record:', record);
    console.log('Record properties:', Object.keys(record));
    setSelectedRecord(record);
    setViewDialogOpen(true);
    handleMenuClose();
  };

  const handleDeleteRecord = (record: StateInspectionRecord) => {
    setSelectedRecord(record);
    setDeleteDialogOpen(true);
    handleMenuClose();
  };

  const confirmDelete = async () => {
    if (!selectedRecord) return;

    try {
      await deleteStateInspectionRecord(selectedRecord.id);
      removeRecord(selectedRecord.id);
      setDeleteDialogOpen(false);
      setSelectedRecord(null);
      onDataChange();
    } catch (error) {
      console.error('Error deleting record:', error);
      setError('Failed to delete record');
    }
  };

  const getFleetAccountName = (fleetAccountId?: string) => {
    if (!fleetAccountId) return '';
    const account = fleetAccounts.find(acc => acc.id === fleetAccountId);
    return account?.name || 'Unknown Fleet';
  };

  const getPaymentColor = (paymentType: string) => {
    switch (paymentType) {
      case 'Cash': return 'success';
      case 'Check': return 'info';
      case 'Fleet': return 'warning';
      default: return 'default';
    }
  };

  const getPaymentIcon = (paymentType: string) => {
    switch (paymentType) {
      case 'Cash': return <CashIcon sx={{ fontSize: 20, color: 'success.main' }} />;
      case 'Check': return <CheckIcon sx={{ fontSize: 20, color: 'info.main' }} />;
      case 'Fleet': return <FleetIcon sx={{ fontSize: 20, color: 'warning.main' }} />;
      default: return <PaymentIcon sx={{ fontSize: 20 }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pass': return 'success';
      case 'Retest': return 'warning';
      case 'Fail': return 'error';
      default: return 'default';
    }
  };

  const clearFilters = () => {
    setFilters({});
    setSearchTerm('');
  };

  const formatDateSafely = (dateString: string, formatString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime()) || !dateString) {
        return 'Invalid Date';
      }
      return format(date, formatString);
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const formatDateInCST = (dateString: string, formatString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime()) || !dateString) {
        return 'Invalid Date';
      }
      
      // For time-only formats, use toLocaleString with Chicago timezone
      if (formatString.includes('h:mm:ss a') || formatString.includes('H:mm:ss')) {
        return date.toLocaleString('en-US', {
          timeZone: 'America/Chicago',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
      }
      
      // For full date-time formats, use toLocaleString with Chicago timezone
      return date.toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  return (
    <Box>
      {/* Header with search and filter button */}
      <Box sx={{ p: 3, pb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            State Inspection Records ({pagination.totalRecords})
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton
              onClick={() => setFilterDrawerOpen(true)}
              color={Object.keys(filters).length > 0 ? 'primary' : 'default'}
              title="Filters"
            >
              <FilterIcon />
            </IconButton>
            <IconButton
              onClick={onDataChange}
              title="Refresh"
            >
              <RefreshIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Search bar */}
        <TextField
          fullWidth
          label="Search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          placeholder="Search by sticker number, last name, or creator..."
          sx={{ mb: 2 }}
        />

        {/* Active filters display */}
        {Object.keys(filters).length > 0 && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {filters.dateFrom && (
              <Chip
                label={`From: ${filters.dateFrom}`}
                onDelete={() => handleFilterChange('dateFrom', '')}
                size="small"
              />
            )}
            {filters.dateTo && (
              <Chip
                label={`To: ${filters.dateTo}`}
                onDelete={() => handleFilterChange('dateTo', '')}
                size="small"
              />
            )}
            {filters.paymentType && filters.paymentType !== 'All' && (
              <Chip
                label={`Payment: ${filters.paymentType}`}
                onDelete={() => handleFilterChange('paymentType', '')}
                size="small"
              />
            )}
            {filters.status && filters.status !== 'All' && (
              <Chip
                label={`Status: ${filters.status}`}
                onDelete={() => handleFilterChange('status', '')}
                size="small"
              />
            )}
            {filters.fleetAccount && (
              <Chip
                label={`Fleet: ${fleetAccounts.find(acc => acc.id === filters.fleetAccount)?.name || 'Unknown'}`}
                onDelete={() => handleFilterChange('fleetAccount', '')}
                size="small"
              />
            )}
            <Chip
              label="Clear All"
              onClick={clearFilters}
              size="small"
              variant="outlined"
              color="secondary"
            />
          </Box>
        )}
      </Box>

      {/* Records vertical list */}
      <Box sx={{ px: 3 }}>
        {records.length === 0 ? (
          <Alert severity="info">
            No records found. Try adjusting your filters or add your first record using the "Add Inspection" button.
          </Alert>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {records.map((record: StateInspectionRecord) => (
              <Card 
                key={record.id}
                sx={{ 
                  cursor: 'pointer',
                  '&:hover': {
                    boxShadow: 4,
                    transform: 'translateY(-1px)',
                    transition: 'all 0.2s'
                  }
                }}
                onClick={() => handleViewRecord(record)}
              >
                <CardContent sx={{ py: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {/* Left Section - Sticker Number */}
                    <Box sx={{ minWidth: 120 }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
                        {record.stickerNumber}
                      </Typography>
                    </Box>

                    {/* Middle Section - Last Name */}
                    <Box sx={{ flex: 1, mx: 2 }}>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {record.lastName}
                      </Typography>
                    </Box>

                    {/* Status and Payment Section */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 180 }}>
                      {/* Status Chip */}
                      <Chip
                        label={record.status || 'Pass'}
                        color={getStatusColor(record.status || 'Pass') as any}
                        size="small"
                        sx={{ 
                          fontWeight: 600,
                          minWidth: 60
                        }}
                      />
                      
                      {/* Payment Section - Icon and Amount */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {record.paymentType === 'Cash' && (
                          <CashIcon sx={{ fontSize: 20, color: 'success.main' }} />
                        )}
                        {record.paymentType === 'Check' && (
                          <CheckIcon sx={{ fontSize: 20, color: 'info.main' }} />
                        )}
                        {record.paymentType === 'Fleet' && (
                          <FleetIcon sx={{ fontSize: 20, color: 'warning.main' }} />
                        )}
                        <Typography variant="body1" sx={{ fontWeight: 600, minWidth: 40 }}>
                          ${record.paymentAmount}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Right Section - Created Date and Menu */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 120 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                        {formatDateSafely(record.createdDate, 'MMM dd')}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMenuOpen(e, record);
                        }}
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
        
        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <Stack spacing={2} alignItems="center">
              <Pagination
                count={pagination.totalPages}
                page={pagination.currentPage}
                onChange={(_, page) => onPageChange(page, pagination.pageSize)}
                color="primary"
                size="large"
                showFirstButton
                showLastButton
              />
              <Typography variant="body2" color="text.secondary">
                Showing {(pagination.currentPage - 1) * pagination.pageSize + 1} - {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalRecords)} of {pagination.totalRecords} records
              </Typography>
            </Stack>
          </Box>
        )}
      </Box>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        TransitionComponent={Fade}
      >
        <MenuItem onClick={() => menuRecord && handleViewRecord(menuRecord)}>
          <ViewIcon sx={{ mr: 1 }} />
          View Details
        </MenuItem>
        <MenuItem onClick={() => menuRecord && handleDeleteRecord(menuRecord)}>
          <DeleteIcon sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* View Record Dialog */}
      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            State Inspection Record Details
            <IconButton onClick={() => setViewDialogOpen(false)}>
              <MoreVertIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedRecord && (
            <Box sx={{ pt: 2 }}>
              {/* Header Section */}
              <Box sx={{ mb: 4, textAlign: 'center', p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                  {selectedRecord.stickerNumber}
                </Typography>
                <Typography variant="h5" color="text.secondary">
                  {selectedRecord.lastName}
                </Typography>
              </Box>

              <Grid container spacing={3}>
                {/* Created By */}
                <Grid xs={12} md={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <PersonIcon sx={{ fontSize: 24, color: 'primary.main' }} />
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        Created By
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {selectedRecord.createdBy}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                {/* Created Date */}
                <Grid xs={12} md={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <CalendarIcon sx={{ fontSize: 24, color: 'primary.main' }} />
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        Created Date
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {formatDateSafely(selectedRecord.createdDate, 'MMMM dd, yyyy')}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                {/* Payment Type */}
                <Grid xs={12} md={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    {getPaymentIcon(selectedRecord.paymentType)}
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        Payment Type
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {selectedRecord.paymentType}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                {/* Payment Amount */}
                <Grid xs={12} md={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <PaymentIcon sx={{ fontSize: 24, color: 'success.main' }} />
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        Payment Amount
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>
                        ${selectedRecord.paymentAmount}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                {/* Status */}
                <Grid xs={12} md={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Box sx={{ 
                      width: 24, 
                      height: 24, 
                      borderRadius: '50%', 
                      bgcolor: getStatusColor(selectedRecord.status || 'Pass') + '.main',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Typography variant="caption" sx={{ color: 'white', fontWeight: 'bold', fontSize: '0.7rem' }}>
                        {(selectedRecord.status || 'Pass').charAt(0)}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        Inspection Status
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {selectedRecord.status || 'Pass'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                {/* Fleet Account */}
                {selectedRecord.fleetAccount && (
                  <Grid xs={12}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, bgcolor: 'warning.50', borderRadius: 1 }}>
                      <FleetIcon sx={{ fontSize: 24, color: 'warning.main' }} />
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary">
                          Fleet Account
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {getFleetAccountName(selectedRecord.fleetAccount)}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                )}

                {/* Tint Affidavit */}
                {selectedRecord.tintAffidavit && (
                  <Grid xs={12}>
                    <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <AttachFileIcon sx={{ fontSize: 24, color: 'info.main' }} />
                        <Typography variant="subtitle2" color="text.secondary">
                          Tint Affidavit
                        </Typography>
                      </Box>
                      <Box
                        component="img"
                        src={getUploadUrl(selectedRecord.tintAffidavit.url)}
                        alt="Tint Affidavit"
                        sx={{
                          maxWidth: '100%',
                          maxHeight: 300,
                          objectFit: 'contain',
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                          display: 'block',
                          mx: 'auto'
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </Box>
                  </Grid>
                )}

                {/* Notes */}
                {selectedRecord.notes && (
                  <Grid xs={12}>
                    <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                        Notes
                      </Typography>
                      <Typography variant="body1">
                        {selectedRecord.notes}
                      </Typography>
                    </Box>
                  </Grid>
                )}

                {/* Timestamps */}
                <Grid xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, color: 'text.secondary' }}>
                    <Typography variant="caption">
                      <strong>Inspection Date:</strong> {formatDateSafely(selectedRecord.createdDate, 'MMMM dd, yyyy')}
                    </Typography>
                    {selectedRecord.createdAt && (
                      <Typography variant="caption">
                        <strong>Time Saved:</strong> {formatDateInCST(selectedRecord.createdAt, 'h:mm:ss a')} CST
                      </Typography>
                    )}
                    {selectedRecord.updatedAt && selectedRecord.updatedAt !== selectedRecord.createdAt && (
                      <Typography variant="caption">
                        <strong>Last Updated:</strong> {formatDateInCST(selectedRecord.updatedAt, 'MMM dd, yyyy h:mm:ss a')} CST
                      </Typography>
                    )}
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          {selectedRecord && (
            <Typography>
              Are you sure you want to delete the record for sticker number "{selectedRecord.stickerNumber}"? 
              This action cannot be undone.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            Delete
          </Button>
                  </DialogActions>
        </Dialog>

        {/* Filter Drawer */}
        <Drawer
          anchor="right"
          open={filterDrawerOpen}
          onClose={() => setFilterDrawerOpen(false)}
          sx={{
            '& .MuiDrawer-paper': {
              width: 350,
              maxWidth: '90vw',
            },
          }}
        >
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6">
                Filters
              </Typography>
              <IconButton onClick={() => setFilterDrawerOpen(false)}>
                <CloseIcon />
              </IconButton>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Date Range */}
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Date Range
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <TextField
                    fullWidth
                    label="From Date"
                    type="date"
                    value={filters.dateFrom || ''}
                    onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                  />
                  <TextField
                    fullWidth
                    label="To Date"
                    type="date"
                    value={filters.dateTo || ''}
                    onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                  />
                </Box>
              </Box>

              {/* Creator Filter */}
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Created By
                </Typography>
                <TextField
                  fullWidth
                  label="Creator Name"
                  value={filters.createdBy || ''}
                  onChange={(e) => handleFilterChange('createdBy', e.target.value)}
                  placeholder="Filter by creator..."
                  size="small"
                />
              </Box>

              {/* Payment Type */}
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Payment Type
                </Typography>
                <FormControl fullWidth size="small">
                  <InputLabel>Payment Type</InputLabel>
                  <Select
                    value={filters.paymentType || 'All'}
                    onChange={(e) => handleFilterChange('paymentType', e.target.value)}
                    label="Payment Type"
                  >
                    <MenuItem value="All">All Types</MenuItem>
                    <MenuItem value="Cash">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CashIcon sx={{ fontSize: 16, color: 'success.main' }} />
                        Cash
                      </Box>
                    </MenuItem>
                    <MenuItem value="Check">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckIcon sx={{ fontSize: 16, color: 'info.main' }} />
                        Check
                      </Box>
                    </MenuItem>
                    <MenuItem value="Fleet">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FleetIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                        Fleet
                      </Box>
                    </MenuItem>
                  </Select>
                </FormControl>
              </Box>

              {/* Status */}
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Inspection Status
                </Typography>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={filters.status || 'All'}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    label="Status"
                  >
                    <MenuItem value="All">All Statuses</MenuItem>
                    <MenuItem value="Pass">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ 
                          width: 12, 
                          height: 12, 
                          borderRadius: '50%', 
                          bgcolor: 'success.main' 
                        }} />
                        Pass
                      </Box>
                    </MenuItem>
                    <MenuItem value="Retest">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ 
                          width: 12, 
                          height: 12, 
                          borderRadius: '50%', 
                          bgcolor: 'warning.main' 
                        }} />
                        Retest
                      </Box>
                    </MenuItem>
                    <MenuItem value="Fail">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ 
                          width: 12, 
                          height: 12, 
                          borderRadius: '50%', 
                          bgcolor: 'error.main' 
                        }} />
                        Fail
                      </Box>
                    </MenuItem>
                  </Select>
                </FormControl>
              </Box>

              {/* Fleet Account */}
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Fleet Account
                </Typography>
                <Autocomplete
                  options={fleetAccounts}
                  getOptionLabel={(option) => option.name}
                  value={fleetAccounts.find(acc => acc.id === filters.fleetAccount) || null}
                  onChange={(_, value) => handleFilterChange('fleetAccount', value?.id || '')}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Fleet Account"
                      fullWidth
                      size="small"
                    />
                  )}
                  renderOption={(props, option) => (
                    <Box component="li" {...props}>
                      <Box>
                        <Typography variant="body2">{option.name}</Typography>
                        {option.contactName && (
                          <Typography variant="caption" color="text.secondary">
                            {option.contactName}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  )}
                />
              </Box>

              {/* Actions */}
              <Box sx={{ pt: 2, borderTop: 1, borderColor: 'divider' }}>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={clearFilters}
                  startIcon={<FilterIcon />}
                >
                  Clear All Filters
                </Button>
              </Box>
            </Box>
          </Box>
        </Drawer>
      </Box>
    );
  };

  export default RecordDeckView; 