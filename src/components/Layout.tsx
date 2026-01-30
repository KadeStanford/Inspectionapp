import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box,
  Avatar,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  Collapse,
  Badge,
  Paper,
  Popover,
  TextField,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  BottomNavigation,
  BottomNavigationAction,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Settings as SettingsIcon,
  Home as HomeIcon,
  QuestionAnswer as QuestionAnswerIcon,
  ExpandLess,
  ExpandMore,
  Receipt as ReceiptIcon,
  Chat as ChatIcon,
  Message as MessageIcon,
  Send as SendIcon,
  ArrowBack as ArrowBackIcon,
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Assignment as AssignmentIcon,
  Person as PersonIcon,
  Logout as LogoutIcon,
  Refresh as RefreshIcon,
  AccountBalance as CashIcon,
  LocalPolice as LocalPoliceIcon
} from '@mui/icons-material';
import { logout, getChatConversations, getChatMessages, sendChatMessage, getChatUsers, createOrGetConversation, deleteChatMessage, deleteChatConversation, ChatConversation, ChatMessage, ChatUser } from '../services/api';
import ConnectionStatusIndicator from './ConnectionStatusIndicator';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileMenuAnchor, setProfileMenuAnchor] = useState<null | HTMLElement>(null);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(false);
  
  // Message overlay states
  const [messageAnchor, setMessageAnchor] = useState<null | HTMLElement>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [previousMessageCount, setPreviousMessageCount] = useState(0);
  const [showPingAnimation, setShowPingAnimation] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<ChatUser[]>([]);
  const [showUserSelection, setShowUserSelection] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [contextMenuAnchor, setContextMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedMessageForDelete, setSelectedMessageForDelete] = useState<ChatMessage | null>(null);
  const [deleteConversationOpen, setDeleteConversationOpen] = useState(false);
  const [selectedConversationForDelete, setSelectedConversationForDelete] = useState<ChatConversation | null>(null);

  // Audio context state for mobile compatibility
  const [audioInitialized, setAudioInitialized] = useState(false);
  
  // Mobile view state
  const [mobileViewEnabled, setMobileViewEnabled] = useState(false);
  const [bottomNavValue, setBottomNavValue] = useState(0);

  const currentUserEmail = localStorage.getItem('userEmail') || '';

  // Initialize audio on first user interaction (required for mobile)
  const initializeAudio = async () => {
    if (audioInitialized) return;
    
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      // On mobile, also try to play a silent sound to fully unlock audio
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        try {
          // Create a silent oscillator to unlock audio on mobile
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          gainNode.gain.setValueAtTime(0, audioContext.currentTime);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.01);
        } catch (unlockError) {
          console.log('Mobile audio unlock failed:', unlockError);
        }
      }
      
      setAudioInitialized(true);
    } catch (error) {
      console.log('Could not initialize audio:', error);
    }
  };

  // Load conversations when component mounts
  useEffect(() => {
    loadConversations();
    // Set up periodic refresh for unread count
    const interval = setInterval(loadConversations, 30000); // Refresh every 30 seconds
    
    // Check mobile view setting from localStorage
    const savedSettings = localStorage.getItem('quickCheckSettings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        const userRole = localStorage.getItem('userRole') || '';
        // Default to true for Technicians if no explicit setting
        setMobileViewEnabled(settings.mobileViewEnabled !== undefined ? settings.mobileViewEnabled : userRole === 'Technician');
      } catch (error) {
        console.error('Error loading mobile view settings:', error);
        // Default based on user role
        const userRole = localStorage.getItem('userRole') || '';
        setMobileViewEnabled(userRole === 'Technician');
      }
    } else {
      // Default based on user role
      const userRole = localStorage.getItem('userRole') || '';
      setMobileViewEnabled(userRole === 'Technician');
    }
    
    // Set bottom nav value based on current location
    const path = window.location.pathname;
    if (path === '/') setBottomNavValue(0);
    else if (path === '/quick-check') setBottomNavValue(1);
    else if (path === '/settings') setBottomNavValue(2);
    
    // Add ping animation to document head
    const style = document.createElement('style');
    style.textContent = `
      @keyframes ping {
        75%, 100% {
          transform: scale(2);
          opacity: 0;
        }
      }
      .ping-animation::before {
        content: "";
        position: absolute;
        top: -5px;
        left: -5px;
        right: -5px;
        bottom: -5px;
        border-radius: 50%;
        border: 2px solid #024FFF;
        animation: ping 1s cubic-bezier(0, 0, 0.2, 1);
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      clearInterval(interval);
      document.head.removeChild(style);
    };
  }, []);

  // Update bottom nav value when route changes
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/') setBottomNavValue(0);
    else if (path === '/quick-check') setBottomNavValue(1);
    else if (path === '/settings') setBottomNavValue(2);
  }, [window.location.pathname]);

  // Listen for settings changes
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'quickCheckSettings' && e.newValue) {
        try {
          const settings = JSON.parse(e.newValue);
          const userRole = localStorage.getItem('userRole') || '';
          setMobileViewEnabled(settings.mobileViewEnabled !== undefined ? settings.mobileViewEnabled : userRole === 'Technician');
        } catch (error) {
          console.error('Error parsing settings from storage event:', error);
        }
      }
    };

    const handleSettingsChanged = (e: CustomEvent) => {
      const settings = e.detail;
      const userRole = localStorage.getItem('userRole') || '';
      setMobileViewEnabled(settings.mobileViewEnabled !== undefined ? settings.mobileViewEnabled : userRole === 'Technician');
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('quickCheckSettingsChanged', handleSettingsChanged as EventListener);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('quickCheckSettingsChanged', handleSettingsChanged as EventListener);
    };
  }, []);

  const loadConversations = async () => {
    try {
      setLoadingConversations(true);
      const conversationsData = await getChatConversations();
      setConversations(conversationsData);
      
      // Calculate total unread count
      const unreadCount = conversationsData.reduce((total, conv) => total + (conv.unread_count || 0), 0);
      
      // Check if there are new messages (ping notification)
      if (previousMessageCount > 0 && unreadCount > totalUnreadCount) {
        triggerPingNotification();
      }
      
      setTotalUnreadCount(unreadCount);
      
      // Store the current total for comparison
      const currentTotal = conversationsData.reduce((total, conv) => total + (conv.message_count || 0), 0);
      if (previousMessageCount === 0) {
        setPreviousMessageCount(currentTotal); // Initialize on first load
      } else if (currentTotal > previousMessageCount) {
        setPreviousMessageCount(currentTotal);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoadingConversations(false);
    }
  };

  const loadMessages = async (conversationId: number) => {
    try {
      setLoadingMessages(true);
      const messagesData = await getChatMessages(conversationId);
      setMessages(messagesData);
      // Refresh conversations to update unread count
      loadConversations();
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedConversation || !newMessage.trim() || sending) return;

    try {
      setSending(true);
      // Initialize audio on user interaction (for mobile)
      initializeAudio();
      const sentMessage = await sendChatMessage(selectedConversation.id, newMessage.trim());
      setMessages(prev => [...prev, sentMessage]);
      setNewMessage('');
      loadConversations(); // Refresh conversations list
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const handleMessageMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMessageAnchor(event.currentTarget);
    if (conversations.length === 0) {
      loadConversations();
    }
    // Initialize audio on first interaction (required for mobile)
    initializeAudio();
  };

  const handleMessageMenuClose = () => {
    setMessageAnchor(null);
    setSelectedConversation(null);
    setMessages([]);
    setNewMessage('');
    setShowUserSelection(false);
    setSelectedUser('');
    setContextMenuAnchor(null);
    setSelectedMessageForDelete(null);
  };

  const handleConversationSelect = (conversation: ChatConversation) => {
    setSelectedConversation(conversation);
    loadMessages(conversation.id);
    // Initialize audio on user interaction (for mobile)
    initializeAudio();
  };

  const handleBackToConversations = () => {
    setSelectedConversation(null);
    setMessages([]);
    setNewMessage('');
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (messageDate.getTime() === today.getTime()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (messageDate.getTime() === today.getTime() - 24 * 60 * 60 * 1000) {
      return 'Yesterday ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  const isCurrentUser = (email: string) => {
    const result = email === currentUserEmail;
    // Temporary debug for desktop issue
    if (email && currentUserEmail) {
      console.log('Desktop Debug - isCurrentUser:', {
        messageEmail: email,
        currentUserEmail: currentUserEmail,
        result: result,
        emailsMatch: email === currentUserEmail,
        emailTrimmed: email.trim(),
        currentEmailTrimmed: currentUserEmail.trim(),
        device: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
      });
    }
    return result;
  };

  const getUserInitials = (name?: string) => {
    const userName = name || localStorage.getItem('userName') || '';
    if (!userName) return 'U';
    const names = userName.trim().split(' ');
    if (names.length === 1) {
      return names[0].charAt(0).toUpperCase();
    }
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
  };

  const getUserRole = () => {
    // Try to get role from localStorage first
    const role = localStorage.getItem('userRole');
    if (role) return role;
    
    // If not in localStorage, try to decode from JWT token
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.role || 'Technician';
      } catch (e) {
        return 'Technician';
      }
    }
    return 'Technician';
  };

  const isAdmin = () => {
    return getUserRole() === 'Admin';
  };

  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setDrawerOpen(false);
  };

  const handleArchivedToggle = () => {
    setArchivedExpanded(!archivedExpanded);
  };

  const handleAdminToggle = () => {
    setAdminExpanded(!adminExpanded);
  };

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setProfileMenuAnchor(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setProfileMenuAnchor(null);
  };

  const handleProfileClick = () => {
    navigate('/profile');
    handleProfileMenuClose();
  };

  const handleSettingsClick = () => {
    navigate('/settings');
    handleProfileMenuClose();
  };

  const handleLogoutClick = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout even if API call fails
      localStorage.removeItem('token');
      localStorage.removeItem('userName');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userRole');
      localStorage.removeItem('userId');
      navigate('/login');
    }
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const archivedMenuItems = [
    { text: 'Archived Static Stickers', path: '/oil-change-stickers/archived' },
    { text: 'Archived Quick Check', path: '/history' }
  ];

  const adminMenuItems = [
    { text: 'Quick Check Drafts', path: '/quick-check-drafts' },
    { text: 'Quick Check Database', path: '/quick-check-database' },
    { text: 'Database', path: '/databases' },
    { text: 'Chat', path: '/chat' },
    { text: 'Label Manager', path: '/label-manager' },
    { text: 'ShopMonkey API', path: '/shopmonkey' },
    { text: 'ShopMonkey Admin', path: '/shopmonkey-admin' },
    { text: 'State Inspection Analytics', path: '/state-inspection-records?tab=2' },
    { text: 'Drawer Settings', path: '/drawer-settings' },
    { text: 'Cash Analytics', path: '/cash-analytics' }
  ];

  const drawer = (
    <Box sx={{ width: 250 }} role="presentation">
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" component="div">
          Navigation
        </Typography>
      </Box>
      <Divider />
      <List>
        <ListItem disablePadding>
          <ListItemButton onClick={() => handleNavigation('/')}>
            <ListItemIcon>
              <HomeIcon />
            </ListItemIcon>
            <ListItemText primary="Home" />
          </ListItemButton>
        </ListItem>

        <ListItem disablePadding>
          <ListItemButton onClick={() => handleNavigation('/quick-check')}>
            <ListItemIcon>
              <QuestionAnswerIcon />
            </ListItemIcon>
            <ListItemText primary="QuickCheck" />
          </ListItemButton>
        </ListItem>

        <ListItem disablePadding>
          <ListItemButton onClick={() => handleNavigation('/state-inspection-records')}>
            <ListItemIcon>
              <LocalPoliceIcon />
            </ListItemIcon>
            <ListItemText primary="State Inspections" />
          </ListItemButton>
        </ListItem>

        <ListItem disablePadding>
          <ListItemButton onClick={() => handleNavigation('/bank-deposit-records')}>
            <ListItemIcon>
              <ReceiptIcon />
            </ListItemIcon>
            <ListItemText primary="Bank Deposits" />
          </ListItemButton>
        </ListItem>

        <ListItem disablePadding>
          <ListItemButton onClick={() => handleNavigation('/drawer-count')}>
            <ListItemIcon>
              <CashIcon />
            </ListItemIcon>
            <ListItemText primary="Drawer Count" />
          </ListItemButton>
        </ListItem>

        {/* Archived section with sub-navigation */}
        <ListItem disablePadding>
          <ListItemButton onClick={handleArchivedToggle}>
            <ListItemText primary="Archived" />
            {archivedExpanded ? <ExpandLess /> : <ExpandMore />}
          </ListItemButton>
        </ListItem>
        <Collapse in={archivedExpanded} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {archivedMenuItems.map((item) => (
              <ListItem key={item.text} disablePadding>
                <ListItemButton sx={{ pl: 4 }} onClick={() => handleNavigation(item.path)}>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Collapse>
        
        {/* Admin section with sub-navigation (only show for admins) */}
        {isAdmin() && (
          <>
            <ListItem disablePadding>
              <ListItemButton onClick={handleAdminToggle}>
                <ListItemText primary="Admin" />
                {adminExpanded ? <ExpandLess /> : <ExpandMore />}
              </ListItemButton>
            </ListItem>
            <Collapse in={adminExpanded} timeout="auto" unmountOnExit>
              <List component="div" disablePadding>
                {adminMenuItems.map((item) => (
                  <ListItem key={item.text} disablePadding>
                    <ListItemButton sx={{ pl: 4 }} onClick={() => handleNavigation(item.path)}>
                      <ListItemText primary={item.text} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </Collapse>
          </>
        )}
      </List>
    </Box>
  );

  // Create notification sound
  const playNotificationSound = () => {
    try {
      // Don't attempt to play sound if audio hasn't been initialized (mobile restriction)
      if (!audioInitialized) {
        return;
      }

      // Create a simple notification beep using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Mobile devices require user interaction before playing audio
      // Resume the audio context if it's suspended (common on mobile)
      if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
          playBeep(audioContext);
        }).catch((error) => {
          console.log('Could not resume audio context:', error);
          // Fallback for mobile - try to play a simple beep
          playFallbackSound();
        });
      } else {
        playBeep(audioContext);
      }
    } catch (error) {
      console.log('Could not play notification sound:', error);
      // Fallback for mobile - try to play a simple beep
      playFallbackSound();
    }
  };

  const playBeep = (audioContext: AudioContext) => {
    try {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.log('Could not play beep sound:', error);
      playFallbackSound();
    }
  };

  const playFallbackSound = () => {
    try {
      // For mobile devices, try multiple approaches
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobile) {
        // Try Web Audio API with a simple approach
        try {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = 800;
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
          
          oscillator.start();
          oscillator.stop(audioContext.currentTime + 0.1);
          return;
        } catch (webAudioError) {
          console.log('Web Audio fallback failed:', webAudioError);
        }
      }
      
      // Original fallback method
      const audio = new Audio();
      audio.volume = 0.3;
      audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjuP1vLFdCUGJnTO8deKOQYYbLvt559NEA5TpOLwtWMcBjiPVVAaYlVGaaaaEA5TpOLwtWMcBjidW5VQGmJVRQaYmhAOUKXj8LZkHA==';
      audio.play().catch(() => {
        console.log('Fallback audio also failed - this is expected on some mobile devices');
      });
    } catch (error) {
      console.log('Fallback sound failed:', error);
    }
  };

  // Trigger ping animation and sound for new messages
  const triggerPingNotification = () => {
    setShowPingAnimation(true);
    playNotificationSound();
    setTimeout(() => setShowPingAnimation(false), 1000);
  };

  const loadAvailableUsers = async () => {
    try {
      const users = await getChatUsers();
      setAvailableUsers(users);
    } catch (error) {
      console.error('Failed to load available users:', error);
    }
  };

  const handleStartNewChat = async (userEmail: string) => {
    try {
      const conversation = await createOrGetConversation(userEmail);
      setShowUserSelection(false);
      setSelectedUser('');
      setSelectedConversation(conversation);
      loadMessages(conversation.id);
      loadConversations(); // Refresh conversations list
    } catch (error) {
      console.error('Failed to start new chat:', error);
    }
  };

  const handleShowUserSelection = () => {
    setShowUserSelection(true);
    if (availableUsers.length === 0) {
      loadAvailableUsers();
    }
  };

  const handleBackFromUserSelection = () => {
    setShowUserSelection(false);
    setSelectedUser('');
  };

  const handleMessageContextMenu = (event: React.MouseEvent<HTMLElement>, message: ChatMessage) => {
    event.preventDefault();
    if (isCurrentUser(message.sender_email)) {
      setContextMenuAnchor(event.currentTarget);
      setSelectedMessageForDelete(message);
    }
  };

  const handleContextMenuClose = () => {
    setContextMenuAnchor(null);
    setSelectedMessageForDelete(null);
  };

  const handleDeleteMessage = async () => {
    if (!selectedMessageForDelete) return;

    try {
      await deleteChatMessage(selectedMessageForDelete.id);
      setMessages(prev => prev.filter(msg => msg.id !== selectedMessageForDelete.id));
      loadConversations(); // Refresh conversations list
      handleContextMenuClose();
    } catch (error) {
      console.error('Failed to delete message:', error);
      handleContextMenuClose();
    }
  };

  const handleDeleteConversation = async () => {
    if (!selectedConversationForDelete) return;

    try {
      await deleteChatConversation(selectedConversationForDelete.id);
      setConversations(prev => prev.filter(conv => conv.id !== selectedConversationForDelete.id));
      
      // If the deleted conversation was selected, clear it
      if (selectedConversation?.id === selectedConversationForDelete.id) {
        setSelectedConversation(null);
        setMessages([]);
      }
      
      setDeleteConversationOpen(false);
      setSelectedConversationForDelete(null);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      setDeleteConversationOpen(false);
      setSelectedConversationForDelete(null);
    }
  };

  const handleConversationContextMenu = (event: React.MouseEvent<HTMLElement>, conversation: ChatConversation) => {
    event.preventDefault();
    setSelectedConversationForDelete(conversation);
    setDeleteConversationOpen(true);
  };

  const handleBottomNavChange = (event: React.SyntheticEvent, newValue: number) => {
    setBottomNavValue(newValue);
    
    // Navigate based on bottom nav selection
    switch (newValue) {
      case 0:
        navigate('/');
        break;
      case 1:
        navigate('/quick-check');
        break;
      case 2:
        navigate('/settings');
        break;
      default:
        break;
    }
  };

  // Check if we're in QuickCheck form mode (should hide bottom nav)
  const isInQuickCheckForm = () => {
    const path = window.location.pathname;
    // Only hide bottom nav when actually in a specific inspection form, not on the main quick-check page
    return path.includes('/quick-check/') || path.startsWith('/inspect/');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#024FFF' }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Vehicle Inspection App
          </Typography>
          <IconButton
            onClick={handleMessageMenuOpen}
            className={showPingAnimation ? 'ping-animation' : ''}
            sx={{
              width: 40,
              height: 40,
              backgroundColor: '#024FFF',
              color: 'white',
              mr: 1,
              position: 'relative',
              '&:hover': {
                backgroundColor: '#0240E6',
              }
            }}
          >
            <Badge badgeContent={totalUnreadCount} color="error">
              <MessageIcon />
            </Badge>
          </IconButton>
          <IconButton
            onClick={handleProfileMenuOpen}
            sx={{
              width: 40,
              height: 40,
              backgroundColor: '#024FFF',
              color: 'white',
              mr: 1,
              '&:hover': {
                backgroundColor: '#0240E6',
              }
            }}
          >
            <Avatar
              sx={{
                width: 32,
                height: 32,
                fontSize: '0.875rem',
                fontWeight: 'bold',
                backgroundColor: 'transparent',
                color: 'white'
              }}
            >
              {getUserInitials()}
            </Avatar>
          </IconButton>
          <IconButton
            onClick={handleLogoutClick}
            title="Logout"
            sx={{
              width: 40,
              height: 40,
              backgroundColor: '#d32f2f',
              color: 'white',
              mr: 1,
              '&:hover': {
                backgroundColor: '#b71c1c',
              }
            }}
          >
            <LogoutIcon />
          </IconButton>
          <IconButton
            onClick={handleRefresh}
            sx={{
              width: 40,
              height: 40,
              backgroundColor: '#f5f5f5',
              color: '#666',
              '&:hover': {
                backgroundColor: '#e0e0e0',
              }
            }}
          >
            <RefreshIcon />
          </IconButton>
          <ConnectionStatusIndicator position="relative" compact={true} />
        </Toolbar>
      </AppBar>

      <Menu
        anchorEl={profileMenuAnchor}
        open={Boolean(profileMenuAnchor)}
        onClose={handleProfileMenuClose}
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
            mt: 1,
            minWidth: 150,
          }
        }}
      >
        <MenuItem onClick={handleProfileClick}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          Profile
        </MenuItem>
        <MenuItem onClick={handleSettingsClick}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          Settings
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogoutClick}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Logout
        </MenuItem>
      </Menu>

      {/* Message Overlay Popover */}
      <Popover
        open={Boolean(messageAnchor)}
        anchorEl={messageAnchor}
        onClose={handleMessageMenuClose}
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
            mt: 1,
            width: 400,
            height: 500,
            display: 'flex',
            flexDirection: 'column',
          }
        }}
      >
        {selectedConversation ? (
          /* Message View */
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <Box sx={{ 
              p: 2, 
              borderBottom: 1, 
              borderColor: 'divider', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 2 
            }}>
              <IconButton onClick={handleBackToConversations} size="small">
                <ArrowBackIcon />
              </IconButton>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                {getUserInitials(selectedConversation.other_user_name)}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2">{selectedConversation.other_user_name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {selectedConversation.other_user_email}
                </Typography>
              </Box>
              <IconButton onClick={handleMessageMenuClose} size="small">
                <CloseIcon />
              </IconButton>
            </Box>

            {/* Messages */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
              {loadingMessages ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <CircularProgress size={24} />
                </Box>
              ) : messages.length === 0 ? (
                <Box sx={{ textAlign: 'center', mt: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No messages yet
                  </Typography>
                </Box>
              ) : (
                <List sx={{ py: 0 }}>
                  {messages.map((message, index) => {
                    const isOwn = isCurrentUser(message.sender_email);
                    const showAvatar = index === 0 || messages[index - 1].sender_email !== message.sender_email;
                    
                    return (
                      <ListItem
                        key={message.id}
                        sx={{
                          display: 'flex',
                          flexDirection: isOwn ? 'row-reverse' : 'row',
                          alignItems: 'flex-start',
                          py: 0.5,
                        }}
                      >
                        <Box sx={{ mx: 0.5 }}>
                          {showAvatar ? (
                            <Avatar
                              sx={{
                                width: 24,
                                height: 24,
                                bgcolor: isOwn ? 'primary.main' : 'secondary.main',
                                fontSize: '0.75rem',
                              }}
                            >
                              {getUserInitials(message.sender_name)}
                            </Avatar>
                          ) : (
                            <Box sx={{ width: 24, height: 24 }} />
                          )}
                        </Box>
                        <Box
                          onContextMenu={(e) => handleMessageContextMenu(e, message)}
                          sx={{
                            maxWidth: '70%',
                            bgcolor: isOwn ? '#024FFF' : '#f5f5f5',
                            color: isOwn ? 'white' : 'text.primary',
                            borderRadius: 2,
                            px: 1.5,
                            py: 0.5,
                            borderBottomLeftRadius: isOwn ? 2 : (showAvatar ? 2 : 0.5),
                            borderBottomRightRadius: isOwn ? (showAvatar ? 2 : 0.5) : 2,
                            position: 'relative',
                            '&:hover .delete-btn': {
                              opacity: isOwn ? 1 : 0,
                              visibility: isOwn ? 'visible' : 'hidden'
                            }
                          }}
                        >
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>
                            {message.message}
                          </Typography>
                          <Typography 
                            variant="caption" 
                            sx={{ 
                              display: 'block', 
                              mt: 0.25, 
                              opacity: 0.7,
                              fontSize: '0.65rem'
                            }}
                          >
                            {formatTime(message.created_at)}
                          </Typography>
                          {/* Delete button for own messages */}
                          {isOwn && (
                            <IconButton
                              className="delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMessageForDelete(message);
                                handleDeleteMessage();
                              }}
                              sx={{
                                position: 'absolute',
                                top: -8,
                                right: -8,
                                width: 20,
                                height: 20,
                                bgcolor: 'error.main',
                                color: 'white',
                                opacity: 0,
                                visibility: 'hidden',
                                transition: 'all 0.2s',
                                '&:hover': {
                                  bgcolor: 'error.dark',
                                }
                              }}
                              size="small"
                            >
                              <DeleteIcon sx={{ fontSize: 12 }} />
                            </IconButton>
                          )}
                        </Box>
                      </ListItem>
                    );
                  })}
                </List>
              )}
            </Box>

            {/* Message Input */}
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                <TextField
                  fullWidth
                  multiline
                  maxRows={3}
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={sending}
                  variant="outlined"
                  size="small"
                  sx={{ fontSize: '0.875rem' }}
                />
                <IconButton
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sending}
                  color="primary"
                  size="small"
                >
                  {sending ? <CircularProgress size={20} /> : <SendIcon />}
                </IconButton>
              </Box>
            </Box>
          </Box>
        ) : showUserSelection ? (
          /* User Selection View */
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <Box sx={{ 
              p: 2, 
              borderBottom: 1, 
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 2
            }}>
              <IconButton onClick={handleBackFromUserSelection} size="small">
                <ArrowBackIcon />
              </IconButton>
              <Typography variant="h6" sx={{ flex: 1 }}>New Message</Typography>
              <IconButton onClick={handleMessageMenuClose} size="small">
                <CloseIcon />
              </IconButton>
            </Box>

            {/* User List */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {availableUsers.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <List sx={{ py: 0 }}>
                  {availableUsers.map((user) => (
                    <ListItem key={user.email} disablePadding>
                      <ListItemButton
                        onClick={() => handleStartNewChat(user.email)}
                        sx={{
                          px: 2,
                          py: 1.5,
                          '&:hover': {
                            bgcolor: 'action.hover',
                          },
                        }}
                      >
                        <Avatar sx={{ mr: 2, bgcolor: 'secondary.main', width: 36, height: 36 }}>
                          {getUserInitials(user.name)}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" noWrap>
                            {user.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" noWrap sx={{ fontSize: '0.875rem' }}>
                            {user.role} - {user.email}
                          </Typography>
                        </Box>
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          </Box>
        ) : (
          /* Conversation List */
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <Box sx={{ 
              p: 2, 
              borderBottom: 1, 
              borderColor: 'divider',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <Typography variant="h6">Messages</Typography>
              <Box>
                <IconButton onClick={handleShowUserSelection} size="small" sx={{ mr: 1 }}>
                  <AddIcon />
                </IconButton>
                <IconButton onClick={handleMessageMenuClose} size="small">
                  <CloseIcon />
                </IconButton>
              </Box>
            </Box>

            {/* Conversations */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {loadingConversations ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <CircularProgress size={24} />
                </Box>
              ) : conversations.length === 0 ? (
                <Box sx={{ textAlign: 'center', mt: 4, p: 2 }}>
                  <MessageIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="body2" color="text.secondary">
                    No conversations yet
                  </Typography>
                  <Button 
                    variant="text" 
                    onClick={() => {
                      handleMessageMenuClose();
                      navigate('/chat');
                    }}
                    sx={{ mt: 1 }}
                  >
                    Start a conversation
                  </Button>
                </Box>
              ) : (
                <List sx={{ py: 0 }}>
                  {conversations.map((conversation) => (
                    <ListItem key={conversation.id} disablePadding>
                      <ListItemButton
                        onClick={() => handleConversationSelect(conversation)}
                        onContextMenu={(e) => handleConversationContextMenu(e, conversation)}
                        sx={{
                          px: 2,
                          py: 1.5,
                          '&:hover': {
                            bgcolor: 'action.hover',
                          },
                        }}
                      >
                        <Avatar sx={{ mr: 2, bgcolor: 'secondary.main', width: 36, height: 36 }}>
                          {getUserInitials(conversation.other_user_name)}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="subtitle2" noWrap>
                              {conversation.other_user_name}
                            </Typography>
                            {conversation.unread_count && conversation.unread_count > 0 && (
                              <Badge badgeContent={conversation.unread_count} color="primary" />
                            )}
                          </Box>
                          {conversation.last_message && (
                            <Typography 
                              variant="body2" 
                              color="text.secondary" 
                              noWrap
                              sx={{ fontSize: '0.875rem' }}
                            >
                              {conversation.last_message}
                            </Typography>
                          )}
                          {conversation.last_message_at && (
                            <Typography 
                              variant="caption" 
                              color="text.secondary"
                              sx={{ fontSize: '0.75rem' }}
                            >
                              {formatTime(conversation.last_message_at)}
                            </Typography>
                          )}
                        </Box>
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>

            {/* Footer */}
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
              <Button 
                fullWidth 
                variant="outlined" 
                onClick={() => {
                  handleMessageMenuClose();
                  navigate('/chat');
                }}
                startIcon={<ChatIcon />}
              >
                Open Full Chat
              </Button>
            </Box>
          </Box>
        )}
      </Popover>

      {/* Message Context Menu */}
      <Menu
        anchorEl={contextMenuAnchor}
        open={Boolean(contextMenuAnchor)}
        onClose={handleContextMenuClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem onClick={handleDeleteMessage}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" />
          </ListItemIcon>
          Delete Message
        </MenuItem>
      </Menu>

      {/* Delete Conversation Dialog */}
      <Dialog
        open={deleteConversationOpen}
        onClose={() => setDeleteConversationOpen(false)}
        aria-labelledby="delete-conversation-dialog-title"
        aria-describedby="delete-conversation-dialog-description"
      >
        <DialogTitle id="delete-conversation-dialog-title">
          {"Delete Conversation"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-conversation-dialog-description">
            Are you sure you want to delete this conversation with {selectedConversationForDelete?.other_user_name}? This action cannot be undone and will delete all messages in this conversation.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConversationOpen(false)} color="primary">
            Cancel
          </Button>
          <Button onClick={handleDeleteConversation} color="error" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Drawer
        variant="temporary"
        anchor="left"
        open={drawerOpen}
        onClose={handleDrawerToggle}
        ModalProps={{
          keepMounted: true, // Better open performance on mobile.
        }}
        sx={{
          display: { xs: 'block' },
          '& .MuiDrawer-paper': { 
            boxSizing: 'border-box', 
            width: 250 
          },
        }}
      >
        {drawer}
      </Drawer>

      <Container 
        component="main" 
        sx={{ 
          flexGrow: 1, 
          py: 4, 
          pb: mobileViewEnabled && !isInQuickCheckForm() ? 10 : 4,
          backgroundColor: 'white',
          minHeight: 'calc(100vh - 64px)', // Subtract AppBar height
          margin: 0,
          maxWidth: 'none !important',
          width: '100%'
        }}
      >
        {children}
      </Container>

      {/* Bottom Navigation for Mobile View */}
      {mobileViewEnabled && !isInQuickCheckForm() && (
        <Paper 
          sx={{ 
            position: 'fixed', 
            bottom: 0, 
            left: 0, 
            right: 0, 
            zIndex: 1000,
            borderTop: 1,
            borderColor: 'divider',
            backgroundColor: '#024FFF'
          }} 
          elevation={3}
        >
          <BottomNavigation
            value={bottomNavValue}
            onChange={handleBottomNavChange}
            showLabels
            sx={{ 
              height: 70,
              backgroundColor: '#024FFF',
              '& .MuiBottomNavigationAction-root': {
                minWidth: 'auto',
                fontSize: '0.75rem',
                color: 'rgba(255, 255, 255, 0.7)',
                '&.Mui-selected': {
                  color: 'white',
                },
              },
            }}
          >
            <BottomNavigationAction 
              label="Dashboard" 
              icon={<DashboardIcon />} 
            />
            <BottomNavigationAction 
              label="Quick Check" 
              icon={<AssignmentIcon />} 
            />
            <BottomNavigationAction 
              label="Settings" 
              icon={<SettingsIcon />} 
            />
          </BottomNavigation>
        </Paper>
      )}
    </Box>
  );
};

export default Layout; 