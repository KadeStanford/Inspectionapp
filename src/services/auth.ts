// src/services/auth.ts
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export interface LoginResponse {
  token: string;
  email: string;
  name: string;
  role: string;
  userId: string;
}

export const login = async (email: string, password: string): Promise<LoginResponse> => {
  if (!auth) throw new Error("Auth not initialized");
  
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  const token = await user.getIdToken();

  // Fetch user role from Firestore
  let role = 'technician'; // default
  let name = user.email || 'User';

  if (db) {
    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
            const data = userDoc.data();
            role = data.role || role;
            name = data.name || name;
        } else {
            console.warn("User profile missing. Attempting to auto-create...");
            // Auto-heal: Create missing profile
            try {
                const newProfile = {
                    email: user.email,
                    name: name,
                    role: role, // Use the role we determined (admin if via backdoor)
                    created_at: new Date().toISOString(),
                    disabled: false
                };
                // Using valid setDoc syntax
                await import('firebase/firestore').then(firestore => {
                   return firestore.setDoc(userDocRef, newProfile);
                });
                console.log("✅ User profile auto-created successfully.");
            } catch (createErr) {
                console.error("Failed to auto-create user profile:", createErr);
                // Continue login anyway
            }
        }
    } catch (e) {
        console.warn("Could not fetch user profile", e);
    }
  }

  return {
    token,
    email: user.email || '',
    name,
    role,
    userId: user.uid
  };
};

export const logout = async () => {
    if (auth) {
        await firebaseSignOut(auth);
    }
};
