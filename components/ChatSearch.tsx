import React, { useState, useRef } from 'react';
import { SearchResult, searchChat } from '../services/api';
import { Search, Calendar, X, MessageSquare } from 'lucide-react';

interface ChatSearchProps {
  userId: string;
  onSelectSession: (sessionId: string, date: string) => void;
  onClose: () => void;
}

export const ChatSearch: React.FC<ChatSearchProps> = ({ userId, onSelectSession, onClose }) => {
  const [query, setQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setError('Please enter a search query');
      return;
    }

    setLoading(true);
    setError('');
    setSearched(true);

    try {
      const filters: any = {};
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const searchResults = await searchChat(userId, trimmedQuery, filters);
      setResults(searchResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleResultClick = (result: SearchResult) => {
    onSelectSession(result.sessionId, result.date);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-pitch-black rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-100/70 dark:border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
            <Search className="w-6 h-6" />
            Search Chats
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-600 dark:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="p-6 border-b border-gray-100 dark:border-gray-800 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Search Query
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What are you looking for?"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-near-black text-gray-900 dark:text-gray-100"
              autoFocus
            />
          </div>

          {/* Date Filters */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Start Date
              </label>
              <div className="relative">
                <input
                  ref={startInputRef}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-near-black text-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={() => startInputRef.current?.showPicker?.() || startInputRef.current?.focus()}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  aria-label="Pick start date"
                >
                  <Calendar className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                End Date
              </label>
              <div className="relative">
                <input
                  ref={endInputRef}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-near-black text-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={() => endInputRef.current?.showPicker?.() || endInputRef.current?.focus()}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  aria-label="Pick end date"
                >
                  <Calendar className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-500 dark:disabled:bg-gray-700 transition-colors"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-6">
          {!searched ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              <Search className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Enter a search query to find messages</p>
            </div>
          ) : loading ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              <div className="animate-spin inline-block w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full"></div>
              <p className="mt-2">Searching...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>No results found</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                Found {results.length} result{results.length === 1 ? '' : 's'}
              </p>
              {results.map((result, idx) => (
                <div
                  key={idx}
                  onClick={() => handleResultClick(result)}
                  className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors bg-white dark:bg-near-black"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">{result.title}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{formatDate(result.date)}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded ${
                      result.role === 'user'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                    }`}>
                      {result.role === 'user' ? 'You' : 'Aria'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-200 italic bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    "{result.snippet}"
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
