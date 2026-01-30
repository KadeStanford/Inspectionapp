/**
 * Image Upload Service
 * 
 * Handles uploading images to Firebase Storage.
 */
import { storage } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Interface for upload results with preview and verification status
export interface ImageUploadResult {
  success: boolean;
  previewUrl?: string;  // Local preview URL (blob URL)
  serverUrl?: string;   // Firebase Storage URL
  error?: string;
  status: 'uploading' | 'uploaded' | 'verified' | 'unverified' | 'error';
  uploadId?: string;    // Unique ID for tracking
  fileName?: string;    // Original filename
}

// Generate unique upload ID
const generateUploadId = (): string => {
  return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Upload an image to Firebase Storage
 */
export const uploadImage = async (
  file: File, 
  folder: string = 'uploads',
  onProgress?: (progress: number) => void
): Promise<ImageUploadResult> => {
  if (!storage) {
    return {
      success: false,
      status: 'error',
      error: 'Firebase Storage not initialized'
    };
  }

  const uploadId = generateUploadId();
  const fileName = `${uploadId}_${file.name}`;
  const storageRef = ref(storage, `${folder}/${fileName}`);

  try {
    // Basic upload
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);

    return {
      success: true,
      status: 'verified', // Directly verified as we got the URL from Firebase
      serverUrl: downloadURL,
      uploadId,
      fileName
    };
  } catch (error) {
    console.error('Firebase upload error:', error);
    return {
      success: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown upload error'
    };
  }
};

export const getFullImageUrl = (url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('blob:')) return url;
    // For now assuming all URLs are full.
    return url; 
};

export const uploadImageToServer = uploadImage;

export const getDisplayUrl = (result: ImageUploadResult | string): string => {
   if (typeof result === 'string') return result;
   return result.serverUrl || result.previewUrl || '';
};

export const cleanupUploadResult = (result: ImageUploadResult) => {
   if (result.previewUrl && result.previewUrl.startsWith('blob:')) {
       URL.revokeObjectURL(result.previewUrl);
   }
};
