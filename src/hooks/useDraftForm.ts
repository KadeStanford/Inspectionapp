import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  createDraftQuickCheck, 
  updateDraftQuickCheck, 
  getDraftQuickChecks, 
  deleteQuickCheck 
} from '../services/api';
import { QuickCheckForm, ImageUpload } from '../types/quickCheck';
import { useNotification } from './useNotification';

interface DraftFormState {
  draftId: string | number | null;
  status: 'idle' | 'loading' | 'creating' | 'updating' | 'error';
  error: string | null;
  lastSave: Date | null;
  isInitialized: boolean;
}

interface DraftFormActions {
  createDraft: (form: QuickCheckForm) => Promise<string | number | null>;
  updateDraft: (form: QuickCheckForm) => Promise<void>;
  deleteDraft: () => Promise<void>;
  submitDraft: (form: QuickCheckForm) => Promise<void>;
  cancelDraft: (action: 'delete' | 'archive') => Promise<void>;
  loadForm: (draftId: string | number) => Promise<QuickCheckForm | null>;
}

interface UseDraftFormProps {
  userId: string;
  userName: string;
  initialForm: QuickCheckForm;
  onFormLoad?: (form: QuickCheckForm) => void;
  autoSaveDelay?: number;
}

interface UseDraftFormReturn extends DraftFormState, DraftFormActions {
  isAutoSaving: boolean;
  sessionLocked: boolean;
  scheduleAutoSave: (form: QuickCheckForm) => void;
  submitForm: (form: QuickCheckForm) => Promise<void>;
}

// SessionStorage utilities
const DRAFT_LOCK_KEY = 'quickcheck_draft_lock';
const DRAFT_SESSION_KEY = 'quickcheck_draft_session';

const generateSessionId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const getSessionLock = (): { userId: string; draftId: string | number; sessionId: string } | null => {
  try {
    const lock = sessionStorage.getItem(DRAFT_LOCK_KEY);
    return lock ? JSON.parse(lock) : null;
  } catch {
    return null;
  }
};

const setSessionLock = (userId: string, draftId: string | number, sessionId: string) => {
  const lockData = { userId, draftId, sessionId, timestamp: Date.now() };
  sessionStorage.setItem(DRAFT_LOCK_KEY, JSON.stringify(lockData));
  sessionStorage.setItem(DRAFT_SESSION_KEY, sessionId);
  console.log('🔐 Session lock set:', lockData);
};

const clearSessionLock = () => {
  sessionStorage.removeItem(DRAFT_LOCK_KEY);
  sessionStorage.removeItem(DRAFT_SESSION_KEY);
  console.log('🧹 Session lock cleared');
};

const getCurrentSessionId = (): string | null => {
  return sessionStorage.getItem(DRAFT_SESSION_KEY);
};

export const useDraftForm = ({
  userId,
  userName,
  initialForm,
  onFormLoad,
  autoSaveDelay = 1000
}: UseDraftFormProps): UseDraftFormReturn => {
  
  const location = useLocation();
  const { showSuccess, showError } = useNotification();
  
  // Core state
  const [state, setState] = useState<DraftFormState>({
    draftId: null,
    status: 'idle',
    error: null,
    lastSave: null,
    isInitialized: false
  });
  
  // Session management
  const sessionIdRef = useRef<string>(getCurrentSessionId() || generateSessionId());
  const initializationLockRef = useRef(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  
  // Check if current session has lock
  const sessionLocked = useCallback(() => {
    const lock = getSessionLock();
    return lock?.userId === userId && lock?.sessionId === sessionIdRef.current;
  }, [userId]);

  // Convert form images to API format (remove blob URLs, keep relative paths)
  const prepareFormForSave = useCallback((form: QuickCheckForm) => {
    const filterImages = (images: ImageUpload[]) => 
      images.filter(img => img.url && !img.url.startsWith('blob:'))
             .map(img => ({ url: img.url! })); // url now contains relative path

    return {
      ...form,
      lastSaved: new Date().toISOString(),
      savedBy: userName,
      // Filter all image fields - relative paths are preserved
      dash_lights_photos: filterImages(form.dash_lights_photos),
      mileage_photos: filterImages(form.mileage_photos),
      windshield_condition_photos: filterImages(form.windshield_condition_photos),
      wiper_blades_photos: filterImages(form.wiper_blades_photos),
      washer_squirters_photos: filterImages(form.washer_squirters_photos),
      vin_photos: filterImages(form.vin_photos),
      state_inspection_status_photos: filterImages(form.state_inspection_status_photos),
      state_inspection_date_code_photos: filterImages(form.state_inspection_date_code_photos),
      battery_date_code_photos: filterImages(form.battery_date_code_photos),
      tire_repair_status_photos: filterImages(form.tire_repair_status_photos),
      tpms_type_photos: filterImages(form.tpms_type_photos),
      front_brake_pads_photos: filterImages(form.front_brake_pads_photos),
      rear_brake_pads_photos: filterImages(form.rear_brake_pads_photos),
      tpms_placard: filterImages(form.tpms_placard),
      washer_fluid_photo: filterImages(form.washer_fluid_photo),
      engine_air_filter_photo: filterImages(form.engine_air_filter_photo),
      battery_photos: filterImages(form.battery_photos),
      tpms_tool_photo: filterImages(form.tpms_tool_photo),
      front_brakes: filterImages(form.front_brakes),
      rear_brakes: filterImages(form.rear_brakes),
      tire_photos: form.tire_photos.map(tp => ({
        type: tp.type,
        photos: filterImages(tp.photos)
      })),
      tire_repair_images: Object.keys(form.tire_repair_images).reduce((acc, position) => {
        const posImages = form.tire_repair_images[position as keyof typeof form.tire_repair_images];
        acc[position] = {
          not_repairable: filterImages(posImages.not_repairable),
          tire_size_brand: filterImages(posImages.tire_size_brand),
          repairable_spot: filterImages(posImages.repairable_spot)
        };
        return acc;
      }, {} as any)
    };
  }, [userName]);

  // Convert API response back to form format
  const convertApiToForm = useCallback((draftData: any): QuickCheckForm => {
    const convertToImageUploads = (items: any[]): ImageUpload[] => {
      if (!Array.isArray(items)) return [];
      return items.map((item, index) => ({
        file: new File([], `image_${index}.jpg`, { type: 'image/jpeg' }),
        progress: 100,
        url: typeof item === 'string' ? item : item.url
      }));
    };

    return {
      ...draftData,
      dash_lights_photos: convertToImageUploads(draftData.dash_lights_photos),
      mileage_photos: convertToImageUploads(draftData.mileage_photos),
      windshield_condition_photos: convertToImageUploads(draftData.windshield_condition_photos),
      wiper_blades_photos: convertToImageUploads(draftData.wiper_blades_photos),
      washer_squirters_photos: convertToImageUploads(draftData.washer_squirters_photos),
      vin_photos: convertToImageUploads(draftData.vin_photos),
      state_inspection_status_photos: convertToImageUploads(draftData.state_inspection_status_photos),
      state_inspection_date_code_photos: convertToImageUploads(draftData.state_inspection_date_code_photos),
      battery_date_code_photos: convertToImageUploads(draftData.battery_date_code_photos),
      tire_repair_status_photos: convertToImageUploads(draftData.tire_repair_status_photos),
      tpms_type_photos: convertToImageUploads(draftData.tpms_type_photos),
      front_brake_pads_photos: convertToImageUploads(draftData.front_brake_pads_photos),
      rear_brake_pads_photos: convertToImageUploads(draftData.rear_brake_pads_photos),
      tpms_placard: convertToImageUploads(draftData.tpms_placard),
      washer_fluid_photo: convertToImageUploads(draftData.washer_fluid_photo),
      engine_air_filter_photo: convertToImageUploads(draftData.engine_air_filter_photo),
      battery_photos: convertToImageUploads(draftData.battery_photos),
      tpms_tool_photo: convertToImageUploads(draftData.tpms_tool_photo),
      front_brakes: convertToImageUploads(draftData.front_brakes),
      rear_brakes: convertToImageUploads(draftData.rear_brakes),
      tire_photos: (draftData.tire_photos || []).map((tp: any) => ({
        type: tp.type,
        photos: convertToImageUploads(tp.photos)
      })),
      tire_repair_images: Object.keys(draftData.tire_repair_images || {}).reduce((acc, position) => {
        const posImages = draftData.tire_repair_images[position];
        acc[position] = {
          not_repairable: convertToImageUploads(posImages?.not_repairable || []),
          tire_size_brand: convertToImageUploads(posImages?.tire_size_brand || []),
          repairable_spot: convertToImageUploads(posImages?.repairable_spot || [])
        };
        return acc;
      }, {} as any)
    };
  }, []);

  // Create new draft
  const createDraft = useCallback(async (form: QuickCheckForm): Promise<string | number | null> => {
    console.log('🔄 createDraft called');
    
    if (!userId) {
      console.log('🚫 No userId provided');
      return null;
    }

    if (state.draftId) {
      console.log('🚫 Draft already exists:', state.draftId);
      return state.draftId;
    }

    if (state.status !== 'idle') {
      console.log('🚫 Invalid status for creation:', state.status);
      return null;
    }

    // Check session lock
    const existingLock = getSessionLock();
    if (existingLock?.userId === userId) {
      console.log('🔐 Session lock exists, using existing draft:', existingLock.draftId);
      setState(prev => ({ ...prev, draftId: existingLock.draftId, status: 'idle' }));
      return existingLock.draftId;
    }

    setState(prev => ({ ...prev, status: 'creating', error: null }));

    try {
      const title = `Draft - ${form.vin || 'New'} - ${form.date}`;
      const formData = prepareFormForSave(form);
      const result = await createDraftQuickCheck(title, formData);
      
      // Set session lock immediately
      setSessionLock(userId, result.id, sessionIdRef.current);
      
      setState(prev => ({
        ...prev,
        draftId: result.id,
        status: 'idle',
        lastSave: new Date(),
        error: null
      }));
      
      console.log('✅ Draft created successfully:', result.id);
      showSuccess('Draft created and auto-save enabled');
      return result.id;
      
    } catch (error) {
      console.error('❌ Error creating draft:', error);
      setState(prev => ({ 
        ...prev, 
        status: 'error', 
        error: 'Failed to create draft' 
      }));
      showError('Failed to create draft');
      return null;
    }
  }, [userId, state.draftId, state.status, prepareFormForSave, showSuccess, showError]);

  // Update existing draft
  const updateDraft = useCallback(async (form: QuickCheckForm): Promise<void> => {
    if (!state.draftId || !userId || state.status === 'updating') {
      return;
    }

    // Verify session lock ownership
    if (!sessionLocked()) {
      console.log('🚫 Cannot update - no session lock');
      return;
    }

    setIsAutoSaving(true);
    setState(prev => ({ ...prev, status: 'updating', error: null }));

    try {
      const title = `Draft - ${form.vin || 'New'} - ${form.date}`;
      const formData = prepareFormForSave(form);
      
      await updateDraftQuickCheck(state.draftId, title, formData);
      
      setState(prev => ({
        ...prev,
        status: 'idle',
        lastSave: new Date(),
        error: null
      }));
      
      console.log('✅ Draft auto-saved successfully');
      
    } catch (error) {
      console.error('❌ Error updating draft:', error);
      setState(prev => ({ 
        ...prev, 
        status: 'error', 
        error: 'Failed to auto-save draft' 
      }));
    } finally {
      setIsAutoSaving(false);
    }
  }, [state.draftId, state.status, userId, sessionLocked, prepareFormForSave]);

  // Load existing draft by ID
  const loadForm = useCallback(async (draftId: number): Promise<QuickCheckForm | null> => {
    setState(prev => ({ ...prev, status: 'loading', error: null }));

    try {
      const drafts = await getDraftQuickChecks();
      const draft = drafts.find((d: any) => d.id === draftId);
      
      if (!draft) {
        setState(prev => ({ ...prev, status: 'error', error: 'Draft not found' }));
        return null;
      }

      // Check if draft.data exists and is valid
      if (!draft.data || draft.data === 'undefined') {
        console.warn('⚠️ Draft has no data, skipping load');
        setState(prev => ({ ...prev, status: 'error', error: 'Draft data is empty' }));
        return null;
      }

      const draftData = JSON.parse(draft.data);
      const formData = convertApiToForm(draftData);
      
      setState(prev => ({
        ...prev,
        draftId,
        status: 'idle',
        lastSave: new Date(draftData.lastSaved || draft.created_at),
        error: null
      }));

      // Set session lock for loaded draft
      setSessionLock(userId, draftId, sessionIdRef.current);
      
      console.log('✅ Draft loaded successfully:', draftId);
      onFormLoad?.(formData);
      return formData;
      
    } catch (error) {
      console.error('❌ Error loading draft:', error);
      setState(prev => ({ 
        ...prev, 
        status: 'error', 
        error: 'Failed to load draft' 
      }));
      return null;
    }
  }, [convertApiToForm, userId, onFormLoad]);

  // Delete draft
  const deleteDraft = useCallback(async (): Promise<void> => {
    if (!state.draftId) return;

    try {
      await deleteQuickCheck(state.draftId);
      clearSessionLock();
      setState({
        draftId: null,
        status: 'idle',
        error: null,
        lastSave: null,
        isInitialized: true
      });
      console.log('✅ Draft deleted successfully');
      showSuccess('Draft deleted');
      
    } catch (error: any) {
      console.error('❌ Error deleting draft:', error);
      
      // Handle 404 errors gracefully - draft might already be consumed/deleted
      if (error?.response?.status === 404) {
        console.log('🔍 Draft already deleted or consumed, clearing local state');
        clearSessionLock();
        setState({
          draftId: null,
          status: 'idle',
          error: null,
          lastSave: null,
          isInitialized: true
        });
        showSuccess('Draft already removed');
      } else {
        setState(prev => ({ ...prev, error: 'Failed to delete draft' }));
        showError('Failed to delete draft');
      }
    }
  }, [state.draftId, showSuccess, showError]);

  // Submit draft (mark as completed)
  const submitDraft = useCallback(async (form: QuickCheckForm): Promise<void> => {
    if (!state.draftId) return;

    try {
      const title = `Quick Check - ${form.vin} - ${form.date}`;
      const formData = {
        ...prepareFormForSave(form),
        submitted_datetime: new Date().toISOString(),
        status: 'submitted'
      };
      
      await updateDraftQuickCheck(state.draftId, title, formData);
      clearSessionLock();
      
      setState({
        draftId: null,
        status: 'idle',
        error: null,
        lastSave: null,
        isInitialized: true
      });
      
      console.log('✅ Draft submitted successfully');
      showSuccess('Quick Check submitted successfully!');
      
    } catch (error) {
      console.error('❌ Error submitting draft:', error);
      setState(prev => ({ ...prev, error: 'Failed to submit draft' }));
      showError('Failed to submit Quick Check');
      throw error;
    }
  }, [state.draftId, prepareFormForSave, showSuccess, showError]);

  // Cancel draft with options
  const cancelDraft = useCallback(async (action: 'delete' | 'archive'): Promise<void> => {
    if (!state.draftId) return;

    if (action === 'delete') {
      await deleteDraft();
    } else {
      // Archive: mark as archived but keep the data
      try {
        const formData = {
          archived_datetime: new Date().toISOString(),
          status: 'archived'
        };
        
        await updateDraftQuickCheck(state.draftId, 'Archived Draft', formData);
        clearSessionLock();
        
        setState({
          draftId: null,
          status: 'idle',
          error: null,
          lastSave: null,
          isInitialized: true
        });
        
        console.log('✅ Draft archived successfully');
        showSuccess('Draft archived');
        
      } catch (error) {
        console.error('❌ Error archiving draft:', error);
        showError('Failed to archive draft');
      }
    }
  }, [state.draftId, deleteDraft, showSuccess, showError]);

  // Initialize draft system
  const initializeDraftSystem = useCallback(async () => {
    if (initializationLockRef.current || state.isInitialized || !userId) {
      return;
    }

    initializationLockRef.current = true;
    console.log('🔄 Initializing draft system for user:', userId);

    try {
      // Check URL parameters first
      const urlParams = new URLSearchParams(location.search);
      const draftIdFromUrl = urlParams.get('draftId');
      const vinFromUrl = urlParams.get('vin');
      
      if (draftIdFromUrl) {
        console.log('📂 Loading draft from URL:', draftIdFromUrl);
        await loadForm(parseInt(draftIdFromUrl));
        return;
      }

      // Check session lock
      const existingLock = getSessionLock();
      if (existingLock?.userId === userId) {
        console.log('🔐 Found session lock, loading draft:', existingLock.draftId);
        await loadForm(existingLock.draftId);
        return;
      }

      // Check API for existing drafts
      const drafts = await getDraftQuickChecks();
      const userDrafts = drafts.filter((draft: any) => {
        try {
          const draftData = JSON.parse(draft.data);
          return !draftData.submitted_datetime && 
                 !draftData.archived_datetime && 
                 draftData.savedBy === userName;
        } catch {
          return false;
        }
      });

      if (userDrafts.length > 0) {
        console.log('📂 Found existing draft via API:', userDrafts[0].id);
        await loadForm(userDrafts[0].id);
        return;
      }

      // Create new draft if needed
      if (vinFromUrl) {
        console.log('📋 Creating new draft with VIN from URL:', vinFromUrl);
        const newForm = { 
          ...initialForm, 
          vin: vinFromUrl,
          mileage: urlParams.get('mileage') ? 
            parseInt(urlParams.get('mileage')!).toLocaleString() : 
            initialForm.mileage
        };
        await createDraft(newForm);
      } else {
        console.log('📝 Creating new draft');
        await createDraft(initialForm);
      }

    } catch (error) {
      console.error('❌ Error initializing draft system:', error);
      setState(prev => ({ ...prev, error: 'Failed to initialize draft system' }));
    } finally {
      setState(prev => ({ ...prev, isInitialized: true }));
      initializationLockRef.current = false;
    }
  }, [userId, userName, location.search, initialForm, loadForm, createDraft, state.isInitialized]);

  // Auto-save with debouncing
  const scheduleAutoSave = useCallback((form: QuickCheckForm) => {
    if (!state.draftId || state.status === 'updating') return;

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Schedule new auto-save
    autoSaveTimeoutRef.current = setTimeout(() => {
      updateDraft(form);
    }, autoSaveDelay);
  }, [state.draftId, state.status, updateDraft, autoSaveDelay]);

  // Initialize on mount and user change
  useEffect(() => {
    if (userId && !state.isInitialized) {
      initializeDraftSystem();
    }
  }, [userId, initializeDraftSystem, state.isInitialized]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Reset when user changes
  useEffect(() => {
    const currentLock = getSessionLock();
    if (currentLock && currentLock.userId !== userId) {
      console.log('👤 User changed, resetting draft system');
      clearSessionLock();
      setState({
        draftId: null,
        status: 'idle',
        error: null,
        lastSave: null,
        isInitialized: false
      });
      initializationLockRef.current = false;
    }
  }, [userId]);

  return {
    // State
    draftId: state.draftId,
    status: state.status,
    error: state.error,
    lastSave: state.lastSave,
    isInitialized: state.isInitialized,
    isAutoSaving,
    sessionLocked: sessionLocked(),
    
    // Actions
    createDraft,
    updateDraft,
    deleteDraft,
    submitDraft,
    submitForm: submitDraft, // Alias for compatibility
    cancelDraft,
    loadForm,
    scheduleAutoSave
  };
}; 