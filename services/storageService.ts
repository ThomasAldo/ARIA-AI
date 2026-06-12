import { DaySession, Task, UserProfile, Message } from '../types';


// Helper to get per-user key
const getUserKey = (base: string, userId?: string) => userId ? `${base}_${userId}` : base;

const KEYS = {
  SESSIONS: 'aria_sessions',
  TASKS: 'aria_tasks',
  PROFILE: 'aria_profile',
};

// --- Sessions (Chat History) ---


export const getSession = (date: string, userId?: string): DaySession => {
  const all = JSON.parse(localStorage.getItem(getUserKey(KEYS.SESSIONS, userId)) || '{}');
  return all[date] || { date, messages: [] };
};

export const saveMessage = (date: string, message: Message, userId?: string) => {
  const all = JSON.parse(localStorage.getItem(getUserKey(KEYS.SESSIONS, userId)) || '{}');
  const session = all[date] || { date, messages: [] };
  session.messages.push(message);
  all[date] = session;
  localStorage.setItem(getUserKey(KEYS.SESSIONS, userId), JSON.stringify(all));
};


export const getAllSessions = (userId?: string): Record<string, DaySession> => {
  return JSON.parse(localStorage.getItem(getUserKey(KEYS.SESSIONS, userId)) || '{}');
};

export const getAllConversationDates = (userId?: string): string[] => {
  const all = getAllSessions(userId);
  return Object.keys(all).sort().reverse();
};

export const getAllMessages = (userId?: string): Message[] => {
  const all = getAllSessions(userId);
  const messages: Message[] = [];
  Object.keys(all).forEach(date => {
    messages.push(...all[date].messages);
  });
  return messages.sort((a, b) => a.timestamp - b.timestamp);
};

export const deleteSession = (date: string, userId?: string): void => {
  const all = JSON.parse(localStorage.getItem(getUserKey(KEYS.SESSIONS, userId)) || '{}');
  delete all[date];
  localStorage.setItem(getUserKey(KEYS.SESSIONS, userId), JSON.stringify(all));
};

export const clearAllSessions = (userId?: string): void => {
  localStorage.setItem(getUserKey(KEYS.SESSIONS, userId), JSON.stringify({}));
};

export const getHistoryContext = (excludeDate: string, userId?: string): string => {
  const all = JSON.parse(localStorage.getItem(getUserKey(KEYS.SESSIONS, userId)) || '{}');
  // Get last 3 active days for context
  const sortedDates = Object.keys(all).sort().reverse().filter(d => d !== excludeDate).slice(0, 3);
  
  if (sortedDates.length === 0) return "";

  let context = "Recent conversation history:\n";
  sortedDates.forEach(date => {
    const session = all[date];
    if (session.messages.length > 0) {
      context += `[Date: ${date}]: User said: "${session.messages[0].text.substring(0, 50)}..."\n`;
    }
  });
  return context;
};

// --- Tasks ---

export const getTasks = (): Task[] => {
  return JSON.parse(localStorage.getItem(KEYS.TASKS) || '[]');
};

export const saveTask = (task: Task) => {
  const tasks = getTasks();
  tasks.push(task);
  localStorage.setItem(KEYS.TASKS, JSON.stringify(tasks));
};

export const toggleTask = (id: string) => {
  const tasks = getTasks().map(t => t.id === id ? { ...t, completed: !t.completed } : t);
  localStorage.setItem(KEYS.TASKS, JSON.stringify(tasks));
};

export const deleteTask = (id: string) => {
  const tasks = getTasks().filter(t => t.id !== id);
  localStorage.setItem(KEYS.TASKS, JSON.stringify(tasks));
};

// --- Profile (Long term memory) ---

export const getProfile = (): UserProfile => {
  return JSON.parse(localStorage.getItem(KEYS.PROFILE) || '{"name": "User", "facts": []}');
};

export const addFactToProfile = (fact: string) => {
  const profile = getProfile();
  if (!profile.facts.includes(fact)) {
    profile.facts.push(fact);
    localStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
  }
};