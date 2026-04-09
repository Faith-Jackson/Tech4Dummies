import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export async function createNotification(
  targetUserId: string,
  type: 'grade' | 'reply' | 'system' | 'mention',
  title: string,
  message: string,
  link?: string
) {
  try {
    // Prevent useless self-notifications (e.g., student replying to their own thread)
    if (auth.currentUser?.uid === targetUserId && type !== 'system') return;

    await addDoc(collection(db, `users/${targetUserId}/notifications`), {
      userId: targetUserId,
      type,
      title,
      message,
      link: link || '',
      read: false,
      createdAt: Date.now()
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}
