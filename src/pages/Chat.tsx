import React, { useState, useEffect, useRef } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  TextField,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Avatar,
  Divider,
  Chip,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Badge
} from '@mui/material';
import {
  Send as SendIcon,
  Chat as ChatIcon,
  Person as PersonIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { 
  getChatConversations, 
  getChatMessages, 
  sendChatMessage, 
  getChatUsers,
  createOrGetConversation,
  deleteChatMessage,
  deleteChatConversation,
  ChatConversation, 
  ChatMessage,
  ChatUser 
} from '../services/api';

const Chat: React.FC = () => {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<ChatUser[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [deleteConversationOpen, setDeleteConversationOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentUserEmail = localStorage.getItem('userEmail') || '';
  const currentUserName = localStorage.getItem('userName') || '';
  const currentUserRole = localStorage.getItem('userRole') || '';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    loadConversations();
    loadAvailableUsers();
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  const loadConversations = async () => {
    try {
      setError(null);
      console.log('Loading conversations...');
      const conversationsData = await getChatConversations();
      console.log('Conversations loaded:', conversationsData);
      
      if (Array.isArray(conversationsData)) {
        setConversations(conversationsData);
        
        // Auto-select the first conversation if none is selected
        if (!selectedConversation && conversationsData.length > 0) {
          setSelectedConversation(conversationsData[0]);
        }
      } else {
        console.error('API returned non-array data:', conversationsData);
        setConversations([]);
        
        if (conversationsData && typeof conversationsData === 'object' && 'error' in conversationsData) {
          setError(`Server error: ${(conversationsData as any).error}`);
        } else {
          setError('Invalid data received from server. The chat service may not be properly initialized.');
        }
      }
    } catch (err: any) {
      console.error('Conversations loading error:', err);
      setConversations([]);
      
      if (err.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err.response?.status === 500) {
        setError('Server error. The chat database may not be initialized properly.');
      } else {
        setError(err.response?.data?.error || 'Failed to load conversations. Please check if the server is running and chat features are enabled.');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableUsers = async () => {
    try {
      const users = await getChatUsers();
      setAvailableUsers(users);
    } catch (err: any) {
      console.error('Error loading available users:', err);
    }
  };

  const loadMessages = async (conversationId: number) => {
    try {
      setError(null);
      const messagesData = await getChatMessages(conversationId);
      // Filter out any invalid messages
      const validMessages = Array.isArray(messagesData) 
        ? messagesData.filter(msg => msg && msg.sender_email)
        : [];
      setMessages(validMessages);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load messages');
      setMessages([]);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedConversation || !newMessage.trim() || sending) return;

    try {
      setSending(true);
      setError(null);
      
      const sentMessage = await sendChatMessage(selectedConversation.id, newMessage.trim());
      setMessages(prev => [...prev, sentMessage]);
      setNewMessage('');
      
      // Update conversations list to reflect new message
      loadConversations();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleStartNewChat = async () => {
    if (!selectedUser) return;

    try {
      setError(null);
      const conversation = await createOrGetConversation(selectedUser);
      setNewChatOpen(false);
      setSelectedUser('');
      setSuccess('Chat started successfully');
      loadConversations();
      setSelectedConversation(conversation);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to start chat');
    }
  };

  const handleDeleteMessage = async (messageId: number) => {
    try {
      setError(null);
      await deleteChatMessage(messageId);
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      // Refresh conversations to update last message if needed
      loadConversations();
      setSuccess('Message deleted successfully');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete message');
    }
  };

  const handleDeleteConversation = async () => {
    if (!selectedConversation) return;

    try {
      setError(null);
      await deleteChatConversation(selectedConversation.id);
      setConversations(prev => prev.filter(conv => conv.id !== selectedConversation.id));
      setSelectedConversation(null);
      setMessages([]);
      setDeleteConversationOpen(false);
      setSuccess('Conversation deleted successfully');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete conversation');
      setDeleteConversationOpen(false);
    }
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

  const getUserInitials = (name: string) => {
    if (!name) return 'U';
    const names = name.trim().split(' ');
    if (names.length === 1) {
      return names[0].charAt(0).toUpperCase();
    }
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
  };

  const isCurrentUser = (email: string) => email === currentUserEmail;

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <ChatIcon />
        Messages
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 3, height: '70vh' }}>
        {/* Conversations List */}
        <Box sx={{ flex: '0 0 400px' }}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ pb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Conversations</Typography>
                <Box>
                  <IconButton onClick={loadConversations} size="small" color="primary">
                    <RefreshIcon />
                  </IconButton>
                  <IconButton onClick={() => setNewChatOpen(true)} size="small" color="primary">
                    <AddIcon />
                  </IconButton>
                </Box>
              </Box>
            </CardContent>
            <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
              {!Array.isArray(conversations) || conversations.length === 0 ? (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    No conversations yet
                  </Typography>
                  <Button 
                    variant="outlined" 
                    onClick={() => setNewChatOpen(true)}
                    sx={{ mt: 2 }}
                    startIcon={<AddIcon />}
                  >
                    Start a conversation
                  </Button>
                </Box>
              ) : (
                <List sx={{ pt: 0 }}>
                  {conversations.map((conversation) => (
                    <ListItem key={conversation.id} disablePadding>
                      <ListItemButton
                        selected={selectedConversation?.id === conversation.id}
                        onClick={() => setSelectedConversation(conversation)}
                        sx={{
                          borderRadius: 1,
                          mx: 1,
                          mb: 0.5,
                          '&.Mui-selected': {
                            bgcolor: 'primary.light',
                            color: 'primary.contrastText',
                            '&:hover': {
                              bgcolor: 'primary.main',
                            },
                          },
                        }}
                      >
                        <Avatar sx={{ mr: 2, bgcolor: 'secondary.main' }}>
                          {getUserInitials(conversation.other_user_name)}
                        </Avatar>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="subtitle2" component="span">
                                {conversation.other_user_name}
                              </Typography>
                              {conversation.unread_count && conversation.unread_count > 0 && (
                                <Badge badgeContent={conversation.unread_count} color="primary" />
                              )}
                            </Box>
                          }
                          secondary={
                            <span>
                              {conversation.last_message && (
                                <span style={{ 
                                  display: 'block',
                                  overflow: 'hidden', 
                                  textOverflow: 'ellipsis', 
                                  whiteSpace: 'nowrap',
                                  maxWidth: '200px',
                                  fontSize: '0.875rem'
                                }}>
                                  {conversation.last_message}
                                </span>
                              )}
                              <span style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                {conversation.message_count !== undefined && (
                                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                                    {conversation.message_count} messages
                                  </span>
                                )}
                                {conversation.last_message_at && (
                                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                                    {formatTime(conversation.last_message_at)}
                                  </span>
                                )}
                              </span>
                            </span>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>
          </Card>
        </Box>

        {/* Chat Area */}
        <Box sx={{ flex: 1 }}>
          {selectedConversation ? (
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ pb: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ bgcolor: 'secondary.main' }}>
                      {getUserInitials(selectedConversation.other_user_name)}
                    </Avatar>
                    <Box>
                      <Typography variant="h6">{selectedConversation.other_user_name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {selectedConversation.other_user_email}
                      </Typography>
                    </Box>
                  </Box>
                  <IconButton
                    onClick={() => setDeleteConversationOpen(true)}
                    size="small"
                    color="error"
                    title="Delete Conversation"
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              </CardContent>

              {/* Messages Area */}
              <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
                {messages.length === 0 ? (
                  <Box sx={{ textAlign: 'center', mt: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No messages yet. Start the conversation!
                    </Typography>
                  </Box>
                ) : (
                  <List sx={{ py: 0 }}>
                    {messages.filter(msg => msg && msg.sender_email).map((message, index, filteredMessages) => {
                      const isOwn = isCurrentUser(message.sender_email);
                      const showAvatar = index === 0 || filteredMessages[index - 1]?.sender_email !== message.sender_email;
                      
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
                          <Box sx={{ mx: 1 }}>
                            {showAvatar ? (
                              <Avatar
                                sx={{
                                  width: 32,
                                  height: 32,
                                  bgcolor: isOwn ? 'primary.main' : 'secondary.main',
                                  fontSize: '0.875rem',
                                }}
                              >
                                {getUserInitials(message.sender_name)}
                              </Avatar>
                            ) : (
                              <Box sx={{ width: 32, height: 32 }} />
                            )}
                          </Box>
                          <Box
                            sx={{
                              maxWidth: '70%',
                              bgcolor: isOwn ? '#024FFF' : '#f5f5f5',
                              color: isOwn ? 'white' : 'text.primary',
                              borderRadius: 2,
                              px: 2,
                              py: 1,
                              borderBottomLeftRadius: isOwn ? 2 : (showAvatar ? 2 : 0.5),
                              borderBottomRightRadius: isOwn ? (showAvatar ? 2 : 0.5) : 2,
                              position: 'relative',
                              '&:hover .delete-btn': {
                                opacity: isOwn ? 1 : 0,
                                visibility: isOwn ? 'visible' : 'hidden'
                              }
                            }}
                          >
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                              {message.message}
                            </Typography>
                            <Typography 
                              variant="caption" 
                              sx={{ 
                                display: 'block', 
                                mt: 0.5, 
                                opacity: 0.7,
                                fontSize: '0.7rem'
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
                                  handleDeleteMessage(message.id);
                                }}
                                sx={{
                                  position: 'absolute',
                                  top: -8,
                                  right: -8,
                                  width: 24,
                                  height: 24,
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
                                <DeleteIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            )}
                          </Box>
                        </ListItem>
                      );
                    })}
                  </List>
                )}
                <div ref={messagesEndRef} />
              </Box>

              {/* Message Input */}
              <CardContent sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                  <TextField
                    fullWidth
                    multiline
                    maxRows={4}
                    placeholder="Type your message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={sending}
                    variant="outlined"
                    size="small"
                  />
                  <IconButton
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim() || sending}
                    color="primary"
                    sx={{ mb: 0.5 }}
                  >
                    {sending ? <CircularProgress size={24} /> : <SendIcon />}
                  </IconButton>
                </Box>
              </CardContent>
            </Card>
          ) : (
            <Card sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Box sx={{ textAlign: 'center' }}>
                <ChatIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  Select a conversation to start messaging
                </Typography>
                <Button 
                  variant="contained" 
                  onClick={() => setNewChatOpen(true)}
                  startIcon={<AddIcon />}
                >
                  Start New Conversation
                </Button>
              </Box>
            </Card>
          )}
        </Box>
      </Box>

      {/* New Chat Dialog */}
      <Dialog open={newChatOpen} onClose={() => setNewChatOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Start New Conversation</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Select User</InputLabel>
            <Select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              label="Select User"
            >
              {availableUsers.map((user) => (
                <MenuItem key={user.email} value={user.email}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                      {getUserInitials(user.name)}
                    </Avatar>
                    <Box>
                      <Typography variant="body2">{user.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {user.role} - {user.email}
                      </Typography>
                    </Box>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewChatOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleStartNewChat} 
            variant="contained"
            disabled={!selectedUser}
          >
            Start Chat
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Conversation Dialog */}
      <Dialog
        open={deleteConversationOpen}
        onClose={() => setDeleteConversationOpen(false)}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">{"Confirm Conversation Deletion"}</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this conversation? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConversationOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteConversation} autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Chat; 