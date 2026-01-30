import { db } from './firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc, query, orderBy } from 'firebase/firestore';
import { 
  StateInspectionRecord, 
  CreateStateInspectionFormData, 
  StateInspectionFilters 
} from '../types/stateInspection';

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// State Inspection Records API
export const getStateInspectionRecords = async (
  filters?: StateInspectionFilters, 
  pagination?: PaginationParams
): Promise<StateInspectionRecord[] | PaginatedResponse<StateInspectionRecord>> => {
  if (!db) throw new Error("Firebase not initialized");
  
  const q = query(collection(db, 'state_inspections'), orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  
  const records = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StateInspectionRecord[];
  
  return records;
};

export const getStateInspectionRecord = async (id: string): Promise<StateInspectionRecord> => {
  if (!db) throw new Error("Firebase not initialized");
  const docRef = doc(db, 'state_inspections', id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as StateInspectionRecord;
  } else {
     throw new Error("No such document!");
  }
};

export const createStateInspectionRecord = async (data: CreateStateInspectionFormData): Promise<StateInspectionRecord> => {
  if (!db) throw new Error("Firebase not initialized");
  
  // Clean up data for Firestore (remove undefined, File objects handled separately)
  const cleanData = JSON.parse(JSON.stringify(data));
  const docRef = await addDoc(collection(db, 'state_inspections'), {
    ...cleanData,
    createdAt: new Date().toISOString()
  });
  
  return { id: docRef.id, ...cleanData } as StateInspectionRecord;
};

export const updateStateInspectionRecord = async (id: string, data: Partial<CreateStateInspectionFormData>): Promise<StateInspectionRecord> => {
  if (!db) throw new Error("Firebase not initialized");
  
  const docRef = doc(db, 'state_inspections', id);
  const cleanData = JSON.parse(JSON.stringify(data));
  await updateDoc(docRef, cleanData);
  
  return { id, ...cleanData } as StateInspectionRecord;
};

export const deleteStateInspectionRecord = async (id: string): Promise<void> => {
  if (!db) throw new Error("Firebase not initialized");
  await deleteDoc(doc(db, 'state_inspections', id));
};

// Fleet Account functions
export const getFleetAccounts = async (): Promise<any[]> => {
  if (!db) throw new Error("Firebase not initialized");

  const q = query(collection(db, 'fleet_accounts'), orderBy('name', 'asc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const createFleetAccount = async (data: any): Promise<any> => {
  if (!db) throw new Error("Firebase not initialized");
  const cleanData = JSON.parse(JSON.stringify(data));
  const docRef = await addDoc(collection(db, 'fleet_accounts'), {
    ...cleanData,
    createdAt: new Date().toISOString()
  });
  return { id: docRef.id, ...cleanData };
};

export const updateFleetAccount = async (id: string, data: any): Promise<any> => {
  if (!db) throw new Error("Firebase not initialized");
  const docRef = doc(db, 'fleet_accounts', id);
  const cleanData = JSON.parse(JSON.stringify(data));
  await updateDoc(docRef, cleanData);
  return { id, ...cleanData };
};

export const deleteFleetAccount = async (id: string): Promise<void> => {
  if (!db) throw new Error("Firebase not initialized");
  await deleteDoc(doc(db, 'fleet_accounts', id));
};

// State Inspection Stats
export const getStateInspectionStats = async (): Promise<any> => {
  if (!db) throw new Error("Firebase not initialized");
  try {
      // Return empty stats for now - can be computed from records
      return { total: 0, passed: 0, failed: 0 };
  } catch (error) {
      return { total: 0, passed: 0, failed: 0 };
  }
};

// Upload URL helper (not needed with Firebase direct uploads, but for compatibility)
export const getUploadUrl = async (): Promise<string> => {
  return ""; // Not needed for direct Firebase upload
};
