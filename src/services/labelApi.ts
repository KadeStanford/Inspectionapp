import { LabelTemplate, CreateLabelRequest, UpdateLabelRequest } from '../types/labelTemplates';
import { db } from './firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, getDoc, query, where } from 'firebase/firestore';

export class LabelApiService {
  // Get all templates
  static async getAllTemplates(archived?: boolean): Promise<LabelTemplate[]> {
    if (!db) throw new Error("Firebase not initialized");
    
    let q;
    if (archived !== undefined) {
      q = query(collection(db, 'label_templates'), where('archived', '==', archived));
    } else {
      q = query(collection(db, 'label_templates'));
    }
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as LabelTemplate[];
  }

  // Get active templates
  static async getActiveTemplates(): Promise<LabelTemplate[]> {
    return this.getAllTemplates(false);
  }

  // Get archived templates
  static async getArchivedTemplates(): Promise<LabelTemplate[]> {
    return this.getAllTemplates(true);
  }

  // Get template by ID
  static async getTemplate(id: string): Promise<LabelTemplate> {
    if (!db) throw new Error("Firebase not initialized");
    const docRef = doc(db, 'label_templates', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as LabelTemplate;
    } else {
      throw new Error("Label template not found");
    }
  }
}
