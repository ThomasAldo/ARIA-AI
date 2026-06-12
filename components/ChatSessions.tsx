import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, MessageSquare, Edit2, Trash2, Check, X } from './Icons';
import { getChatSessions, renameChatSession, deleteChatSession, exportChatSession, ChatSessionInfo } from '../services/api';

interface ChatSessionsProps {
  userId: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onSessionDeleted?: () => void;
}

const ChatSessions: React.FC<ChatSessionsProps> = ({ userId, selectedDate, onSelectDate, onSessionDeleted }) => {
  const [sessions, setSessions] = useState<ChatSessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, [userId]);

  const loadSessions = async () => {
    try {
      setIsLoading(true);
      const data = await getChatSessions(userId);
      setSessions(data);
    } catch (error) {
      console.error('Failed to load chat sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRename = async (sessionId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      setEditingId(null);
      return;
    }

    try {
      await renameChatSession(userId, sessionId, newTitle);
      await loadSessions();
      setEditingId(null);
    } catch (error) {
      console.error('Failed to rename session:', error);
      alert('Failed to rename chat');
    }
  };

  const handleDelete = async (sessionId: string) => {
    try {
      setDeletingId(sessionId);
      await deleteChatSession(userId, sessionId);
      await loadSessions();
      onSessionDeleted?.();
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('Failed to delete chat');
    } finally {
      setDeletingId(null);
    }
  };

  const handleExport = async (sessionId: string, format: 'txt' | 'md' | 'json' = 'txt') => {
    try {
      setExportingId(sessionId);
      await exportChatSession(userId, sessionId, format);
    } catch (error) {
      console.error('Failed to export session:', error);
      alert('Failed to export chat');
    } finally {
      setExportingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === formatDateString(today)) {
      return 'Today';
    } else if (dateStr === formatDateString(yesterday)) {
      return 'Yesterday';
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatDateString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  if (isLoading) {
    return (
      <div className="px-2 py-3 text-xs text-gray-400 dark:text-gray-500">
        Loading chats...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="px-2 py-3 text-xs text-gray-400 dark:text-gray-500">
        No conversations yet
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <MessageSquare size={14} />
          Recent Chats
        </span>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {isExpanded && (
        <div className="space-y-1 mt-1">
          {sessions.slice(0, 10).map((session) => (
            <div
              key={session.id}
              className={`group flex items-center gap-2 px-2 py-2 rounded-lg text-xs transition-colors ${
                selectedDate === session.date
                  ? 'bg-brand-500 dark:bg-accent-600 text-white'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {editingId === session.id ? (
                <div className="flex-1 flex items-center gap-1">
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    placeholder="Chat title..."
                    autoFocus
                    className="flex-1 px-2 py-1 text-xs rounded bg-white dark:bg-near-black text-gray-800 dark:text-white border border-gray-300 dark:border-gray-600"
                  />
                  <button
                    onClick={() => handleRename(session.id, editingTitle)}
                    className="p-1 hover:bg-green-500/20 rounded text-green-600 dark:text-green-400"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="p-1 hover:bg-red-500/20 rounded text-red-600 dark:text-red-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => onSelectDate(session.date)}
                    className="flex-1 text-left"
                  >
                    <div className="font-medium">{session.title || formatDate(session.date)}</div>
                    <div className={`text-[10px] opacity-70 ${selectedDate === session.date ? 'text-white' : 'text-gray-500 dark:text-gray-500'}`}>
                      {session.message_count} message{session.message_count !== 1 ? 's' : ''}
                    </div>
                  </button>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingId(session.id);
                        setEditingTitle(session.title || '');
                      }}
                      className={`p-1 rounded transition-colors ${
                        selectedDate === session.date
                          ? 'hover:bg-white/20 text-white'
                          : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}
                      title="Rename chat"
                    >
                      <Edit2 size={14} />
                    </button>
                    <div className="relative group/export">
                      <button
                        className={`p-1 rounded transition-colors ${
                          selectedDate === session.date
                            ? 'hover:bg-blue-500/30 text-white'
                            : 'hover:bg-blue-100 dark:hover:bg-blue-900/20 text-blue-500 dark:text-blue-400'
                        } disabled:opacity-50`}
                        title="Export chat"
                        disabled={exportingId === session.id}
                      >
                        {exportingId === session.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <MessageSquare size={14} />
                        )}
                      </button>
                      <div className="hidden group-hover/export:block absolute right-0 mt-1 bg-gray-900 dark:bg-gray-800 rounded-lg shadow-lg z-50 py-1 whitespace-nowrap">
                        <button
                          onClick={() => handleExport(session.id, 'txt')}
                          className="block w-full text-left px-3 py-1 text-xs text-white hover:bg-gray-800 dark:hover:bg-gray-700"
                        >
                          Export as TXT
                        </button>
                        <button
                          onClick={() => handleExport(session.id, 'md')}
                          className="block w-full text-left px-3 py-1 text-xs text-white hover:bg-gray-800 dark:hover:bg-gray-700"
                        >
                          Export as MD
                        </button>
                        <button
                          onClick={() => handleExport(session.id, 'json')}
                          className="block w-full text-left px-3 py-1 text-xs text-white hover:bg-gray-800 dark:hover:bg-gray-700"
                        >
                          Export as JSON
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(session.id)}
                      disabled={deletingId === session.id}
                      className={`p-1 rounded transition-colors ${
                        selectedDate === session.date
                          ? 'hover:bg-red-500/30 text-white'
                          : 'hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500 dark:text-red-400'
                      } disabled:opacity-50`}
                      title="Delete chat"
                    >
                      {deletingId === session.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatSessions;
