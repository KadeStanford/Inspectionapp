import { auth, db } from './firebase';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export interface UserProfile {
  name: string;
  role: string;
  email: string;
}

class TokenManager {
  private static instance: TokenManager;
  private user: User | null = null;
  private userProfile: UserProfile | null = null;
  private authReady = false;

  private constructor() {
    // Setup listener
    if (auth) {
        onAuthStateChanged(auth, async (user) => {
            this.user = user;
            if (user) {
                // Fetch profile
                try {
                    const userDoc = await getDoc(doc(db!, 'users', user.uid));
                    if (userDoc.exists()) {
                        this.userProfile = userDoc.data() as UserProfile;
                    }
                } catch (e) {
                    console.error("Error fetching user profile", e);
                }
            } else {
                this.userProfile = null;
            }
            this.authReady = true;
        });
    } else {
        console.warn("Firebase Auth not initialized");
        this.authReady = true; // Avoid blocking if auth missing
    }
  }

  public static getInstance(): TokenManager {
    if (!TokenManager.instance) {
      TokenManager.instance = new TokenManager();
    }
    return TokenManager.instance;
  }

  public getToken(): string | null {
    // For compatibility with code checking for "token" string
    // In Firebase world, we get token async: auth.currentUser.getIdToken()
    // But for sync checks like "isLoggedIn", checking currentUser is enough.
    return this.user ? 'firebase-token-placeholder' : null; 
  }

  public isAuthenticated(): boolean {
    return !!this.user;
  }

  public getUserRole(): string {
    return this.userProfile?.role || 'viewer';
  }

  public getUserName(): string {
    return this.userProfile?.name || this.user?.email || 'User';
  }

  public isTokenExpired(_token?: string): boolean {
    // With Firebase Auth, token expiration is handled automatically
    // If user is null, treat as "expired" (not authenticated)
    return !this.user;
  }

  public async logout(): Promise<void> {
    try {
      await signOut(auth!);
      this.user = null;
      this.userProfile = null;
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  public getCurrentUser(): User | null {
    return this.user;
  }

  public getUser(): UserProfile | null {
    return this.userProfile;
  }

  public isReady(): boolean {
    return this.authReady;
  }
}

export default TokenManager.getInstance();
