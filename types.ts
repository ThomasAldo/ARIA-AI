export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface DaySession {
  date: string; // YYYY-MM-DD
  messages: Message[];
  summary?: string; // Auto-generated summary of the day
}

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  dueDate?: string;
  timestamp?: number;
}

export interface UserProfile {
  name: string;
  facts: string[]; // Long-term memory facts
}

export enum ViewMode {
  CHAT = 'CHAT',
  CALENDAR = 'CALENDAR',
  TASKS = 'TASKS',
  SETTINGS = 'SETTINGS'
}