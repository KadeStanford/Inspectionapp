import { db } from './firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, getDoc } from 'firebase/firestore';

interface QuickCheckResponse {
  id: number;
  user_email: string;
  user_name: string;
  title: string;
  data: string;
  created_at: string;
}

interface ApiResponse<T> {
  data: T;
}

// Simple submit function
export const submitQuickCheck = async (formData: FormData): Promise<QuickCheckResponse> => {
  if (!db) throw new Error("Firebase not initialized");
  
  const data: any = {};
  formData.forEach((value, key) => {
    data[key] = value;
  });

  const docRef = await addDoc(collection(db, 'quick_checks'), {
    ...data,
    created_at: new Date().toISOString()
  });

  return {
    id: docRef.id as any, // Cast for compatibility if types expect number
    user_email: data.user_email,
    user_name: data.user_name,
    title: data.title,
    data: data.data || JSON.stringify(data),
    created_at: new Date().toISOString()
  };
};

// Simple get history function
export const getQuickCheckHistory = async (): Promise<any[]> => {
  if (!db) throw new Error("Firebase not initialized");
  const q = query(collection(db, 'quick_checks'), orderBy("created_at", "desc"));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Delete a quick check by ID
export const deleteQuickCheck = async (id: number | string): Promise<void> => {
  if (!db) throw new Error("Firebase not initialized");
  await deleteDoc(doc(db, 'quick_checks', String(id)));
};

// Export a simple API object
export const quickCheckApi = {
  submit: submitQuickCheck,
  getHistory: getQuickCheckHistory,
  delete: deleteQuickCheck
};

export default quickCheckApi;
