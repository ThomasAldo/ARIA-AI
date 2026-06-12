import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, X as XIcon } from './Icons';
import { getChatSessions, deleteChatSessionByDate, clearAllChatSessions, ChatSessionInfo } from '../services/api';
import { deleteSession, clearAllSessions } from '../services/storageService';

interface ChatManagerProps {
  userId: string;
  onClose: () => void;
  onSessionDeleted?: () => void;
}

const ChatManager: React.FC<ChatManagerProps> = ({ userId, onClose, onSessionDeleted }) => {
  const [sessions, setSessions] = useState<ChatSessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showConfirmAll, setShowConfirmAll] = useState(false);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, [userId]);

  const loadSessions = async () => {
    try {
      setIsLoading(true);
      const data = await getChatSessions(userId);
      setSessions(data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = async (date: string) => {
    if (!window.confirm(`Delete chat from ${date}? This cannot be undone.`)) {
      return;
    }

    try {
      setDeletingDate(date);
      await deleteChatSessionByDate(userId, date);
      deleteSession(date, userId);
      await loadSessions();
      onSessionDeleted?.();
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('Failed to delete chat session');
    } finally {
      setDeletingDate(null);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAllChatSessions(userId);
      clearAllSessions(userId);
      setSessions([]);
      setShowConfirmAll(false);
      onSessionDeleted?.();
      alert('All chat history has been cleared');
    } catch (error) {
      console.error('Failed to clear all sessions:', error);
      alert('Failed to clear chat history');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-near-black rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Manage Chat History</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          >
            <XIcon />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading...</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">No chat history found</div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div 
                  key={session.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-surface rounded-xl border border-gray-200 dark:border-gray-800"
                >
                  <div>
                    <div className="font-medium text-gray-800 dark:text-white">
                      {formatDate(session.date)}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {session.message_count} message{session.message_count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteSession(session.date)}
                    disabled={deletingDate === session.date}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                    title="Delete this chat"
                  >
                    {deletingDate === session.date ? (
                      <div className="animate-spin w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full" />
                    ) : (
                      <Trash2 size={20} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {sessions.length > 0 && (
          <div className="p-6 border-t border-gray-200 dark:border-gray-800">
            {!showConfirmAll ? (
              <button
                onClick={() => setShowConfirmAll(true)}
                className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={20} />
                Clear All Chat History
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                  <AlertTriangle size={20} />
                  <span className="text-sm font-medium">
                    This will permanently delete all {sessions.length} chat session{sessions.length !== 1 ? 's' : ''}!
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowConfirmAll(false)}
                    className="flex-1 py-3 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl transition-colors"
                  >
                    Yes, Delete All
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatManager;
