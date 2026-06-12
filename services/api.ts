/**
 * API Service Layer
 * All requests go to Flask backend
 */

import { Message, Task, UserProfile } from '../types';
import { getUser, getToken } from './authService';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Helper to get auth headers
const getHeaders = () => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
};

// ============ Auth ============

export interface LoginResponse {
  user_id: string;
  email: string;
  name: string;
}

// ============ State Management ============

export interface AppState {
  messages: Message[];
  tasks: Task[];
  facts: string[];
  user: { name: string; email: string };
}

export const getState = async (userId: string, date: string): Promise<AppState> => {
  const response = await fetch(
    `${API_BASE_URL}/api/state?user_id=${userId}&date=${date}`,
    { 
      method: 'GET',
      headers: getHeaders()
    }
  );

  if (!response.ok) throw new Error('Failed to load state');
  return response.json();
};

// ============ Chat/Messages ============

export interface ChatResponse {
  type: 'text' | 'tool_call' | 'tool_result' | 'done';
  text?: string;
  tool_call?: string;
  tool?: string;
  result?: string;
  args?: Record<string, any>;
}

export const chatStream = async function* (
  message: string,
  date: string,
  userId?: string
): AsyncGenerator<ChatResponse> {
  // Get userId from auth service if not provided
  const user = getUser();
  const finalUserId = userId || user?.id || 'default-user';

  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      user_id: finalUserId,
      message,
      date
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Chat failed');
  }

  // Handle Server-Sent Events
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            yield data;
          } catch (e) {
            console.error('Failed to parse SSE chunk:', e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};

// ============ Tasks ============

export const getTasks = async (userId: string): Promise<Task[]> => {
  const response = await fetch(`${API_BASE_URL}/api/tasks?user_id=${userId}`, {
    method: 'GET',
    headers: getHeaders()
  });

  if (!response.ok) throw new Error('Failed to load tasks');
  return response.json();
};

export const saveTask = async (userId: string, task: Task): Promise<Task> => {
  const response = await fetch(`${API_BASE_URL}/api/tasks`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      user_id: userId,
      text: task.text,
      dueDate: task.dueDate
    })
  });

  if (!response.ok) throw new Error('Failed to save task');
  return response.json();
};

export const toggleTask = async (userId: string, taskId: string): Promise<Task> => {
  const tasks = await getTasks(userId);
  const task = tasks.find(t => t.id === taskId);

  if (!task) throw new Error('Task not found');

  const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({
      user_id: userId,
      completed: !task.completed
    })
  });

  if (!response.ok) throw new Error('Failed to update task');
  return response.json();
};

export const deleteTask = async (userId: string, taskId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({
      user_id: userId,
      action: 'delete'
    })
  });

  if (!response.ok) throw new Error('Failed to delete task');
};

// ============ Facts/Profile ============

export const getFacts = async (userId: string): Promise<string[]> => {
  const response = await fetch(`${API_BASE_URL}/api/facts?user_id=${userId}`, {
    method: 'GET',
    headers: getHeaders()
  });

  if (!response.ok) throw new Error('Failed to load facts');
  return response.json();
};

export const addFactToProfile = async (userId: string, fact: string): Promise<{ id: string; content: string }> => {
  const response = await fetch(`${API_BASE_URL}/api/facts`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      user_id: userId,
      content: fact
    })
  });

  if (!response.ok) throw new Error('Failed to save fact');
  return response.json();
};

// ============ Profile ============

export const getProfile = async (userId: string): Promise<UserProfile> => {
  const facts = await getFacts(userId);
  return {
    name: 'User',
    facts
  };
};

// ============ Chat Sessions ============

export interface ChatSessionInfo {
  id: string;
  date: string;
  title?: string;
  message_count: number;
  updated_at: string | null;
}

export const getChatSessions = async (userId: string): Promise<ChatSessionInfo[]> => {
  const response = await fetch(`${API_BASE_URL}/api/chat_sessions?user_id=${userId}`, {
    method: 'GET',
    headers: getHeaders()
  });

  if (!response.ok) throw new Error('Failed to load chat sessions');
  return response.json();
};

export const renameChatSession = async (userId: string, sessionId: string, title: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/chat_sessions/${sessionId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ user_id: userId, title })
  });

  if (!response.ok) throw new Error('Failed to rename chat session');
};

export const deleteChatSession = async (userId: string, sessionId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/chat_sessions/${sessionId}`, {
    method: 'DELETE',
    headers: getHeaders(),
    body: JSON.stringify({ user_id: userId })
  });

  if (!response.ok) throw new Error('Failed to delete chat session');
};

export const deleteChatSessionByDate = async (userId: string, date: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/chat_sessions/by_date`, {
    method: 'DELETE',
    headers: getHeaders(),
    body: JSON.stringify({ user_id: userId, date })
  });

  if (!response.ok) throw new Error('Failed to delete chat session');
};

export const clearAllChatSessions = async (userId: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/api/chat_sessions/clear_all`, {
    method: 'DELETE',
    headers: getHeaders(),
    body: JSON.stringify({ user_id: userId, confirm: true })
  });

  if (!response.ok) throw new Error('Failed to clear all chat sessions');
};
export const saveSessionSummary = async (userId: string, sessionId: string): Promise<{ session_id: string; summary: string; date: string }> => {
  const response = await fetch(`${API_BASE_URL}/api/chat_sessions/${sessionId}/summary`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ user_id: userId })
  });

  if (!response.ok) throw new Error('Failed to save session summary');
  return response.json();
};

export interface SearchResult {
  sessionId: string;
  date: string;
  title: string;
  snippet: string;
  role: string;
  timestamp: number;
}

export const searchChat = async (
  userId: string,
  query: string,
  filters?: {
    date?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<SearchResult[]> => {
  const params = new URLSearchParams({
    user_id: userId,
    q: query,
  });

  if (filters?.date) params.append('date', filters.date);
  if (filters?.startDate) params.append('start_date', filters.startDate);
  if (filters?.endDate) params.append('end_date', filters.endDate);

  const response = await fetch(`${API_BASE_URL}/api/chat/search?${params}`, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    try {
      const err = await response.json();
      throw new Error(err?.error || 'Failed to search chat');
    } catch (e) {
      throw new Error('Failed to search chat');
    }
  }
  const data = await response.json();
  return data.results || [];
};

export const exportChatSession = async (
  userId: string,
  sessionId: string,
  format: 'txt' | 'md' | 'json' = 'txt'
): Promise<any> => {
  const response = await fetch(
    `${API_BASE_URL}/api/chat_sessions/${sessionId}/export?user_id=${userId}&format=${format}`,
    {
      method: 'GET',
      headers: getHeaders(),
    }
  );

  if (!response.ok) throw new Error('Failed to export chat session');
  
  if (format === 'json') {
    return response.json();
  } else {
    // For txt and md, trigger a file download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || `chat-export.${format}`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
};

