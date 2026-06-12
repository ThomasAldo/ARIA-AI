import React, { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Menu, X, Send, Mic, CheckSquare, MessageSquare, Info, Sun, Moon, Plus, LogOut, Trash2, Settings, MoreVertical } from './components/Icons';
import Calendar from './components/Calendar';
import LoginScreen from './components/LoginScreen';
import TaskInput from './components/TaskInput';
import ChatManager from './components/ChatManager';
import ChatSessions from './components/ChatSessions';
import { ChatSearch } from './components/ChatSearch';
import { chatStream, getTasks as fetchTasks, saveTask as saveTaskAPI, toggleTask as toggleTaskAPI, deleteTask as deleteTaskAPI, getFacts as fetchFacts, addFactToProfile as addFactAPI } from './services/api';
import { saveMessage, getTasks, toggleTask, deleteTask, getProfile, saveTask, getSession } from './services/storageService';
import { logout, getUser } from './services/authService';
import { Message, Task, ViewMode } from './types';

const App: React.FC = () => {
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  // Auth State
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
     return localStorage.getItem('aria_auth') === 'true';
  });

  const [currentUser, setCurrentUser] = useState(() => {
    return getUser();
  });

  // App State
  // Use OS/system time for calendar
  const getOSToday = () => {
    const now = new Date();
    // Ensure local timezone is used
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [currentDate, setCurrentDate] = useState<string>(getOSToday());
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.CHAT);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [facts, setFacts] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [showChatManager, setShowChatManager] = useState(false);
  const [showChatSearch, setShowChatSearch] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // --- Effects ---

  // Handle Theme Change
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  // Load Data
  useEffect(() => {
    if (isLoggedIn) {
      loadData();
    }
  }, [currentDate, isLoggedIn]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, viewMode]);

  // --- Helpers ---

  const loadData = async () => {
    try {
      // Load messages for the selected date from localStorage, per user
      const session = getSession(currentDate, currentUser?.id);
      setMessages(session.messages || []);
      
      // Load tasks and facts from API
      if (currentUser?.id) {
        const fetchedTasks = await fetchTasks(currentUser.id);
        setTasks(fetchedTasks);
        
        const fetchedFacts = await fetchFacts(currentUser.id);
        setFacts(fetchedFacts);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const handleLogin = () => {
    localStorage.setItem('aria_auth', 'true');
    setCurrentUser(getUser());
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    logout();
    setIsLoggedIn(false);
    setCurrentUser(null);
    setMessages([]);
    setTasks([]);
    setFacts([]);
  };

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  // --- Handlers ---

  const handleSend = async () => {
    if (!inputText.trim() || isLoading || !currentUser) return;

    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      text: inputText,
      timestamp: Date.now()
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    saveMessage(currentDate, userMsg, currentUser?.id);
    setInputText('');
    setIsLoading(true);

    try {
      const aiMsgId = uuidv4();
      setMessages(prev => [...prev, { id: aiMsgId, role: 'model', text: '', timestamp: Date.now() }]);

      let aiText = '';

      // Pass context to chatStream
      const response = await chatStream(inputText, currentDate, currentUser.id);

      for await (const event of response) {
        if (event.type === 'text') {
          aiText += event.text;
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: aiText } : m));
        } else if (event.type === 'tool_call') {
          // Tool was executed - reload tasks and facts when auto_save is triggered
          if (event.tool === 'auto_save') {
            const fetchedTasks = await fetchTasks(currentUser.id);
            setTasks(fetchedTasks);
            
            const fetchedFacts = await fetchFacts(currentUser.id);
            setFacts(fetchedFacts);
          }
        }
      }

      if (aiText) {
        saveMessage(currentDate, { id: aiMsgId, role: 'model', text: aiText, timestamp: Date.now() }, currentUser?.id);
      }

    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { 
        id: uuidv4(), 
        role: 'model', 
        text: "Connection error. Please try again.", 
        timestamp: Date.now() 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input not supported.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputText(prev => prev + (prev ? ' ' : '') + transcript);
    };
    recognition.start();
  };

  const handleAddTask = useCallback(async (taskText: string) => {
    if (!taskText.trim() || !currentUser) return;
    const newTask: Task = {
        id: uuidv4(),
        text: taskText,
        completed: false,
        timestamp: Date.now()
    };
    try {
      await saveTaskAPI(currentUser.id, newTask);
      const fetchedTasks = await fetchTasks(currentUser.id);
      setTasks(fetchedTasks);
    } catch (error) {
      console.error('Failed to add task:', error);
    }
  }, [currentUser]);

  // --- Views ---

  if (!isLoggedIn) {
    return <LoginScreen onLogin={handleLogin} isDarkMode={isDarkMode} toggleTheme={toggleTheme} />;
  }

  const getTaskStatus = (dueDate: string | undefined) => {
    if (!dueDate) return { label: '', indicator: '', bgColor: '' };
    
    const today = getOSToday();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    if (dueDate < today) {
      return { label: 'Overdue', indicator: '🔴', bgColor: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' };
    } else if (dueDate === today) {
      return { label: 'Due Today', indicator: '🟠', bgColor: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800' };
    } else if (dueDate === tomorrowStr) {
      return { label: 'Due Tomorrow', indicator: '🟡', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' };
    } else {
      return { label: 'Upcoming', indicator: '🟢', bgColor: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' };
    }
  };

  const TaskView = () => (
    <div className="p-6 max-w-2xl mx-auto w-full h-full overflow-y-auto">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6 flex items-center gap-2">
        <CheckSquare className="text-brand-500 dark:text-accent-500" /> My Tasks
      </h2>
      
      <TaskInput onAddTask={handleAddTask} disabled={!currentUser} />

      {tasks.length === 0 ? (
        <p className="text-gray-400 dark:text-gray-600 text-center mt-10">No tasks yet. Ask Aria to remind you of something!</p>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => {
            const status = getTaskStatus(task.dueDate);
            return (
              <div 
                key={task.id} 
                className={`flex items-center gap-3 p-4 rounded-xl shadow-sm border transition-colors group ${
                  status.bgColor || 'bg-white dark:bg-near-black border-gray-100 dark:border-gray-800'
                }`}
              >
                <button 
                  onClick={async () => { 
                    if (currentUser) {
                      await toggleTaskAPI(currentUser.id, task.id);
                      const fetchedTasks = await fetchTasks(currentUser.id);
                      setTasks(fetchedTasks);
                    }
                  }}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0
                    ${task.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 dark:border-gray-600 hover:border-brand-500 dark:hover:border-accent-500'}
                  `}
                >
                  {task.completed && <div className="w-2 h-2 bg-white rounded-full" />}
                </button>
                <div className="flex-1">
                  <span className={`block ${task.completed ? 'text-gray-400 dark:text-gray-600 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                    {task.text}
                  </span>
                  {task.dueDate && (
                    <div className="flex items-center gap-2 text-xs mt-1">
                      <span className="text-gray-500 dark:text-gray-400">📅 {task.dueDate}</span>
                      {status.label && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          status.label === 'Overdue' ? 'bg-red-200 dark:bg-red-900 text-red-800 dark:text-red-200' :
                          status.label === 'Due Today' ? 'bg-orange-200 dark:bg-orange-900 text-orange-800 dark:text-orange-200' :
                          status.label === 'Due Tomorrow' ? 'bg-yellow-200 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200' :
                          'bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200'
                        }`}>
                          {status.indicator} {status.label}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button 
                  onClick={async () => { 
                    if (currentUser) {
                      await deleteTaskAPI(currentUser.id, task.id);
                      const fetchedTasks = await fetchTasks(currentUser.id);
                      setTasks(fetchedTasks);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity flex-shrink-0"
                >
                  <X size={18} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const SettingsView = () => (
    <div className="p-6 max-w-2xl mx-auto w-full h-full overflow-y-auto">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6 flex items-center gap-2">
        <Settings className="text-brand-500 dark:text-accent-500" /> Settings
      </h2>

      {/* Account Section */}
      <div className="bg-white dark:bg-near-black rounded-xl p-6 mb-4 border border-gray-200 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Account</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400">Name</label>
            <p className="text-gray-800 dark:text-white font-medium">{currentUser?.name}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500 dark:text-gray-400">Email</label>
            <p className="text-gray-800 dark:text-white font-medium">{currentUser?.email}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="mt-4 w-full py-3 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </div>

      {/* Things I Know About You Section */}
      <div className="bg-white dark:bg-near-black rounded-xl p-6 border border-gray-200 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
          <Info size={18} /> Things I Know About You
        </h3>
        {facts.length === 0 ? (
          <p className="text-gray-400 dark:text-gray-600 text-center py-4">I'm still learning about you!</p>
        ) : (
          <ul className="space-y-2">
            {facts.map((fact, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="text-brand-500 dark:text-accent-500 mt-1">•</span>
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-600 mt-4">
          Aria automatically learns and remembers facts about you from your conversations.
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex h-full bg-gray-50 dark:bg-pitch-black relative font-sans transition-colors duration-200">
      
      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:static inset-y-0 left-0 w-80 bg-white dark:bg-near-black border-r border-gray-200 dark:border-gray-800 z-30 transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <h1 className="text-xl font-bold text-brand-900 dark:text-white flex items-center gap-2">
              <div className="w-8 h-8 bg-brand-500 dark:bg-accent-600 rounded-lg flex items-center justify-center text-white">A</div>
              Aria
            </h1>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-gray-500 dark:text-gray-400">
              <X />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            
            {/* View Toggle */}
            <div className="flex p-1 bg-gray-100 dark:bg-dark-surface rounded-lg">
              <button 
                onClick={() => setViewMode(ViewMode.CHAT)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all 
                  ${viewMode === ViewMode.CHAT 
                    ? 'bg-white dark:bg-gray-800 shadow-sm text-brand-600 dark:text-accent-500' 
                    : 'text-gray-500 dark:text-gray-400'}`}
              >
                Chat
              </button>
              <button 
                 onClick={() => setViewMode(ViewMode.TASKS)}
                 className={`flex-1 py-2 text-sm font-medium rounded-md transition-all 
                  ${viewMode === ViewMode.TASKS 
                    ? 'bg-white dark:bg-gray-800 shadow-sm text-brand-600 dark:text-accent-500' 
                    : 'text-gray-500 dark:text-gray-400'}`}
              >
                Tasks
              </button>
              <button 
                 onClick={() => setViewMode(ViewMode.SETTINGS)}
                 className={`flex-1 py-2 text-sm font-medium rounded-md transition-all 
                  ${viewMode === ViewMode.SETTINGS 
                    ? 'bg-white dark:bg-gray-800 shadow-sm text-brand-600 dark:text-accent-500' 
                    : 'text-gray-500 dark:text-gray-400'}`}
              >
                <Settings size={16} className="mx-auto" />
              </button>
            </div>

            <Calendar 
              selectedDate={currentDate} 
              onSelectDate={(d) => { setCurrentDate(d); setViewMode(ViewMode.CHAT); if(window.innerWidth < 768) setIsSidebarOpen(false); }} 
            />

            {/* Chat Sessions List */}
            <ChatSessions
              userId={currentUser?.id || ''}
              selectedDate={currentDate}
              onSelectDate={(date) => {
                setCurrentDate(date);
                setViewMode(ViewMode.CHAT);
                if(window.innerWidth < 768) setIsSidebarOpen(false);
              }}
              onSessionDeleted={() => {
                // Refresh data if needed
                if (currentUser?.id) {
                  loadData();
                }
              }}
            />

            {/* Chat Management Dropdown */}
            <div className="relative group">
              <button
                className="w-full py-2.5 px-4 bg-gray-100 dark:bg-dark-surface hover:bg-gray-200 dark:hover:bg-gray-800 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors flex items-center justify-center gap-2"
                title="Chat options"
              >
                <MoreVertical size={16} />
              </button>
              <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-near-black border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg hidden group-hover:block z-50">
                <button
                  onClick={() => setShowChatManager(true)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
                >
                  <Trash2 size={16} />
                  Manage & Delete Chats
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col h-full w-full relative bg-gray-50 dark:bg-pitch-black transition-colors">
        {/* Header */}
        <header className="h-16 bg-white/80 dark:bg-pitch-black/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 flex items-center px-4 md:px-8 justify-between z-10 sticky top-0 transition-colors">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-gray-600 dark:text-gray-300">
              <Menu />
            </button>
            <div>
              <h2 className="font-semibold text-gray-800 dark:text-white">
                {viewMode === ViewMode.TASKS ? 'Tasks & Reminders' : 
                 viewMode === ViewMode.SETTINGS ? 'Settings' :
                 currentDate === getOSToday() ? 'Today' : new Date(currentDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                {viewMode === ViewMode.CHAT ? 'Synced with OS Calendar' : 
                 viewMode === ViewMode.TASKS ? `${tasks.filter(t=>!t.completed).length} pending` :
                 `Signed in as ${currentUser?.email}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowChatSearch(true)}
              className="hidden md:block p-2 rounded-full text-gray-500 dark:text-accent-500 hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
              title="Search chats"
            >
              <Info size={20} />
            </button>

            <button 
              onClick={() => {
                setCurrentDate(getOSToday());
                setViewMode(ViewMode.CHAT);
              }}
              className="hidden md:block text-sm text-brand-600 dark:text-accent-500 font-medium hover:bg-brand-50 dark:hover:bg-dark-surface px-3 py-1.5 rounded-full transition-colors"
            >
              Go to Today
            </button>
            
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-800 mx-1"></div>

            <button 
              onClick={toggleTheme}
              className="p-2 rounded-full text-gray-500 dark:text-accent-500 hover:bg-gray-100 dark:hover:bg-dark-surface transition-colors"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        {/* Content */}
        {viewMode === ViewMode.TASKS ? (
          <TaskView />
        ) : viewMode === ViewMode.SETTINGS ? (
          <SettingsView />
        ) : (
          <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 opacity-60">
                <div className="w-16 h-16 bg-gray-100 dark:bg-dark-surface rounded-full flex items-center justify-center mb-4 text-gray-300 dark:text-gray-700">
                  <MessageSquare size={32} />
                </div>
                <p>Start your journal entry for {currentDate}</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`
                      max-w-[85%] md:max-w-[70%] p-4 rounded-2xl text-sm md:text-base leading-relaxed whitespace-pre-wrap shadow-sm
                      ${msg.role === 'user' 
                        ? 'bg-brand-500 dark:bg-accent-600 text-white rounded-br-none' 
                        : 'bg-white dark:bg-near-black text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-800 rounded-bl-none'}
                    `}
                  >
                    {msg.text}
                  </div>
                </div>
              ))
            )}
            {isLoading && (
               <div className="flex justify-start">
                 <div className="bg-white dark:bg-near-black px-4 py-3 rounded-2xl rounded-bl-none border border-gray-100 dark:border-gray-800 shadow-sm flex items-center gap-2">
                   <div className="w-2 h-2 bg-brand-400 dark:bg-accent-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                   <div className="w-2 h-2 bg-brand-400 dark:bg-accent-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                   <div className="w-2 h-2 bg-brand-400 dark:bg-accent-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                 </div>
               </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Chat Input */}
        {viewMode === ViewMode.CHAT && (
          <div className="p-4 bg-white dark:bg-pitch-black border-t border-gray-200 dark:border-gray-800 transition-colors">
            <div className="max-w-3xl mx-auto flex items-end gap-2 bg-gray-50 dark:bg-dark-surface p-2 rounded-2xl border border-gray-200 dark:border-gray-800 focus-within:ring-2 focus-within:ring-brand-500/20 dark:focus-within:ring-accent-500/20 focus-within:border-brand-500 dark:focus-within:border-accent-500 transition-all">
              <button 
                onClick={toggleListening}
                className={`p-3 rounded-xl transition-colors ${
                  isListening 
                    ? 'bg-red-500 text-white animate-pulse' 
                    : 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <Mic size={20} />
              </button>
              
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Talk to Aria..."
                className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[44px] py-3 text-gray-700 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                rows={1}
                style={{ height: 'auto', minHeight: '44px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                }}
              />
              
              <button 
                onClick={handleSend}
                disabled={!inputText.trim() || isLoading}
                className={`p-3 rounded-xl transition-all ${
                  !inputText.trim() || isLoading 
                    ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed' 
                    : 'bg-brand-500 dark:bg-accent-600 text-white shadow-md hover:scale-105'
                }`}
              >
                <Send size={20} />
              </button>
            </div>
            <div className="text-center mt-2">
                <p className="text-[10px] text-gray-400 dark:text-gray-600">✓ All chats auto-saved locally • Never deleted • Synced with Calendar</p>
            </div>
          </div>
        )}
      </main>

      {/* Chat Manager Modal */}
      {showChatManager && currentUser && (
        <ChatManager
          userId={currentUser.id}
          onClose={() => setShowChatManager(false)}
          onSessionDeleted={() => {
            // Reload messages if current date was deleted
            loadData();
          }}
        />
      )}

      {/* Chat Search Modal */}
      {showChatSearch && currentUser && (
        <ChatSearch
          userId={currentUser.id}
          onClose={() => setShowChatSearch(false)}
          onSelectSession={(sessionId, date) => {
            setCurrentDate(date);
            setViewMode(ViewMode.CHAT);
            loadData();
          }}
        />
      )}
    </div>
  );
};

export default App;