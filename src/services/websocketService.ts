import { db } from './firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

export interface QuickCheckUpdateData {
  id: string; // Changed to string for Firestore compatibility
  title?: string;
  data?: any;
  user?: string;
  created_at?: string;
}

export interface WebSocketMessage {
  type: string;
  data?: any;
}

export interface ConnectionStatus {
  connected: boolean;
  authenticated: boolean;
  reconnecting: boolean;
}

export type WebSocketEventCallback = (message: WebSocketMessage) => void;
export type ConnectionStatusCallback = (status: ConnectionStatus) => void;

class WebSocketService {
  private statusCallbacks: ConnectionStatusCallback[] = [];
  private dbUnsubscribe: (() => void) | null = null;
  private eventCallbacks: Map<string, WebSocketEventCallback[]> = new Map();

  constructor() {
    this.startFirestoreListener();
  }
  
  private startFirestoreListener() {
    if (!db) {
        // Retry or wait until db is ready (if initialized async)
        return;
    }
    
    // Notify connected
    this.notifyStatusChange({ connected: true, authenticated: true, reconnecting: false });

    // Listen to recent changes
    const q = query(collection(db, 'quick_checks'), orderBy('created_at', 'desc'), limit(10));
    
    this.dbUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const data = { id: change.doc.id, ...change.doc.data() } as QuickCheckUpdateData;
            
            if (change.type === 'added') {
               this.emit('quick_check_update', { type: 'quick_check_update', action: 'created', data });
            }
            if (change.type === 'modified') {
               this.emit('quick_check_update', { type: 'quick_check_update', action: 'updated', data });
            }
            if (change.type === 'removed') {
               this.emit('quick_check_update', { type: 'quick_check_update', action: 'deleted', data: { id: change.doc.id } });
            }
        });
    }, (error) => {
        console.error("WebSocketService/Firestore Listener Error:", error);
        // We can emit an error event if needed, but for now just logging it as error is fine to see it in console
        this.emit('error', error); 
    });
  }

  // Compatible methods with previous interface
  connect(token?: string) { this.startFirestoreListener(); }
  disconnect() { if(this.dbUnsubscribe) this.dbUnsubscribe(); }
  
  // Stub methods for compatibility with WebSocketProvider
  updateBaseUrl() { /* No-op: Firestore handles connection automatically */ }
  checkAndConnect() { this.startFirestoreListener(); }
  
  on(event: string, callback: WebSocketEventCallback) {
     if (!this.eventCallbacks.has(event)) {
         this.eventCallbacks.set(event, []);
     }
     this.eventCallbacks.get(event)?.push(callback);
     return () => this.off(event, callback);
  }
  
  off(event: string, callback: WebSocketEventCallback) {
      const callbacks = this.eventCallbacks.get(event);
      if (callbacks) {
          this.eventCallbacks.set(event, callbacks.filter(c => c !== callback));
      }
  }

  emit(event: string, message: WebSocketMessage) {
      const callbacks = this.eventCallbacks.get(event);
      if (callbacks) {
          callbacks.forEach(cb => cb(message));
      }
  }

  onStatusChange(callback: ConnectionStatusCallback) {
      this.statusCallbacks.push(callback);
      // Immediate callback
      callback({ connected: !!db, authenticated: !!db, reconnecting: false });
      return () => {
          this.statusCallbacks = this.statusCallbacks.filter(c => c !== callback);
      };
  }

  private notifyStatusChange(status: ConnectionStatus) {
      this.statusCallbacks.forEach(cb => cb(status));
  }
}

export default new WebSocketService();
