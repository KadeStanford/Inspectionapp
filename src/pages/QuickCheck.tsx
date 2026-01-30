import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Typography,
  TextField,
  Button,
  Box,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Paper,
  Tabs,
  Tab,
  Alert,
  Chip,
  Stack,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  Checkbox,
  ListItemIcon,
  Tooltip,
  Fab,
  InputAdornment,
  Select,
  InputLabel,
  Divider,
  Modal,
  Popover,
  Snackbar,
  LinearProgress
} from '@mui/material';
import Grid from '../components/CustomGrid';
import {
  QrCodeScanner as QrCodeScannerIcon,
  PhotoCamera as PhotoCameraIcon,
  FlashOn as FlashOnIcon,
  FlashOff as FlashOffIcon,
  CameraAlt as CameraAltIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  PhotoLibrary as PhotoLibraryIcon,
  Info as InfoIcon,
  History as HistoryIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  CloudUpload as CloudUploadIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  LocalGasStation as OilIcon,
  FlipCameraIos as FlipCameraIosIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Logout as LogoutIcon,
  Save as SaveIcon,
  Visibility as VisibilityIcon,
  Timer as TimerIcon,
  UploadFile as UploadFileIcon,
  ArrowBackIos as ArrowBackIosIcon,
  ArrowForwardIos as ArrowForwardIosIcon,
  ArrowBackIosNew as ArrowBackIosNewIcon
} from '@mui/icons-material';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import api, {
  submitQuickCheck,
  getQuickCheckHistory,
  logout,
  deleteQuickCheck,
  decodeVinCached,
  deleteQuickCheckPhoto,
  trackTabEntry,
  trackTabExit,
  getTimingSummary,
  formatVehicleDetails
} from '../services/api';
import { useDraftForm } from '../hooks/useDraftForm';
import TireRepairLayout from '../components/TireRepairLayout';
import TPMSLayout from '../components/TPMSLayout';
import { useNotification } from '../hooks/useNotification';
import NotificationSnackbar from '../components/NotificationSnackbar';
import { useWebSocket } from '../contexts/WebSocketProvider';
import websocketService from '../services/websocketService';
import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCoverflow, Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-coverflow';
import 'swiper/css/navigation';
import TireTreadSection from '../components/TireTreadSection';
import type { TireTreadData } from '../components/TireTreadSection';
import TireTreadSideView from '../components/TireTreadSideView';
import { StaticSticker, CreateStickerFormData, OilType } from '../types/stickers';
import { StickerStorageService } from '../services/stickerStorage';
import { VinDecoderService } from '../services/vinDecoder';
import { PDFGeneratorService } from '../services/pdfGenerator';
import VirtualTabTimer, { VirtualTabTimerAPI, TabTimingData } from '../components/VirtualTabTimer';
import VinScanner from '../components/VinScanner';
import BrakePadSideView from '../components/BrakePadSideView';
import { InfoTab } from '../components/QuickCheck/tabs/InfoTab';
import { PullingIntoBayTab } from '../components/QuickCheck/tabs/PullingIntoBayTab';
import { UnderhoodTab } from '../components/QuickCheck/tabs/UnderhoodTab';
import { TiresBrakesTab } from '../components/QuickCheck/tabs/TiresBrakesTab';
import ImageHandling, { ImageUpload } from '../components/QuickCheck/tabs/ImageHandling';
import heic2any from 'heic2any';
import { uploadImageToServer, ImageUploadResult, getDisplayUrl, cleanupUploadResult } from '../services/imageUpload';
import { 
  QuickCheckForm, 
  ImageUpload as QuickCheckImageUpload, 
  WindshieldCondition, 
  WiperBladeCondition, 
  WasherSquirterCondition, 
  StateInspectionStatus, 
  WasherFluidCondition, 
  EngineAirFilterCondition, 
  BatteryCondition, 
  TireCondition, 
  BrakeCondition, 
  StaticStickerStatus, 
  DrainPlugType, 
  TireRepairStatus, 
  TPMSType, 
  TireRotationStatus, 
  TreadCondition, 
  TireRepairImages, 
  TirePhoto, 
  TireRepairZone, 
  TPMSZone, 
  DraftData, 
  TireTread,
  BrakePadCondition,
  InspectionType 
} from '../types/quickCheck';

const essentialFields = [
  { name: 'vin', label: 'VIN', type: 'text', required: true },
  { name: 'date', label: 'Date', type: 'date', required: false },
  { name: 'dash_lights', label: 'Dash Lights', type: 'text', required: false },
  { name: 'windshield', label: 'Windshield Condition', type: 'text', required: false },
  { name: 'mileage', label: 'Mileage', type: 'number', required: false },
  { name: 'front_tires', label: 'Front Tires', type: 'text', required: false },
  { name: 'rear_tires', label: 'Rear Tires', type: 'text', required: false },
  { name: 'brake_pads', label: 'Brake Pads', type: 'text', required: false },
];

// HEIC file detection helper
const isHEICFile = (file: File): boolean => {
  return file.type === 'image/heic' || 
         file.type === 'image/heif' || 
         file.name.toLowerCase().endsWith('.heic') || 
         file.name.toLowerCase().endsWith('.heif');
};

// HEIC to JPEG conversion helper
const convertHEICToJPEG = async (file: File): Promise<File> => {
  try {
    const convertedBlob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.8,
    });

    // heic2any returns a blob or array of blobs
    const resultBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
    
    const originalName = file.name.replace(/\.(heic|heif)$/i, '');
    const convertedFile = new File([resultBlob], `${originalName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });

    return convertedFile;
  } catch (error) {
    console.error('Error converting HEIC to JPEG:', error);
    throw new Error('Failed to convert HEIC image. Please try selecting the image again.');
  }
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`quick-check-tabpanel-${index}`}
      aria-labelledby={`quick-check-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const theme = createTheme({
  palette: {
    primary: {
      main: '#1042D8',
    },
  },
});

const QuickCheck: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { scannedVIN } = (location.state as any) || { scannedVIN: '' };
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [vinSource, setVinSource] = useState<'manual' | 'url' | 'scanned'>('manual');

  const userName = localStorage.getItem('userName') || '';
  const userId = localStorage.getItem('userId') || '';
  
  const initialFormState: QuickCheckForm = useMemo(() => ({
    inspection_type: 'quick_check',
    vin: scannedVIN || '',
    vehicle_details: '',
    date: new Date().toISOString().split('T')[0],
    user: userName,
    mileage: '',
    windshield_condition: '' as WindshieldCondition,
    wiper_blades: '' as WiperBladeCondition,
    wiper_blades_front: '' as any,
    wiper_blades_rear: '' as any,
    washer_squirters: '' as WasherSquirterCondition,
    dash_lights_photos: [],
    // Field-specific images for form fields
    mileage_photos: [],
    windshield_condition_photos: [],
    wiper_blades_photos: [],
    washer_squirters_photos: [],
    vin_photos: [],
    state_inspection_status_photos: [],
    state_inspection_date_code_photos: [],
    battery_date_code_photos: [],
    tire_repair_status_photos: [],
    tpms_type_photos: [],
    front_brake_pads_photos: [],
    rear_brake_pads_photos: [],
    // Underhood fields
    tpms_placard: [],
    state_inspection_status: '' as StateInspectionStatus,
    state_inspection_month: null,
    state_inspection_date_code: '',
    washer_fluid: '' as WasherFluidCondition,
    washer_fluid_photo: [],
    engine_air_filter: '' as EngineAirFilterCondition,
    engine_air_filter_photo: [],
    battery_condition: [],
    battery_condition_main: '' as any,
    battery_terminals: [],
    battery_terminal_damage_location: [],
    battery_photos: [],
    battery_date_code: '',
    tpms_tool_photo: [],
    
    // Tires & Brakes fields
    passenger_front_tire: '' as TireCondition,
    driver_front_tire: '' as TireCondition,
    driver_rear_tire: '' as TireCondition,
    passenger_rear_tire: '' as TireCondition,
    spare_tire: '' as TireCondition,
    front_brakes: [],
    rear_brakes: [],
    front_brake_pads: {
      driver: {
        inner: '',
        outer: '',
        rotor_condition: ''
      },
      passenger: {
        inner: '',
        outer: '',
        rotor_condition: ''
      }
    },
    rear_brake_pads: {
      driver: {
        inner: '',
        outer: '',
        rotor_condition: ''
      },
      passenger: {
        inner: '',
        outer: '',
        rotor_condition: ''
      }
    },
    tire_photos: [],
    undercarriage_photos: [],
    tire_repair_status: '',
    tire_repair_zones: [
      { position: 'driver_front', status: null },
      { position: 'passenger_front', status: null },
      { position: 'driver_rear_outer', status: null },
      { position: 'driver_rear_inner', status: null },
      { position: 'passenger_rear_inner', status: null },
      { position: 'passenger_rear_outer', status: null }
    ],
    tpms_type: '',
    tpms_zones: [
      { position: 'driver_front', status: null },
      { position: 'passenger_front', status: null },
      { position: 'driver_rear_outer', status: null },
      { position: 'driver_rear_inner', status: null },
      { position: 'passenger_rear_inner', status: null },
      { position: 'passenger_rear_outer', status: null }
    ],
    tire_rotation: '',
    static_sticker: '',
    drain_plug_type: '',
    notes: '',
    tire_repair_statuses: {
      driver_front: null,
      passenger_front: null,
      driver_rear_outer: null,
      driver_rear_inner: null,
      passenger_rear_inner: null,
      passenger_rear_outer: null,
      spare: null,
    },
    tire_repair_images: {
      driver_front: { not_repairable: [], tire_size_brand: [], repairable_spot: [] },
      passenger_front: { not_repairable: [], tire_size_brand: [], repairable_spot: [] },
      driver_rear_outer: { not_repairable: [], tire_size_brand: [], repairable_spot: [] },
      driver_rear_inner: { not_repairable: [], tire_size_brand: [], repairable_spot: [] },
      passenger_rear_inner: { not_repairable: [], tire_size_brand: [], repairable_spot: [] },
      passenger_rear_outer: { not_repairable: [], tire_size_brand: [], repairable_spot: [] },
      spare: { not_repairable: [], tire_size_brand: [], repairable_spot: [] },
    },
    tpms_statuses: {
      driver_front: null,
      passenger_front: null,
      driver_rear_outer: null,
      driver_rear_inner: null,
      passenger_rear_inner: null,
      passenger_rear_outer: null,
      spare: null,
    },
    tire_comments: {},
    tire_dates: {
      passenger_front: '',
      driver_front: '',
      driver_rear: '',
      passenger_rear: '',
      spare: '',
    },
    tire_tread: {
      driver_front: {
        inner_edge_depth: '',
        inner_depth: '',
        center_depth: '',
        outer_depth: '',
        outer_edge_depth: '',
        inner_edge_condition: 'green' as TreadCondition,
        inner_condition: 'green' as TreadCondition,
        center_condition: 'green' as TreadCondition,
        outer_condition: 'green' as TreadCondition,
        outer_edge_condition: 'green' as TreadCondition,
      },
      passenger_front: {
        inner_edge_depth: '',
        inner_depth: '',
        center_depth: '',
        outer_depth: '',
        outer_edge_depth: '',
        inner_edge_condition: 'green' as TreadCondition,
        inner_condition: 'green' as TreadCondition,
        center_condition: 'green' as TreadCondition,
        outer_condition: 'green' as TreadCondition,
        outer_edge_condition: 'green' as TreadCondition,
      },
      driver_rear: {
        inner_edge_depth: '',
        inner_depth: '',
        center_depth: '',
        outer_depth: '',
        outer_edge_depth: '',
        inner_edge_condition: 'green' as TreadCondition,
        inner_condition: 'green' as TreadCondition,
        center_condition: 'green' as TreadCondition,
        outer_condition: 'green' as TreadCondition,
        outer_edge_condition: 'green' as TreadCondition,
      },
      driver_rear_inner: {
        inner_edge_depth: '',
        inner_depth: '',
        center_depth: '',
        outer_depth: '',
        outer_edge_depth: '',
        inner_edge_condition: 'green' as TreadCondition,
        inner_condition: 'green' as TreadCondition,
        center_condition: 'green' as TreadCondition,
        outer_condition: 'green' as TreadCondition,
        outer_edge_condition: 'green' as TreadCondition,
      },
      passenger_rear_inner: {
        inner_edge_depth: '',
        inner_depth: '',
        center_depth: '',
        outer_depth: '',
        outer_edge_depth: '',
        inner_edge_condition: 'green' as TreadCondition,
        inner_condition: 'green' as TreadCondition,
        center_condition: 'green' as TreadCondition,
        outer_condition: 'green' as TreadCondition,
        outer_edge_condition: 'green' as TreadCondition,
      },
      passenger_rear: {
        inner_edge_depth: '',
        inner_depth: '',
        center_depth: '',
        outer_depth: '',
        outer_edge_depth: '',
        inner_edge_condition: 'green' as TreadCondition,
        inner_condition: 'green' as TreadCondition,
        center_condition: 'green' as TreadCondition,
        outer_condition: 'green' as TreadCondition,
        outer_edge_condition: 'green' as TreadCondition,
      },
      spare: {
        inner_edge_depth: '',
        inner_depth: '',
        center_depth: '',
        outer_depth: '',
        outer_edge_depth: '',
        inner_edge_condition: 'green' as TreadCondition,
        inner_condition: 'green' as TreadCondition,
        center_condition: 'green' as TreadCondition,
        outer_condition: 'green' as TreadCondition,
        outer_edge_condition: 'green' as TreadCondition,
      },
    },
    // Field-specific notes
    field_notes: {},
    tab_timings: {
      info_duration: 0,
      pulling_duration: 0,
      underhood_duration: 0,
      tires_duration: 0,
    },
    created_datetime: new Date().toISOString(),
    submitted_datetime: '',
    archived_datetime: '',
  }), [scannedVIN, userName]);

  const [form, setForm] = useState<QuickCheckForm>(initialFormState);

  // Initialize draft form hook
  const draft = useDraftForm({
    userId,
    userName,
    initialForm: initialFormState,
    onFormLoad: (loadedForm) => {
      setForm(loadedForm);
      console.log('✅ Form loaded from draft:', draft.draftId);
    },
    autoSaveDelay: 1000
  });

  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { notification, showSuccess, showError, hideNotification } = useNotification();
  const [infoAnchorEl, setInfoAnchorEl] = useState<HTMLElement | null>(null);
  const [infoContent, setInfoContent] = useState<string>('');

  // Add state for detail view
  const [selectedInspection, setSelectedInspection] = useState<any | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  // Add state for vehicle details popup
  const [vehicleDetailsOpen, setVehicleDetailsOpen] = useState(false);

  // Add state for the tab
  const [vehicleDetailsTab, setVehicleDetailsTab] = useState(0);

  // Add state for cancel dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  // Add state for history functionality
  const [showHistory, setShowHistory] = useState(false);
  const [inspectionHistory, setInspectionHistory] = useState<any[]>([]);

  // Add timing state - using useRef for interval to avoid React Strict Mode issues
  const [timingLoading, setTimingLoading] = useState(false);
  const [currentTabStartTime, setCurrentTabStartTime] = useState<Date | null>(null);
  const [showTimingDialog, setShowTimingDialog] = useState(false);
  const [timingData, setTimingData] = useState<any>(null);

  // Tab names for the virtual timer
  const tabNames = ['info', 'pulling', 'underhood', 'tires'] as const;
  
  // Timer API reference
  const timerAPI = useRef<VirtualTabTimerAPI | null>(null);
  
  // Use useRef for interval to prevent React Strict Mode issues
  const timingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeTabRef = useRef<string | null>(null);
  const isPageVisibleRef = useRef<boolean>(true); // Track page visibility
  
  // State for UI updates
  const [isPageVisible, setIsPageVisible] = useState<boolean>(true);

  // Add state for debug panel setting
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false);

  // Additional state variables needed for the component
  const [vinDecodeLoading, setVinDecodeLoading] = useState(false);
  const [vinDecodeError, setVinDecodeError] = useState<string | null>(null);
  const [vehicleDetails, setVehicleDetails] = useState<any>(null);
  const [lastDecodedVin, setLastDecodedVin] = useState<string>('');
  
  // WebSocket for VIN decoded notifications
  const { subscribe } = useWebSocket();

  // Info popover state
  const open = Boolean(infoAnchorEl);

  // Auto-save form changes using the draft hook
  useEffect(() => {
    if (draft.isInitialized && draft.draftId) {
      draft.scheduleAutoSave(form);
    }
  }, [form, draft.isInitialized, draft.draftId, draft.scheduleAutoSave]);

  // VIN decoding function
  const decodeVinIfValid = async (vin: string) => {
    // Check if VIN has actually changed
    if (vin === lastDecodedVin) {
      console.log('🔄 VIN unchanged, skipping decode:', vin);
      return;
    }

    if (!vin || vin.length !== 17) {
      setVehicleDetails(null);
      setVinDecodeError(null);
      setForm(prev => ({ ...prev, vehicle_details: '' }));
      setLastDecodedVin('');
      return;
    }

    console.log('🔍 Decoding VIN:', vin);
    setVinDecodeLoading(true);
    setVinDecodeError(null);
    
    try {
      const vehicleData = await decodeVinCached(vin);
      console.log('VIN decode successful:', vehicleData);
      setVehicleDetails(vehicleData);
      setLastDecodedVin(vin); // Track the successfully decoded VIN
      
      const formattedDetails = formatVehicleDetails(vehicleData);
      setForm(prev => ({ ...prev, vehicle_details: formattedDetails }));
      
      // Emit WebSocket event for VIN decoded notification
      if (draft.draftId) {
        console.log('🔍 Emitting VIN decoded WebSocket event for draft:', draft.draftId);
        websocketService.emit('vin_decoded', {
          type: 'quick_check_update',
          action: 'vin_decoded',
          data: {
            id: draft.draftId,
            vin: vin,
            data: {
              vin: vin,
              vehicle_details: formattedDetails
            },
            user: userName,
            status: 'pending'
          },
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (err: any) {
      console.error('VIN decode error:', err);
      
      let errorMessage = 'Failed to decode VIN';
      
      if (err.response?.data?.userMessage) {
        errorMessage = err.response.data.userMessage;
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      if (err.response?.status === 503) {
        console.warn('VIN decoding service temporarily unavailable');
        setVinDecodeError(`⚠️ ${errorMessage}`);
      } else {
        setVinDecodeError(errorMessage);
      }
      
      setVehicleDetails(null);
      setForm(prev => ({ ...prev, vehicle_details: '' }));
      setLastDecodedVin(''); // Reset on error
    } finally {
      setVinDecodeLoading(false);
    }
  };

  // Helper functions
  const getTabName = (tabIndex: number): string => {
    const tabNames = ['Info', 'Pulling Into Bay', 'Underhood', 'Tires & Brakes'];
    const tabName = tabNames[tabIndex] || 'Info';
    console.log(`getTabName(${tabIndex}) = "${tabName}"`);
    return tabName;
  };

  // Handle tab timing updates from the VirtualTabTimer component
  const handleTabTimingUpdate = useCallback((timings: TabTimingData) => {
    setForm(prev => ({
      ...prev,
      tab_timings: {
        info_duration: timings.info_duration || 0,
        pulling_duration: timings.pulling_duration || 0,
        underhood_duration: timings.underhood_duration || 0,
        tires_duration: timings.tires_duration || 0
      }
    }));
  }, []);

  // Handle tab change from the VirtualTabTimer component
  const handleTabChangeFromTimer = useCallback((newTabIndex: number) => {
    setTabValue(newTabIndex);
  }, []);

  // Page visibility handlers
  const handlePageVisibilityChange = useCallback(() => {
    const isVisible = !document.hidden;
    setIsPageVisible(isVisible);
    
    console.log(`📱 Page visibility changed: ${!isVisible ? 'hidden' : 'visible'}`);
  }, []);

  // Tab change handler
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    timerAPI.current?.changeTab(newValue);
  };

  // Form handling functions
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'mileage') {
      const numericValue = value.replace(/\D/g, '');
      const formattedValue = numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      setForm(f => ({ ...f, [name]: formattedValue }));
      console.log(`Mileage updated: ${formattedValue}`);
    } else {
      setForm(f => ({ ...f, [name]: value }));
      console.log(`Form field updated: ${name} = ${value}`);
      
      if (name === 'vin') {
        if (vinSource !== 'scanned' && vinSource !== 'url') {
          setVinSource('manual');
        }
        // Reset last decoded VIN when VIN field changes to force re-decode
        if (value !== lastDecodedVin) {
          console.log('🔄 VIN field changed, resetting last decoded VIN');
          setLastDecodedVin('');
        }
      }
    }
  };

  const handleRadioChange = (name: string, value: string) => {
    setForm(prev => ({ ...prev, [name]: value }));
    console.log(`Form field updated: ${name} = ${value}`);
  };

  const handleFormUpdate = (updates: Partial<QuickCheckForm>) => {
    setForm(prev => ({ ...prev, ...updates }));
  };

  const handleBatteryConditionToggle = (condition: BatteryCondition) => {
    setForm(prev => {
      const currentConditions = prev.battery_condition;
      
      if (condition === 'terminal_cleaning') {
        return {
          ...prev,
          battery_condition: currentConditions.includes(condition)
            ? currentConditions.filter(c => c !== condition)
            : [...currentConditions, condition]
        };
      }
      
      const mainConditions = ['good', 'warning', 'bad', 'na', 'less_than_5yr'] as const;
      const hasTerminalCleaning = currentConditions.includes('terminal_cleaning');
      
      if (currentConditions.includes(condition)) {
        return {
          ...prev,
          battery_condition: currentConditions.filter(c => c !== condition)
        };
      }
      
      const newConditions = currentConditions.filter(c => !mainConditions.includes(c as any));
      newConditions.push(condition);
      
      return {
        ...prev,
        battery_condition: newConditions
      };
    });
    console.log(`Battery condition toggled: ${condition}`);
  };

  const handleBatteryConditionChange = (type: 'main' | 'terminals', value: string) => {
    if (type === 'main') {
      setForm(prev => ({
        ...prev,
        battery_condition_main: value as any
      }));
    }
    console.log(`Battery ${type} condition changed to: ${value}`);
  };

  const handleBatteryTerminalsToggle = (condition: any) => {
    setForm(prev => {
      const currentTerminals = prev.battery_terminals || [];
      const isSelected = currentTerminals.includes(condition);
      
      return {
        ...prev,
        battery_terminals: isSelected
          ? currentTerminals.filter(c => c !== condition)
          : [...currentTerminals, condition]
      };
    });
    console.log(`Battery terminals toggled: ${condition}`);
  };

  const handleInfoClick = (event: React.MouseEvent<HTMLElement>, content: string) => {
    setInfoAnchorEl(event.currentTarget);
    setInfoContent(content);
  };

  const handleInfoClose = () => {
    setInfoAnchorEl(null);
  };

  // Scanner functions
  const handleScannerOpen = async () => {
    setError(null);
    setScannerOpen(true);
  };

  const handleScanResult = (scannedVin: string) => {
    setForm(f => ({ ...f, vin: scannedVin }));
    setVinSource('scanned');
    setScannerOpen(false);
    if (scannedVin.length >= 17) {
      // Force decode for scanned VIN by resetting lastDecodedVin
      setLastDecodedVin('');
      decodeVinIfValid(scannedVin);
    }
  };

  // Image handling functions
  const handleImageUpload = async (file: File, type: string) => {
    try {
      const processedFile = isHEICFile(file) ? await convertHEICToJPEG(file) : file;
      
      // Upload to 'quick_check_images' folder
      const uploadResult = await uploadImageToServer(processedFile, 'quick_check_images');
      
      if (!uploadResult.success) {
        setError(uploadResult.error || 'Failed to upload image');
        return;
      }
      
      const imageUpload: ImageUpload = {
        file: processedFile,
        progress: 100,
        url: uploadResult.serverUrl // Store relative path directly
      };
      
      // Add image to appropriate field
      if (type === 'dashLights') {
        setForm(f => ({ ...f, dash_lights_photos: [...f.dash_lights_photos, imageUpload] }));
      } else if (type === 'mileage') {
        setForm(f => ({ ...f, mileage_photos: [...f.mileage_photos, imageUpload] }));
      } else if (type === 'windshield_condition') {
        setForm(f => ({ ...f, windshield_condition_photos: [...f.windshield_condition_photos, imageUpload] }));
      } else if (type === 'wiper_blades') {
        setForm(f => ({ ...f, wiper_blades_photos: [...f.wiper_blades_photos, imageUpload] }));
      } else if (type === 'washer_squirters') {
        setForm(f => ({ ...f, washer_squirters_photos: [...f.washer_squirters_photos, imageUpload] }));
      } else if (type === 'vin') {
        setForm(f => ({ ...f, vin_photos: [...f.vin_photos, imageUpload] }));
      } else if (type === 'state_inspection_status') {
        setForm(f => ({ ...f, state_inspection_status_photos: [...f.state_inspection_status_photos, imageUpload] }));
      } else if (type === 'state_inspection_date_code') {
        setForm(f => ({ ...f, state_inspection_date_code_photos: [...f.state_inspection_date_code_photos, imageUpload] }));
      } else if (type === 'battery_date_code') {
        setForm(f => ({ ...f, battery_date_code_photos: [...f.battery_date_code_photos, imageUpload] }));
      } else if (type === 'tire_repair_status') {
        setForm(f => ({ ...f, tire_repair_status_photos: [...f.tire_repair_status_photos, imageUpload] }));
      } else if (type === 'tpms_type') {
        setForm(f => ({ ...f, tpms_type_photos: [...f.tpms_type_photos, imageUpload] }));
      } else if (type === 'front_brake_pads') {
        setForm(f => ({ ...f, front_brake_pads_photos: [...f.front_brake_pads_photos, imageUpload] }));
      } else if (type === 'rear_brake_pads') {
        setForm(f => ({ ...f, rear_brake_pads_photos: [...f.rear_brake_pads_photos, imageUpload] }));
      } else if (type === 'tpms_placard') {
        setForm(f => ({ ...f, tpms_placard: [...f.tpms_placard, imageUpload] }));
      } else if (type === 'engine_air_filter') {
        setForm(f => ({ ...f, engine_air_filter_photo: [...f.engine_air_filter_photo, imageUpload] }));
      } else if (type === 'battery') {
        setForm(f => ({ ...f, battery_photos: [...f.battery_photos, imageUpload] }));
      } else if (type === 'tpms_tool') {
        setForm(f => ({ ...f, tpms_tool_photo: [...f.tpms_tool_photo, imageUpload] }));
      } else if (type === 'washer_fluid') {
        setForm(f => ({ ...f, washer_fluid_photo: [...f.washer_fluid_photo, imageUpload] }));
      } else if (type === 'front_brakes') {
        setForm(f => ({ ...f, front_brakes: [...(f.front_brakes || []), imageUpload] }));
      } else if (type === 'rear_brakes') {
        setForm(f => ({ ...f, rear_brakes: [...(f.rear_brakes || []), imageUpload] }));
      } else if (type === 'undercarriage_photos') {
        setForm(f => ({ ...f, undercarriage_photos: [...f.undercarriage_photos, imageUpload] }));
      } else if (['passenger_front', 'driver_front', 'driver_rear', 'passenger_rear', 'driver_rear_inner', 'passenger_rear_inner', 'spare'].includes(type)) {
        setForm(f => {
          const existingPhoto = f.tire_photos.find(p => p.type === type);
          
          if (existingPhoto) {
            return {
              ...f,
              tire_photos: f.tire_photos.map(p => 
                p.type === type 
                  ? { ...p, photos: [...p.photos, imageUpload] }
                  : p
              )
            };
          } else {
            return {
              ...f,
              tire_photos: [...f.tire_photos, { type: type as any, photos: [imageUpload] }]
            };
          }
        });
      }
    } catch (error) {
      console.error('Error handling image:', error);
      setError('Failed to process image');
    }
  };

  const handleImageClick = (photos: ImageUpload[], photoType?: string) => {
    // Image click handling
  };

  const handleDeleteImage = (photoType: string, index: number) => {
    if (photoType === 'mileage_photos') {
      setForm(prev => ({ ...prev, mileage_photos: prev.mileage_photos.filter((_, i) => i !== index) }));
    } else if (photoType === 'windshield_condition_photos') {
      setForm(prev => ({ ...prev, windshield_condition_photos: prev.windshield_condition_photos.filter((_, i) => i !== index) }));
    } else if (photoType === 'wiper_blades_photos') {
      setForm(prev => ({ ...prev, wiper_blades_photos: prev.wiper_blades_photos.filter((_, i) => i !== index) }));
    } else if (photoType === 'washer_squirters_photos') {
      setForm(prev => ({ ...prev, washer_squirters_photos: prev.washer_squirters_photos.filter((_, i) => i !== index) }));
    } else if (photoType === 'vin_photos') {
      setForm(prev => ({ ...prev, vin_photos: prev.vin_photos.filter((_, i) => i !== index) }));
    } else if (photoType === 'state_inspection_status_photos') {
      setForm(prev => ({ ...prev, state_inspection_status_photos: prev.state_inspection_status_photos.filter((_, i) => i !== index) }));
    } else if (photoType === 'state_inspection_date_code_photos') {
      setForm(prev => ({ ...prev, state_inspection_date_code_photos: prev.state_inspection_date_code_photos.filter((_, i) => i !== index) }));
    } else if (photoType === 'battery_date_code_photos') {
      setForm(prev => ({ ...prev, battery_date_code_photos: prev.battery_date_code_photos.filter((_, i) => i !== index) }));
    } else if (photoType === 'tire_repair_status_photos') {
      setForm(prev => ({ ...prev, tire_repair_status_photos: prev.tire_repair_status_photos.filter((_, i) => i !== index) }));
    } else if (photoType === 'tpms_type_photos') {
      setForm(prev => ({ ...prev, tpms_type_photos: prev.tpms_type_photos.filter((_, i) => i !== index) }));
    } else if (photoType === 'front_brake_pads_photos') {
      setForm(prev => ({ ...prev, front_brake_pads_photos: prev.front_brake_pads_photos.filter((_, i) => i !== index) }));
    } else if (photoType === 'rear_brake_pads_photos') {
      setForm(prev => ({ ...prev, rear_brake_pads_photos: prev.rear_brake_pads_photos.filter((_, i) => i !== index) }));
    } else if (photoType === 'front_brakes') {
      setForm(prev => ({ ...prev, front_brakes: prev.front_brakes.filter((_, i) => i !== index) }));
    } else if (photoType === 'rear_brakes') {
      setForm(prev => ({ ...prev, rear_brakes: prev.rear_brakes.filter((_, i) => i !== index) }));
    } else if (photoType === 'tpms_placard') {
      setForm(prev => ({ ...prev, tpms_placard: prev.tpms_placard.filter((_, i) => i !== index) }));
    } else if (photoType === 'washer_fluid_photo') {
      setForm(prev => ({ ...prev, washer_fluid_photo: prev.washer_fluid_photo.filter((_, i) => i !== index) }));
    } else if (photoType === 'engine_air_filter_photo') {
      setForm(prev => ({ ...prev, engine_air_filter_photo: prev.engine_air_filter_photo.filter((_, i) => i !== index) }));
    } else if (photoType === 'battery_photos') {
      setForm(prev => ({ ...prev, battery_photos: prev.battery_photos.filter((_, i) => i !== index) }));
    } else if (photoType === 'tpms_tool_photo') {
      setForm(prev => ({ ...prev, tpms_tool_photo: prev.tpms_tool_photo.filter((_, i) => i !== index) }));
    } else if (photoType === 'dash_lights_photos') {
      setForm(prev => ({ ...prev, dash_lights_photos: prev.dash_lights_photos.filter((_, i) => i !== index) }));
    } else if (photoType === 'undercarriage_photos') {
      setForm(prev => ({ ...prev, undercarriage_photos: prev.undercarriage_photos.filter((_, i) => i !== index) }));
    } else if (photoType && photoType.startsWith('tire_')) {
      const tireType = photoType.replace('tire_', '');
      setForm(prev => ({
        ...prev,
        tire_photos: prev.tire_photos.map(tp => 
          tp.type === tireType 
            ? { ...tp, photos: tp.photos.filter((_, i) => i !== index) }
            : tp
        ).filter(tp => tp.photos.length > 0 || tp.type !== tireType)
      }));
    }
  };

  const handleTirePhotoClick = (position: string) => {
    const tirePhotos = form.tire_photos.find(p => p.type === position)?.photos || [];
    if (tirePhotos.length > 0) {
      handleImageClick(tirePhotos, `tire_${position}`);
    }
  };

  const handleDeleteTirePhoto = (position: string, index: number) => {
    setForm(f => ({
      ...f,
      tire_photos: f.tire_photos.map(tp => 
        tp.type === position 
          ? { ...tp, photos: tp.photos.filter((_, i) => i !== index) }
          : tp
      ).filter(tp => tp.photos.length > 0 || tp.type !== position)
    }));
  };

  const handleTreadChange = (position: string, field: string, value: string) => {
    setForm(f => ({
      ...f,
      tire_tread: {
        ...f.tire_tread,
        [position]: {
          ...f.tire_tread[position as keyof typeof f.tire_tread],
          [field]: value
        }
      }
    }));
  };

  const handleTreadConditionChange = (position: string, field: string, condition: 'green' | 'yellow' | 'red') => {
    setForm(f => ({
      ...f,
      tire_tread: {
        ...f.tire_tread,
        [position]: {
          ...f.tire_tread[position as keyof typeof f.tire_tread],
          [field]: condition
        }
      }
    }));
  };

  const handleTireDateChange = (position: string, date: string) => {
    setForm(f => ({
      ...f,
      tire_dates: {
        ...f.tire_dates,
        [position]: date
      }
    }));
  };

  const handleTireCommentToggle = (position: string, comment: string) => {
    setForm(f => {
      const currentComments = f.tire_comments[position] || [];
      const newComments = currentComments.includes(comment)
        ? currentComments.filter(c => c !== comment)
        : [...currentComments, comment];
      
      return {
        ...f,
        tire_comments: {
          ...f.tire_comments,
          [position]: newComments
        }
      };
    });
  };

  const handleTireStatusChange = (position: string, status: 'repairable' | 'non_repairable' | null) => {
    setForm(f => ({
      ...f,
      tire_repair_statuses: {
        ...f.tire_repair_statuses,
        [position]: status,
      },
      tire_repair_zones: f.tire_repair_zones.map(zone => 
        zone.position === position 
          ? { ...zone, status: status === 'repairable' ? 'good' : status === 'non_repairable' ? 'bad' : null }
          : zone
      ),
    }));
  };

  const handleTireImageUpload = async (position: string, imageType: 'not_repairable' | 'tire_size_brand' | 'repairable_spot', file: File) => {
    try {
      const processedFile = isHEICFile(file) ? await convertHEICToJPEG(file) : file;
      
      // Upload to 'tire_images' folder
      const uploadResult = await uploadImageToServer(processedFile, 'tire_images');
      
      if (!uploadResult.success) {
        setError(uploadResult.error || 'Failed to upload tire image');
        return;
      }
      
      const imageUpload: ImageUpload = {
        file: processedFile,
        progress: 100,
        url: uploadResult.serverUrl // Store relative path directly
      };

      setForm(f => ({
        ...f,
        tire_repair_images: {
          ...f.tire_repair_images,
          [position]: {
            ...f.tire_repair_images[position as keyof typeof f.tire_repair_images],
            [imageType]: [...f.tire_repair_images[position as keyof typeof f.tire_repair_images][imageType], imageUpload]
          }
        }
      }));
    } catch (error) {
      console.error('Error handling tire repair image:', error);
      setError('Failed to process image');
    }
  };

  const handleTireImageDelete = (position: string, imageType: 'not_repairable' | 'tire_size_brand' | 'repairable_spot', index: number) => {
    setForm(f => ({
      ...f,
      tire_repair_images: {
        ...f.tire_repair_images,
        [position]: {
          ...f.tire_repair_images[position as keyof typeof f.tire_repair_images],
          [imageType]: f.tire_repair_images[position as keyof typeof f.tire_repair_images][imageType].filter((_, i) => i !== index)
        }
      }
    }));
  };

  const handleTPMSStatusChange = (position: string, status: boolean | null) => {
    setForm(f => ({
      ...f,
      tpms_statuses: {
        ...f.tpms_statuses,
        [position]: status,
      },
    }));
  };

  const handleFieldNotesChange = (fieldName: string, noteText: string) => {
    setForm(f => ({
      ...f,
      field_notes: {
        ...f.field_notes,
        [fieldName]: noteText,
      },
    }));
  };

  const handleTirePhotoFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    await handleImageUpload(file, 'tire_photo');
  };

  // Submit function
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Prepare the form data with submitted status and timestamp
      const submittedForm = {
        ...form,
        status: 'submitted',
        submitted_datetime: new Date().toISOString(),
        submitted_by: userId,
        submitted_by_name: userName
      };
      
      // Use the proper submitQuickCheck API function for final submission
      const title = `Quick Check - ${form.vin || 'No VIN'} - ${new Date().toLocaleDateString()}`;
      
      const result = await submitQuickCheck(title, submittedForm, draft.draftId || undefined);
      
      console.log('✅ Quick Check submitted successfully:', result);
      
      showSuccess(`Quick Check for ${form.vin} submitted successfully!`);
      
      // After successful submission, the draft is consumed by the API
      // So we only need to clear session locks and reset state
      console.log('🔓 Clearing session locks after successful submission');
      
      // Clear draft session locks
      const sessionKey = `quickcheck_session_${userId}`;
      const draftLockKey = 'quickcheck_draft_lock';
      const draftSessionKey = 'quickcheck_draft_session';
      
      try {
        sessionStorage.removeItem(sessionKey);
        sessionStorage.removeItem(draftLockKey);
        sessionStorage.removeItem(draftSessionKey);
        console.log('🔓 All session locks cleared');
      } catch (error) {
        console.warn('Could not clear session locks:', error);
      }
      
      // Reset form state to initial state since submission was successful
      setForm(initialFormState);
      
      // Reset draft state without API call since draft is already consumed
      // The draft hook will be reinitialized when the component unmounts/remounts
      
      setSuccess(true);
      
      setTimeout(() => {
        navigate('/');
      }, 1500);
      
    } catch (err: any) {
      console.error('Error submitting form:', err);
      
      let errorMessage = 'Failed to submit Quick Check';
      if (err?.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err?.message) {
        errorMessage = err.message;
      }
      
      showError(errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Cancel function
  const handleCancel = () => {
    setCancelDialogOpen(true);
  };

  const cancelCancel = () => {
    setCancelDialogOpen(false);
  };

  const confirmCancel = async () => {
    timerAPI.current?.stopAllTimers();
    
    await draft.deleteDraft();
    
    setForm(initialFormState);
    
    navigate('/');
  };

  // Timing functions
  const handleShowTiming = async () => {
    if (!draft.draftId) return;
    
    setTimingLoading(true);
    try {
      const timing = await getTimingSummary(draft.draftId);
      setTimingData(timing);
      setShowTimingDialog(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to get timing summary');
    } finally {
      setTimingLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = seconds % 60;
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    }
  };

  // History and inspection handling functions
  const handleViewInspection = (inspection: any) => {
    setSelectedInspection(inspection);
    setShowDetailDialog(true);
  };

  const handleDeleteInspection = async (inspectionId: string) => {
    try {
      await deleteQuickCheck(parseInt(inspectionId));
      const updatedHistory = await getQuickCheckHistory();
      setInspectionHistory(updatedHistory);
    } catch (error) {
      console.error('Error deleting inspection:', error);
    }
  };

  const handleCloseDetailDialog = () => {
    setShowDetailDialog(false);
    setSelectedInspection(null);
  };

  const [selectedQuickCheck, setSelectedQuickCheck] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // Track tab exit when component unmounts and handle cleanup
  useEffect(() => {
    return () => {
      timerAPI.current?.stopAllTimers();
      if (draft.draftId) {
        trackTabExit(draft.draftId, tabValue);
      }
    };
  }, [draft.draftId, tabValue]);

  // Set start time when component mounts and add page visibility listener
  useEffect(() => {
    document.addEventListener('visibilitychange', handlePageVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handlePageVisibilityChange);
    };
  }, [handlePageVisibilityChange]);

  // Load debug panel setting from localStorage and listen for changes
  useEffect(() => {
    const loadDebugSetting = () => {
      const savedSettings = localStorage.getItem('quickCheckSettings');
      if (savedSettings) {
        try {
          const parsedSettings = JSON.parse(savedSettings);
          setShowDebugPanel(parsedSettings.showDebugTimerPanel || false);
        } catch (error) {
          console.error('Error loading debug panel setting:', error);
          setShowDebugPanel(false);
        }
      } else {
        setShowDebugPanel(false);
      }
    };

    loadDebugSetting();

    const handleSettingsChange = (event: CustomEvent) => {
      setShowDebugPanel(event.detail.showDebugTimerPanel || false);
    };

    window.addEventListener('quickCheckSettingsChanged', handleSettingsChange as EventListener);
    
    return () => {
      window.removeEventListener('quickCheckSettingsChanged', handleSettingsChange as EventListener);
    };
  }, []);

  // Auto-decode VIN when it changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (form.vin && form.vin.length === 17) {
        console.log('🔄 VIN changed, triggering decode:', form.vin);
        decodeVinIfValid(form.vin);
      }
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [form.vin]);
  
  return (
    <ThemeProvider theme={theme}>
      {/* Blue header bar */}
      <Box sx={{ 
        backgroundColor: '#024FFF', 
        color: 'white', 
        py: 2, 
        px: 3,
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        boxShadow: 2
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" component="h1">
            Quick Check
          </Typography>
          
          {/* Draft status indicators */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {draft.status === 'loading' && (
              <>
                <CircularProgress size={16} sx={{ color: 'white' }} />
                <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                  Loading...
                </Typography>
              </>
            )}
            {draft.status === 'updating' && (
              <>
                <CircularProgress size={16} sx={{ color: 'white' }} />
                <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                  Saving...
                </Typography>
              </>
            )}
            {draft.lastSave && draft.status === 'idle' && (
              <>
                <CheckCircleIcon sx={{ fontSize: 16, color: 'success.light' }} />
                <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                  Saved
                </Typography>
              </>
            )}
            {draft.error && (
              <>
                <CancelIcon sx={{ fontSize: 16, color: 'error.light' }} />
                <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                  Save Error
                </Typography>
              </>
            )}
            {draft.lastSave && draft.status === 'idle' && !draft.error && (
              <Typography variant="body2" sx={{ fontSize: '0.75rem', opacity: 0.8 }}>
                Last saved: {draft.lastSave.toLocaleTimeString()}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
      
      <Container maxWidth="lg">
        <Box sx={{ py: 1, pb: 8 }}>
          {/* Virtual Tab Timer Component */}
          <VirtualTabTimer
            tabNames={tabNames}
            currentTabIndex={tabValue}
            initialTimings={form.tab_timings}
            onTabTimingUpdate={handleTabTimingUpdate}
            onTabChange={handleTabChangeFromTimer}
            showDebugPanel={showDebugPanel}
            isPageVisible={isPageVisible}
          >
            {(api) => {
              timerAPI.current = api;
              return null;
            }}
          </VirtualTabTimer>

          <Paper sx={{ width: '100%' }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs
                value={tabValue}
                onChange={handleTabChange}
                aria-label="quick check tabs"
                variant="scrollable"
                scrollButtons="auto"
              >
                <Tab label="Info" />
                <Tab label="Pulling Into Bay" />
                <Tab label="Underhood" />
                <Tab label="Tires & Brakes" />
              </Tabs>
            </Box>

            <form onSubmit={handleSubmit}>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                  {error}
                </Alert>
              )}
              
              <TabPanel value={tabValue} index={0}>
                <InfoTab form={form} onChange={handleChange} />
              </TabPanel>
                
              <TabPanel value={tabValue} index={1}>
                <PullingIntoBayTab
                  form={form}
                  loading={loading}
                  onChange={handleChange}
                  onRadioChange={handleRadioChange}
                  onImageUpload={handleImageUpload}
                  onImageClick={handleImageClick}
                  onInfoClick={handleInfoClick}
                  onFormUpdate={handleFormUpdate}
                  onFieldNotesChange={handleFieldNotesChange}
                  onDeleteImage={handleDeleteImage}
                />
              </TabPanel>

              <TabPanel value={tabValue} index={2}>
                <UnderhoodTab
                  form={form}
                  loading={loading}
                  onChange={handleChange}
                  onRadioChange={handleRadioChange}
                  onImageUpload={handleImageUpload}
                  onImageClick={handleImageClick}
                  onInfoClick={handleInfoClick}
                  onFormUpdate={handleFormUpdate}
                  onBatteryConditionChange={handleBatteryConditionChange}
                  onBatteryTerminalsToggle={handleBatteryTerminalsToggle}
                  onFieldNotesChange={handleFieldNotesChange}
                  onDeleteImage={handleDeleteImage}
                />
              </TabPanel>

              <TabPanel value={tabValue} index={3}>
                <TiresBrakesTab
                  form={form}
                  loading={loading}
                  onChange={handleChange}
                  onRadioChange={handleRadioChange}
                  onImageUpload={handleImageUpload}
                  onImageClick={handleImageClick}
                  onInfoClick={handleInfoClick}
                  onTreadChange={handleTreadChange}
                  onTreadConditionChange={handleTreadConditionChange}
                  onTirePhotoClick={handleTirePhotoClick}
                  onDeleteTirePhoto={handleDeleteTirePhoto}
                  onTireDateChange={handleTireDateChange}
                  onTireCommentToggle={handleTireCommentToggle}
                  onTireStatusChange={handleTireStatusChange}
                  onTireImageUpload={handleTireImageUpload}
                  onTireImageDelete={handleTireImageDelete}
                  onTPMSStatusChange={handleTPMSStatusChange}
                  onFieldNotesChange={handleFieldNotesChange}
                  onDeleteImage={handleDeleteImage}
                  setForm={setForm}
                />
              </TabPanel>
            </form>
          </Paper>
        </Box>

        {/* Fixed Bottom Navigation and Submit Buttons */}
        <Box
          sx={{
            position: 'fixed',
            left: 0,
            bottom: 15,
            width: '100vw',
            zIndex: 1200,
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider',
            boxShadow: 3,
            display: 'flex',
            justifyContent: 'center',
            pb: 'env(safe-area-inset-bottom, 10px)',
            '&::after': {
              content: '""',
              position: 'absolute',
              bottom: '-35px',
              left: 0,
              right: 0,
              height: '35px',
              bgcolor: 'background.paper',
              zIndex: -1,
            }
          }}
        >
          <Box sx={{ 
            width: '100%', 
            maxWidth: 1200, 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            height: '100%',
            p: 1.5
          }}>
            <Button
              variant="text"
              onClick={() => timerAPI.current?.changeTab(Math.max(0, tabValue - 1))}
              disabled={tabValue === 0}
              sx={{ color: 'black' }}
            >
              Prev
            </Button>
            <Button
              variant="text"
              onClick={handleCancel}
              sx={{ mx: 2, color: 'red' }}
            >
              Cancel
            </Button>
            {draft.draftId && showDebugPanel && (
              <Button
                variant="text"
                onClick={handleShowTiming}
                sx={{ mx: 1, color: 'black' }}
                startIcon={<HistoryIcon />}
              >
                Timing
              </Button>
            )}
            {tabValue < 3 ? (
              <Button
                variant="text"
                onClick={() => timerAPI.current?.changeTab(Math.min(3, tabValue + 1))}
                sx={{ color: '#1042D8' }}
              >
                Next
              </Button>
            ) : (
              <Button
                variant="text"
                disabled={loading}
                onClick={() => handleSubmit()}
                sx={{ color: '#1042D8' }}
              >
                {loading ? <CircularProgress size={24} /> : 'Save'}
              </Button>
            )}
          </Box>
        </Box>

        {/* Image Handling Component */}
        <ImageHandling
          onImageUpload={handleImageUpload}
          onImageClick={handleImageClick}
          onDeleteImage={handleDeleteImage}
          onError={setError}
          showDebugPanel={showDebugPanel}
        />

        {/* Tire photo input now handled by ImageHandling component */}

        {/* History modal */}
        <Dialog
          open={showHistory}
          onClose={() => setShowHistory(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogContent>
            <Typography variant="h6" gutterBottom>
              Inspection History
            </Typography>
            {inspectionHistory.length > 0 ? (
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                {inspectionHistory.map((inspection, index) => (
                  <Paper key={index} sx={{ p: 2, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="subtitle1">
                        VIN: {inspection.vin || inspection.data?.vin}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Date: {inspection.date || inspection.data?.date}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        User: {inspection.user || inspection.data?.user}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button variant="outlined" onClick={() => handleViewInspection(inspection)}>
                        View
                      </Button>
                      <Button color="error" variant="outlined" onClick={() => handleDeleteInspection(inspection.id)}>
                        Delete
                      </Button>
                    </Stack>
                  </Paper>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No inspection history found.
              </Typography>
            )}
          </DialogContent>
        </Dialog>

        {/* Add the detail view dialog */}
        <Dialog
          open={showDetailDialog}
          onClose={handleCloseDetailDialog}
          maxWidth="md"
          fullWidth
        >
          <DialogContent>
            {selectedInspection && (
              <Box>
                <Typography variant="h6" gutterBottom>
                  Inspection Details
                </Typography>
                <Typography variant="subtitle1">VIN: {selectedInspection.data?.vin}</Typography>
                <Typography>Date: {selectedInspection.data?.date}</Typography>
                <Typography>User: {selectedInspection.data?.user}</Typography>
                <Typography>Mileage: {selectedInspection.data?.mileage}</Typography>
                <Typography>Windshield Condition: {selectedInspection.data?.windshield_condition}</Typography>
                <Typography>Wiper Blades: {selectedInspection.data?.wiper_blades}</Typography>
                <Typography>Washer Squirters: {selectedInspection.data?.washer_squirters}</Typography>
                {selectedInspection.data?.dash_lights_photos?.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2">Dash Lights Photos:</Typography>
                    <Stack direction="row" spacing={1}>
                      {selectedInspection.data.dash_lights_photos.map((photo: any, idx: number) => (
                        <img key={idx} src={photo.url} alt={`Dash Light ${idx + 1}`} style={{ maxWidth: 100, maxHeight: 100 }} />
                      ))}
                    </Stack>
                  </Box>
                )}
              </Box>
            )}
          </DialogContent>
        </Dialog>

        {/* Vehicle Details Popup Dialog */}
        <Dialog open={vehicleDetailsOpen} onClose={() => setVehicleDetailsOpen(false)} maxWidth="sm" fullWidth>
          <DialogContent>
            <Tabs value={vehicleDetailsTab || 0} onChange={(_, v) => setVehicleDetailsTab(v)} sx={{ mb: 2 }}>
              <Tab label="Summary" />
              <Tab label="All Fields" />
              <Tab label="Raw JSON" />
            </Tabs>
            {vehicleDetailsTab === 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>Vehicle Details (Summary)</Typography>
                {vehicleDetails && vehicleDetails.Results && vehicleDetails.Results.length > 0 ? (
                  <>
                    {[
                      'Model Year',
                      'Make',
                      'Model',
                      'Engine Number of Cylinders',
                      'Displacement (L)',
                      'Engine Configuration',
                      'Other Engine Info',
                      'Displacement (CI)',
                      'Engine Model',
                      'Engine Brake (hp) From',
                      'Drive Type',
                      'Transmission Speeds',
                      'Transmission Style',
                      'Vehicle Type',
                      'Body Class',
                    ].map((field) => {
                      const r = vehicleDetails.Results.find((r: any) => r.Variable === field);
                      return r && r.Value && r.Value !== 'Not Applicable' && r.Value !== '0' ? (
                        <Box key={field} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                          <Typography variant="body2" color="text.secondary">{field}:</Typography>
                          <Typography variant="body2" fontWeight={500}>{r.Value}</Typography>
                        </Box>
                      ) : null;
                    })}
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">No details found for this VIN.</Typography>
                )}
              </Box>
            )}
            {vehicleDetailsTab === 1 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>All Decoded Fields</Typography>
                {vehicleDetails && vehicleDetails.Results && vehicleDetails.Results.length > 0 ? (
                  <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                    {vehicleDetails.Results.filter((r: any) => r.Value && r.Value !== 'Not Applicable' && r.Value !== '0').map((r: any) => (
                      <Box key={r.Variable} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">{r.Variable}:</Typography>
                        <Typography variant="body2" fontWeight={500}>{r.Value}</Typography>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">No details found for this VIN.</Typography>
                )}
              </Box>
            )}
            {vehicleDetailsTab === 2 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>Raw API Response</Typography>
                <pre style={{ maxHeight: 400, overflow: 'auto', background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                  {JSON.stringify(vehicleDetails, null, 2)}
                </pre>
              </Box>
            )}
          </DialogContent>
        </Dialog>

        {/* Cancel Confirmation Dialog */}
        <Dialog open={cancelDialogOpen} onClose={cancelCancel}>
          <DialogContent>
            <Typography variant="h6" gutterBottom>Cancel Quick Check?</Typography>
            <Typography gutterBottom>
              Are you sure you want to cancel? This will permanently delete your auto-saved progress.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Tip: You can safely close your browser instead - your work will be automatically saved and restored when you return.
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
              <Button onClick={cancelCancel} color="primary">No</Button>
              <Button onClick={confirmCancel} color="error" variant="contained">Yes, Cancel</Button>
            </Box>
          </DialogContent>
        </Dialog>

        {/* Info Popover */}
        <Popover
          open={open}
          anchorEl={infoAnchorEl}
          onClose={handleInfoClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          PaperProps={{
            sx: {
              p: 2,
              maxWidth: 300,
              bgcolor: 'background.paper',
              boxShadow: 3,
            },
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {infoContent}
          </Typography>
        </Popover>

        {/* Timing Dialog */}
        <Dialog open={showTimingDialog} onClose={() => setShowTimingDialog(false)} maxWidth="md" fullWidth>
          <DialogContent>
            <Typography variant="h6" gutterBottom>Quick Check Timing Summary</Typography>
            {timingData && (
              <Box>
                <Typography variant="subtitle1" gutterBottom>Status: {timingData.status}</Typography>
                
                <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>Tab Timings</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Paper sx={{ p: 2, border: timingData.tabTimings.info.isActive ? 2 : 1, borderColor: timingData.tabTimings.info.isActive ? 'success.main' : 'divider' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" color="primary">Info Tab</Typography>
                        {timingData.tabTimings.info.isActive && (
                          <Chip 
                            label="ACTIVE" 
                            size="small" 
                            color="success" 
                            sx={{ ml: 1, fontSize: '0.7rem' }}
                          />
                        )}
                      </Box>
                      <Typography variant="body2">Duration: {formatDuration(timingData.tabTimings.info.duration)}</Typography>
                      {timingData.tabTimings.info.start && (
                        <Typography variant="caption" color="text.secondary">
                          Start: {new Date(timingData.tabTimings.info.start).toLocaleString()}
                        </Typography>
                      )}
                    </Paper>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Paper sx={{ p: 2, border: timingData.tabTimings.pulling.isActive ? 2 : 1, borderColor: timingData.tabTimings.pulling.isActive ? 'success.main' : 'divider' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" color="primary">Pulling Into Bay</Typography>
                        {timingData.tabTimings.pulling.isActive && (
                          <Chip 
                            label="ACTIVE" 
                            size="small" 
                            color="success" 
                            sx={{ ml: 1, fontSize: '0.7rem' }}
                          />
                        )}
                      </Box>
                      <Typography variant="body2">Duration: {formatDuration(timingData.tabTimings.pulling.duration)}</Typography>
                      {timingData.tabTimings.pulling.start && (
                        <Typography variant="caption" color="text.secondary">
                          Start: {new Date(timingData.tabTimings.pulling.start).toLocaleString()}
                        </Typography>
                      )}
                    </Paper>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Paper sx={{ p: 2, border: timingData.tabTimings.underhood.isActive ? 2 : 1, borderColor: timingData.tabTimings.underhood.isActive ? 'success.main' : 'divider' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" color="primary">Underhood</Typography>
                        {timingData.tabTimings.underhood.isActive && (
                          <Chip 
                            label="ACTIVE" 
                            size="small" 
                            color="success" 
                            sx={{ ml: 1, fontSize: '0.7rem' }}
                          />
                        )}
                      </Box>
                      <Typography variant="body2">Duration: {formatDuration(timingData.tabTimings.underhood.duration)}</Typography>
                      {timingData.tabTimings.underhood.start && (
                        <Typography variant="caption" color="text.secondary">
                          Start: {new Date(timingData.tabTimings.underhood.start).toLocaleString()}
                        </Typography>
                      )}
                    </Paper>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Paper sx={{ p: 2, border: timingData.tabTimings.tires.isActive ? 2 : 1, borderColor: timingData.tabTimings.tires.isActive ? 'success.main' : 'divider' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" color="primary">Tires & Brakes</Typography>
                        {timingData.tabTimings.tires.isActive && (
                          <Chip 
                            label="ACTIVE" 
                            size="small" 
                            color="success" 
                            sx={{ ml: 1, fontSize: '0.7rem' }}
                          />
                        )}
                      </Box>
                      <Typography variant="body2">Duration: {formatDuration(timingData.tabTimings.tires.duration)}</Typography>
                      {timingData.tabTimings.tires.start && (
                        <Typography variant="caption" color="text.secondary">
                          Start: {new Date(timingData.tabTimings.tires.start).toLocaleString()}
                        </Typography>
                      )}
                    </Paper>
                  </Grid>
                </Grid>

                <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>Overall Durations</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <Paper sx={{ p: 2, bgcolor: 'success.light' }}>
                      <Typography variant="subtitle2" color="white">Created to Submitted</Typography>
                      <Typography variant="h6" color="white">
                        {formatDuration(timingData.durations.createdToSubmitted)}
                      </Typography>
                    </Paper>
                  </Grid>
                  {timingData.status === 'archived' && (
                    <>
                      <Grid item xs={12} sm={4}>
                        <Paper sx={{ p: 2, bgcolor: 'warning.light' }}>
                          <Typography variant="subtitle2" color="white">Submitted to Archived</Typography>
                          <Typography variant="h6" color="white">
                            {formatDuration(timingData.durations.submittedToArchived)}
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <Paper sx={{ p: 2, bgcolor: 'error.light' }}>
                          <Typography variant="subtitle2" color="white">Created to Archived</Typography>
                          <Typography variant="h6" color="white">
                            {formatDuration(timingData.durations.createdToArchived)}
                          </Typography>
                        </Paper>
                      </Grid>
                    </>
                  )}
                </Grid>

                <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>Timestamps</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="body2">
                      <strong>Created:</strong><br />
                      {new Date(timingData.timestamps.created).toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="body2">
                      <strong>Last Updated:</strong><br />
                      {new Date(timingData.timestamps.updated).toLocaleString()}
                    </Typography>
                  </Grid>
                  {timingData.timestamps.archived && (
                    <Grid item xs={12} sm={4}>
                      <Typography variant="body2">
                        <strong>Archived:</strong><br />
                        {new Date(timingData.timestamps.archived).toLocaleString()}
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              </Box>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button onClick={() => setShowTimingDialog(false)}>Close</Button>
            </Box>
          </DialogContent>
        </Dialog>

        {/* VIN Scanner Modal */}
        <VinScanner
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScanResult={handleScanResult}
        />

        {/* Notification Snackbar */}
        <NotificationSnackbar
          notification={notification}
          onClose={hideNotification}
        />
      </Container>
    </ThemeProvider>
  );
};

export default QuickCheck; 