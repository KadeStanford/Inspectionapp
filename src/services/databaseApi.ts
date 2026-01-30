import { db } from './firebase';
import { collection, getDocs, limit, query, where, orderBy } from 'firebase/firestore';

export interface TableData {
  columns: string[];
  rows: any[];
  total: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface TableSchema {
  columns: Array<{
    name: string;
    type: string;
    notNull: boolean;
    primaryKey: boolean;
  }>;
  dateColumns: string[];
  searchableColumns: string[];
}

const KNOWN_COLLECTIONS = ['users', 'quick_checks', 'state_inspections', 'bank_deposits', 'label_templates'];

export const databaseApi = {
  getTables: async () => {
    return KNOWN_COLLECTIONS.map(name => ({ name }));
  },

  getTableSchema: async (tableName: string): Promise<TableSchema> => {
    return {
        columns: [{ name: 'id', type: 'string', notNull: true, primaryKey: true }, { name: 'data', type: 'json', notNull: false, primaryKey: false }],
        dateColumns: ['created_at', 'timestamp'],
        searchableColumns: ['id']
    };
  },

  getTableData: async (tableName: string, params: URLSearchParams): Promise<TableData> => {
     if (!db) throw new Error("Firebase not initialized");
     
     const q = query(collection(db, tableName), limit(50));
     const snapshot = await getDocs(q);
     const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

     const allKeys = new Set<string>(['id']);
     rows.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));

     return {
         columns: Array.from(allKeys),
         rows,
         total: rows.length,
         page: 1,
         totalPages: 1,
         hasNext: false,
         hasPrev: false
     };
  },
  
  getRecord: async () => ({}),
  createRecord: async () => ({}),
  updateRecord: async () => ({}),
  deleteRecord: async () => ({}),
};

export default databaseApi;
