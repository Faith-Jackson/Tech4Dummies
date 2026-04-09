/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'student' | 'mentor' | 'admin';

export interface MentorAvailability {
  days: string[]; // ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  startTime: string; // '09:00'
  endTime: string; // '17:00'
  timezone: string; // 'UTC'
  status: 'online' | 'offline' | 'away';
}

export interface PublicProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  cohortId: string | null;
  bio?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  skills?: string[];
  location?: string;
  visibility: 'public' | 'private' | 'cohort_only';
  xp: number;
  level: number;
  completedCount: number;
  createdAt: number;
  availability?: MentorAvailability;
}

export interface AppUser {
  uid: string;
  email: string;
  role: UserRole;
  displayName: string;
  photoURL: string;
  cohortId: string | null;
  bio?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  skills?: string[];
  location?: string;
  visibility?: 'public' | 'private' | 'cohort_only';
  completedLessonIds?: string[]; // Track completed lessons
  bookmarkedLessonIds?: string[]; // Track bookmarked lessons
  xp?: number;
  level?: number;
  streak?: number;        // Consecutive days active
  lastActiveAt?: number;  // Timestamp of last activity (used to compute streak)
  createdAt: number;
  availability?: MentorAvailability;
}

export interface Cohort {
  id: string;
  name: string;
  startDate: number;
  endDate: number;
  mentorIds: string[];
  active: boolean;
  studentCount: number;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl?: string; // YouTube URL or ID
  content?: string; // Markdown content
  createdAt: number;
}

export interface Module {
  id: string;
  courseId: string;
  title: string;
  order: number;
}

export interface Lesson {
  id: string;
  courseId: string;
  moduleId: string;
  title: string;
  videoUrl: string; // YouTube ID
  content: string; // Markdown
  order: number;
  assignmentId?: string;
  quizId?: string;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
}

export interface Quiz {
  id: string;
  courseId: string;
  lessonId: string;
  title: string;
  questions: QuizQuestion[];
  createdAt: number;
}

export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  maxPoints: number;
}

export interface Test {
  id: string;
  description: string;
  testCode: string; // JS code that returns true/false
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
}

export interface Assignment {
  id: string;
  courseId?: string;
  title: string;
  description: string;
  dueDate: number;
  createdAt: number;
  attachments?: Attachment[];
  rubric?: RubricCriterion[];
  tests?: Test[];
  overallFeedback?: string; // Feedback for the whole assignment (e.g., from mentor to cohort)
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  studentPhoto: string;
  cohortId: string;
  content: string;
  status: 'pending' | 'reviewed' | 'resubmit';
  grade: number | null;
  feedback: string;
  submittedAt: number;
  rubricGrades?: { [criterionId: string]: number }; // Points per criterion
  isFeatured?: boolean; // Whether to show this in the student's portfolio
}

export interface JournalEntry {
  id: string;
  studentId: string;
  content: string;
  isPrivate: boolean;
  createdAt: number;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: number;
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  criteria: string; // Markdown description of how to earn it
  createdAt: number;
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  earnedAt: number;
}

export interface Certificate {
  id: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  userName: string;
  issuedAt: number;
  certificateUrl: string;
}

export interface ProgressUpdate {
  id: string;
  userId: string;
  lessonId: string;
  lessonTitle: string;
  moduleId: string;
  courseId: string;
  timestamp: number;
}

export interface QuizAttempt {
  id: string;
  userId: string;
  quizId: string;
  score: number;
  passed: boolean;
  timestamp: number;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  type: 'Full-time' | 'Part-time' | 'Internship' | 'Contract';
  description: string;
  requirements: string[];
  salary?: string;
  applyUrl: string;
  postedAt: number;
  category: 'Engineering' | 'Design' | 'Product' | 'Data' | 'Other';
  logoUrl?: string;
}

export interface CareerResource {
  id: string;
  title: string;
  description: string;
  type: 'Article' | 'Video' | 'Tool' | 'Template';
  url: string;
  category: string;
  postedAt: number;
}

export interface PortfolioProject {
  id: string;
  studentId: string;
  title: string;
  description: string;
  imageUrl?: string;
  projectUrl?: string;
  githubUrl?: string;
  createdAt: number;
  tags?: string[];
}

export interface StudentPortfolio {
  userId: string;
  bio: string;
  projects: PortfolioProject[];
  skills: string[];
  featuredSubmissions: string[]; // Submission IDs
  isPublic: boolean;
  updatedAt: number;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  content: string; // Markdown
  excerpt: string;
  category: string; // e.g., 'Career', 'Technology', 'How-to'
  authorId: string;
  authorName: string;
  authorPhoto: string;
  publishedAt: number;
  updatedAt: number;
  isPublished: boolean;
  tags: string[];
  thumbnailUrl?: string;
}

export interface Resource {
  id: string;
  title: string;
  description: string;
  url: string;
  category: string; // e.g., 'Documentation', 'Cheat Sheet', 'Tool'
  tags: string[];
  addedBy: string;
  addedAt: number;
  icon?: string; // Lucide icon name or emoji
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  category: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  thumbnailUrl?: string;
  type: 'Article' | 'Wiki' | 'Guide';
}

export interface Comment {
  id: string;
  targetId: string; // ID of the entity being commented on (e.g., progressUpdateId, submissionId, quizAttemptId)
  targetType: 'progressUpdate' | 'submission' | 'quizAttempt';
  authorId: string;
  authorName: string;
  authorPhoto: string;
  content: string;
  createdAt: number;
}

export interface ForumThread {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  authorId: string;
  authorName: string;
  repliesCount: number;
  tags?: string[];
  category?: string;
  upvotes?: number;
  upvotedBy?: string[];
}

export interface ForumReply {
  id: string;
  threadId: string;
  content: string;
  createdAt: number;
  authorId: string;
  authorName: string;
  upvotes?: number;
  upvotedBy?: string[];
  isAI?: boolean;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'grade' | 'reply' | 'system' | 'mention';
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: number;
}
