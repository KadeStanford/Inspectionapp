import { db, auth } from './firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, where, getDoc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { login, logout, LoginResponse } from './auth';
import { uploadImage } from './imageUpload';
import { VinDecoderService } from './vinDecoder';

// Re-export auth functions
export { login, logout };
export type { LoginResponse };

// Re-export VIN logic
export const decodeVinCached = VinDecoderService.decodeVin;
export const extractVinFromImage = async (file: File): Promise<string> => {
  // Logic to call OCR API or scan image
  // For now, return mock or implement client-side OCR if package available
  console.warn("OCR not implemented in frontend-only migration yet");
  return ""; 
};

// ... Quick Check code from previous step ...

export interface QuickCheckData {
  inspection_type: string;
  vin: string;
  vehicle_details: string;
  date: string;
  user: string;
  mileage: string;
  windshield_condition: string;
  wiper_blades: string;
  wiper_blades_front?: string;
  wiper_blades_rear?: string;
  washer_squirters: string;
  dash_lights_photos: { url: string }[];
  // ... other fields ...
  [key: string]: any;
}

interface QuickCheckResponse {
  id: string;
  user_email?: string;
  user_name?: string;
  title?: string;
  data: string; // JSON string of the data
  created_at: string;
}

// Simple submit function
export const submitQuickCheck = async (formData: FormData): Promise<QuickCheckResponse> => {
  if (!db) throw new Error("Firebase not initialized");
  
  // Convert FormData to object
  const data: any = {};
  formData.forEach((value, key) => {
    data[key] = value;
  });

  // Create document
  const docRef = await addDoc(collection(db, 'quick_checks'), {
    ...data,
    created_at: new Date().toISOString()
  });

  return { 
    id: docRef.id, 
    ...data,
    data: data.data || JSON.stringify(data)
  };
};

export const getQuickCheckHistory = async (): Promise<any[]> => {
  if (!db) throw new Error("Firebase not initialized");
  const q = query(collection(db, 'quick_checks'), orderBy("created_at", "desc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const deleteQuickCheck = async (id: string | number): Promise<void> => {
  if (!db) throw new Error("Firebase not initialized");
  await deleteDoc(doc(db, 'quick_checks', String(id)));
};

// --- User Management ---
export const getUsers = async () => {
    if (!db) throw new Error("Firebase not initialized");
    const snapshot = await getDocs(collection(db, 'users'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const deleteUser = async (id: string) => {
    // Note: Deleting users in Firebase Auth requires Admin SDK or Cloud Functions.
    // Deleting from Firestore 'users' collection is allowed.
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'users', id));
};

export const enableUser = async (id: string) => {
    if (!db) throw new Error("Firebase not initialized");
    await updateDoc(doc(db, 'users', id), { disabled: false });
};

export const disableUser = async (id: string) => {
    if (!db) throw new Error("Firebase not initialized");
    await updateDoc(doc(db, 'users', id), { disabled: true });
};

export const updateUserRole = async (id: string, role: string) => {
    if (!db) throw new Error("Firebase not initialized");
    await updateDoc(doc(db, 'users', id), { role });
};

// --- Profile ---
export const updateProfile = async (data: any) => {
    if (!db) throw new Error("Firebase not initialized");
    const { userId, ...updates } = data;
    // Assume auth.currentUser.uid is passed or handle it
    if(userId) {
        await updateDoc(doc(db, 'users', userId), updates);
    }
};
export const updatePassword = async (data: any) => {
    // Requires re-authentication on client side
    console.warn("Password update requires re-authentication, implement in Profile.tsx directly using updatePassword from firebase/auth");
};
export const getUserProfile = async (id?: string) => {
    if (!db) throw new Error("Firebase not initialized");
    // If no id provided, try to get from localStorage or current auth user
    const userId = id || localStorage.getItem('userId') || auth?.currentUser?.uid;
    if (!userId) throw new Error("No user ID available");
    const d = await getDoc(doc(db, 'users', userId));
    return d.exists() ? d.data() : null;
};

// --- Misc ---
export const getActiveQuickChecks = async () => getQuickCheckHistory(); // simplified
export const getSubmittedQuickChecks = async () => getQuickCheckHistory(); // simplified
export const getInProgressQuickChecks = async () => []; // drafts should be local or in separate collection
export const archiveQuickCheck = async (id: string) => { /* no-op or status update */ };
export const getUploadUrl = async () => ""; // Not needed for direct firebase upload
export const getTimingSummary = async () => ({}); 
export const formatVehicleDetails = (d: any) => d ? `\${d.year || ''} \${d.make || ''} \${d.model || ''}`.trim() : "";

export const quickCheckApi = {
  submit: submitQuickCheck,
  getHistory: getQuickCheckHistory,
  delete: deleteQuickCheck
};

export default quickCheckApi;

// --- Chat Types ---
export interface ChatUser {
  id: string;
  name: string;
  email: string;
  role?: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  readBy?: string[];
}

export interface ChatConversation {
  id: string;
  participants: string[];
  lastMessage?: ChatMessage;
  unreadCount?: number;
}

// --- Chat ---
export const getChatConversations = async (userId?: string) => {
    if (!db) return [];
    try {
        const uid = userId || auth?.currentUser?.uid;
        if (!uid) return [];

        // Query conversations where user is participant
        const q = query(collection(db, 'conversations'), where('participants', 'array-contains', uid));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error: any) {
        console.warn("Chat access denied or failed:", error.code);
        return [];
    }
};

export const getChatMessages = async (conversationId: string) => {
    if (!db) return [];
    if (!conversationId) return [];
    try {
        const q = query(collection(db, `conversations/\${conversationId}/messages`), orderBy('timestamp', 'asc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error: any) {
        console.warn("Chat messages access denied:", error.code);
        return [];
    }
};

export const sendChatMessage = async (conversationId: string, message: any) => {
    if (!db) return;
    await addDoc(collection(db, `conversations/\${conversationId}/messages`), {
        ...message,
        timestamp: new Date().toISOString()
    });
};

export const getChatUsers = async () => {
    return getUsers();
};

export const createOrGetConversation = async (participantIds: string[]) => {
    if (!db) throw new Error("Firebase not initialized");
    const docRef = await addDoc(collection(db, 'conversations'), {
        participants: participantIds,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });
    return { id: docRef.id };
};

export const deleteChatConversation = async (conversationId: string) => {
     if (!db) return;
     await deleteDoc(doc(db, 'conversations', conversationId));
};

export const deleteChatMessage = async (conversationId: string, messageId: string) => {
    if (!db) return;
    await deleteDoc(doc(db, `conversations/\${conversationId}/messages`, messageId));
};

// --- Drafts ---
export const createDraftQuickCheck = async (title: string, data: any) => {
    if (!db) throw new Error("Firebase not initialized");
    const docRef = await addDoc(collection(db, 'quick_check_drafts'), {
        title,
        ...data,
        is_draft: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });
    return { id: docRef.id };
};

export const updateDraftQuickCheck = async (id: string | number, title: string, data: any) => {
    if (!db) throw new Error("Firebase not initialized");
    await updateDoc(doc(db, 'quick_check_drafts', String(id)), {
        title,
        ...data,
        updated_at: new Date().toISOString()
    });
};

export const getDraftQuickChecks = async (userId?: string) => {
    if (!db) return [];
    let q = query(collection(db, 'quick_check_drafts'), orderBy('updated_at', 'desc'));
    if (userId) {
       q = query(collection(db, 'quick_check_drafts'), where('user', '==', userId), orderBy('updated_at', 'desc'));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// --- Analytics / Tracking ---
export const trackTabEntry = async (tabName: string) => { };
export const trackTabExit = async (tabName: string, duration: number) => { };

// --- Photo Management ---
export const deleteQuickCheckPhoto = async (photoUrl: string) => {
    // TODO: Implement storage deletion
};
export const getQuickChecks = getQuickCheckHistory;
export const updateQuickCheckStatus = async (id: string, status: string) => {
    if (!db) throw new Error("Firebase not initialized");
    await updateDoc(doc(db, 'quick_checks', id), { status });
};

// --- User PIN Lookup ---
export const lookupUserByPin = async (pin: string) => {
    if (!db) return null;
    const q = query(collection(db, 'users'), where('pin', '==', pin));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const userDoc = snapshot.docs[0];
    return { id: userDoc.id, ...userDoc.data() };
};

// --- Delete All Drafts ---
export const deleteAllDrafts = async (userId?: string) => {
    if (!db) return;
    const drafts = await getDraftQuickChecks(userId);
    for (const draft of drafts) {
        await deleteDoc(doc(db, 'quick_check_drafts', draft.id));
    }
};

// --- Register ---
export const register = async (email: string, pass: string, name: string, pin: string) => {
    if (!auth) throw new Error("Auth not initialized");
    if (!db) throw new Error("Firestore not initialized");

    // 1. Create Auth User
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    const user = userCredential.user;

    // 2. Create User Document with Role
    // Using setDoc to specify the ID (uid) matching the AuthUser
    await setDoc(doc(db, 'users', user.uid), {
        name,
        email,
        pin,
        role: 'admin', // Force admin role as requested
        created_at: new Date().toISOString(),
        disabled: false
    });
    
    return user;
};
