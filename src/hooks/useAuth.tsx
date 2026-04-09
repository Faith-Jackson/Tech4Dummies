import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppUser, UserRole, PublicProfile } from '../types';
import { auth, db, googleProvider } from '../firebase';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  switchRoleForDemo: (role: UserRole) => void;
  updateProfile: (updates: Partial<AppUser>) => void;
  toggleBookmark: (lessonId: string) => void;
  completeLesson: (lessonId: string, lessonTitle?: string) => void;
  gainXP: (amount: number, reason: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (firebaseUser) {
        // User is logged in, fetch or create their AppUser document
        const userRef = doc(db, 'users', firebaseUser.uid);
        const publicRef = doc(db, 'users_public', firebaseUser.uid);
        
        unsubscribeSnapshot = onSnapshot(userRef, async (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data() as AppUser;
            setUser(userData);
            setLoading(false);

            // --- Streak tracking ---
            const now = Date.now();
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const todayMs = startOfToday.getTime();
            const yesterdayMs = todayMs - 86400000;

            const lastActive = userData.lastActiveAt || 0;
            const currentStreak = userData.streak || 0;

            let newStreak = currentStreak;
            if (lastActive >= todayMs) {
              // Already logged in today — no change needed
              return;
            } else if (lastActive >= yesterdayMs) {
              // Was active yesterday — extend streak
              newStreak = currentStreak + 1;
            } else {
              // Gap in activity — reset streak
              newStreak = 1;
            }

            try {
              await setDoc(userRef, { streak: newStreak, lastActiveAt: now }, { merge: true });
            } catch (err) {
              // Non-critical — don't block auth flow
              console.warn('Could not update streak:', err);
            }
          } else {
            // Create new user
            const newUser: AppUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              role: 'student',
              displayName: firebaseUser.displayName || 'New User',
              photoURL: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firebaseUser.uid}`,
              cohortId: null,
              completedLessonIds: [],
              bookmarkedLessonIds: [],
              xp: 0,
              level: 1,
              streak: 1,
              lastActiveAt: Date.now(),
              createdAt: Date.now(),
              visibility: 'public'
            };

            const publicProfile: PublicProfile = {
              uid: firebaseUser.uid,
              displayName: newUser.displayName,
              photoURL: newUser.photoURL,
              role: newUser.role,
              cohortId: newUser.cohortId,
              visibility: 'public',
              xp: 0,
              level: 1,
              completedCount: 0,
              createdAt: newUser.createdAt
            };
            
            const batch = writeBatch(db);
            batch.set(userRef, newUser);
            batch.set(publicRef, publicProfile);
            
            try {
              await batch.commit();
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, `users/${firebaseUser.uid}`);
            }
          }
        }, (error: any) => {
          // Only log error if it's not a permission denied error caused by signing out
          if (error.code !== 'permission-denied') {
            handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          }
          setLoading(false);
        });
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
      unsubscribeAuth();
    };
  }, []);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Error signing in:', error);
      if (error.code === 'auth/popup-blocked') {
        alert('Please allow popups for this site to sign in with Google.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup, no action needed
      } else {
        alert(`Sign-in failed: ${error.message}`);
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const switchRoleForDemo = async (role: UserRole) => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      const publicRef = doc(db, 'users_public', user.uid);
      const batch = writeBatch(db);
      batch.set(userRef, { role }, { merge: true });
      batch.set(publicRef, { role }, { merge: true });
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
  };

  const updateProfile = async (updates: Partial<AppUser>) => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      const publicRef = doc(db, 'users_public', user.uid);
      
      const publicFields = [
        'displayName', 'photoURL', 'role', 'cohortId', 'bio', 
        'githubUrl', 'linkedinUrl', 'websiteUrl', 'skills', 
        'location', 'visibility', 'xp', 'level', 'availability'
      ];
      
      const publicUpdates: any = {};
      publicFields.forEach(field => {
        if (field in updates) {
          publicUpdates[field] = (updates as any)[field];
        }
      });

      const batch = writeBatch(db);
      batch.set(userRef, updates, { merge: true });
      if (Object.keys(publicUpdates).length > 0) {
        batch.set(publicRef, publicUpdates, { merge: true });
      }

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    }
  };

  const toggleBookmark = async (lessonId: string) => {
    if (!user) return;
    const currentBookmarks = user.bookmarkedLessonIds || [];
    const isBookmarked = currentBookmarks.includes(lessonId);
    
    const newBookmarks = isBookmarked 
      ? currentBookmarks.filter(id => id !== lessonId)
      : [...currentBookmarks, lessonId];
      
    const userRef = doc(db, 'users', user.uid);
    try {
      await setDoc(userRef, { bookmarkedLessonIds: newBookmarks }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const gainXP = async (amount: number, reason: string) => {
    if (!user) return;
    const newXp = (user.xp || 0) + amount;
    const newLevel = Math.floor(newXp / 1000) + 1;
    
    const userRef = doc(db, 'users', user.uid);
    const publicRef = doc(db, 'users_public', user.uid);
    const historyRef = doc(collection(db, 'xpHistory'));
    
    const batch = writeBatch(db);
    batch.set(userRef, { xp: newXp, level: newLevel }, { merge: true });
    batch.set(publicRef, { xp: newXp, level: newLevel }, { merge: true });
    batch.set(historyRef, {
      id: historyRef.id,
      userId: user.uid,
      amount,
      reason,
      timestamp: Date.now()
    });
    
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const completeLesson = async (lessonId: string, lessonTitle?: string) => {
    if (!user) return;
    const currentCompleted = user.completedLessonIds || [];
    if (currentCompleted.includes(lessonId)) return;

    const newCompleted = [...currentCompleted, lessonId];
    const amount = 100;
    const newXp = (user.xp || 0) + amount;
    const newLevel = Math.floor(newXp / 1000) + 1;
    
    const userRef = doc(db, 'users', user.uid);
    const publicRef = doc(db, 'users_public', user.uid);
    const progressRef = doc(collection(db, 'progressUpdates'));
    const historyRef = doc(collection(db, 'xpHistory'));
    
    const batch = writeBatch(db);
    batch.set(userRef, { 
      completedLessonIds: newCompleted,
      xp: newXp,
      level: newLevel
    }, { merge: true });
    
    batch.set(publicRef, {
      completedCount: newCompleted.length,
      xp: newXp,
      level: newLevel
    }, { merge: true });

    batch.set(progressRef, {
      id: progressRef.id,
      studentId: user.uid,
      lessonId: lessonId,
      lessonTitle: lessonTitle || 'Lesson',
      status: 'completed',
      updatedAt: Date.now()
    });

    batch.set(historyRef, {
      id: historyRef.id,
      userId: user.uid,
      amount,
      reason: `Completed: ${lessonTitle || 'Lesson'}`,
      timestamp: Date.now()
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, switchRoleForDemo, updateProfile, toggleBookmark, completeLesson, gainXP }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
