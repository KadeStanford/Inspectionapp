import { db } from './firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc, query, orderBy } from 'firebase/firestore';
import { 
  BankDeposit, 
  DrawerCount, 
  DrawerSettings, 
  CashAnalytics, 
  CashManagementFilters 
} from '../types/cashManagement';

// Bank Deposit API
export const submitBankDeposit = async (deposit: Omit<BankDeposit, 'id' | 'timestamp' | 'userId' | 'userName'>): Promise<BankDeposit> => {
  if (!db) throw new Error("Firebase not initialized");
  
  const newDeposit = {
    ...deposit,
    timestamp: new Date().toISOString(), 
    userId: 'current-user-id', // Replace with auth.currentUser?.uid
    userName: 'Current User', // Replace with auth.currentUser?.displayName
  };

  const docRef = await addDoc(collection(db, 'bank_deposits'), newDeposit);
  return { id: docRef.id, ...newDeposit };
};

export const getBankDeposits = async (filters?: CashManagementFilters): Promise<BankDeposit[]> => {
  if (!db) throw new Error("Firebase not initialized");
  
  const q = query(collection(db, 'bank_deposits'), orderBy('timestamp', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as BankDeposit[];
};
import { uploadImageToServer, getDisplayUrl } from './imageUpload';

export const uploadDepositImages = async (files: File[]): Promise<string[]> => {
  const uploadPromises = files.map(file => uploadImageToServer(file, 'deposits'));
  const results = await Promise.all(uploadPromises);
  return results.filter(r => r.success).map(r => getDisplayUrl(r));
};
export const deleteBankDeposit = async (id: string) => {
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'bank_deposits', id));
};

// Helper functions
export const calculateTotalCash = (counts: any[]): number => {
    return counts.reduce((acc, curr) => acc + (Number(curr.value || 0) * Number(curr.count || 0)), 0);
};

export const calculateCashOut = (start: number, end: number): number => end - start;

// Drawer Counts API
export const submitDrawerCount = async (count: any): Promise<DrawerCount> => {
   if (!db) throw new Error("Firebase not initialized");
   const newCount = {
       ...count,
       timestamp: new Date().toISOString(),
       userId: 'current-user-id',
       userName: 'Current User'
   };
   const docRef = await addDoc(collection(db, 'drawer_counts'), newCount);
   return { id: docRef.id, ...newCount } as DrawerCount;
};

export const getDrawerCounts = async (filters?: any): Promise<DrawerCount[]> => {
    if (!db) throw new Error("Firebase not initialized");
    const q = query(collection(db, 'drawer_counts'), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DrawerCount[];
};

export const updateDrawerCount = async (id: string, updates: any) => {
    if (!db) throw new Error("Firebase not initialized");
    await updateDoc(doc(db, 'drawer_counts', id), updates);
};

export const deleteDrawerCount = async (id: string) => {
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'drawer_counts', id));
};

// Drawer Settings API
export const getDrawerSettings = async (): Promise<DrawerSettings[]> => {
    if (!db) throw new Error("Firebase not initialized");
    const snapshot = await getDocs(collection(db, 'drawer_settings'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DrawerSettings[];
};

export const createDrawerSettings = async (settings: any): Promise<DrawerSettings> => {
    if (!db) throw new Error("Firebase not initialized");
    const docRef = await addDoc(collection(db, 'drawer_settings'), settings);
    return { id: docRef.id, ...settings } as DrawerSettings;
};

export const updateDrawerSettings = async (id: string, updates: any) => {
    if (!db) throw new Error("Firebase not initialized");
    await updateDoc(doc(db, 'drawer_settings', id), updates);
};

export const deleteDrawerSettings = async (id: string) => {
    if (!db) throw new Error("Firebase not initialized");
    await deleteDoc(doc(db, 'drawer_settings', id));
};

export const getCashAnalytics = async (filters: any): Promise<CashAnalytics> => {
    return {
        totalDeposits: 0,
        totalDrawerCounts: 0,
        totalVariance: 0,
        averageDeposit: 0
    } as unknown as CashAnalytics; 
};
