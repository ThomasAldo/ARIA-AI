import React, { useState, useCallback, memo } from 'react';
import { Plus, Mic } from './Icons';

interface TaskInputProps {
  onAddTask: (text: string) => void;
  disabled?: boolean;
}

const TaskInput: React.FC<TaskInputProps> = memo(({ onAddTask, disabled = false }) => {
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);

  const handleSubmit = useCallback(() => {
    if (!inputValue.trim()) return;
    onAddTask(inputValue);
    setInputValue('');
  }, [inputValue, onAddTask]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  }, [handleSubmit]);

  const toggleListening = useCallback(() => {
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
      setInputValue(prev => prev + (prev ? ' ' : '') + transcript);
    };
    recognition.start();
  }, [isListening]);

  return (
    <div className="mb-6 flex gap-3">
      <div className="flex-1 relative">
        <input 
          type="text" 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a new task..."
          disabled={disabled}
          className="w-full pl-4 pr-10 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-near-black text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-brand-500 dark:focus:ring-accent-500 focus:outline-none transition-all shadow-sm"
        />
        <button 
          onClick={toggleListening}
          className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${
            isListening 
              ? 'text-red-500 animate-pulse bg-red-100 dark:bg-red-900/30' 
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          title="Speak to add task"
        >
          <Mic size={18} />
        </button>
      </div>
      <button 
        onClick={handleSubmit}
        disabled={!inputValue.trim() || disabled}
        className="bg-brand-500 dark:bg-accent-600 text-white px-5 rounded-xl font-medium hover:bg-brand-600 dark:hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md flex items-center gap-2"
      >
        <Plus size={20} />
        <span className="hidden sm:inline">Add</span>
      </button>
    </div>
  );
});

TaskInput.displayName = 'TaskInput';

export default TaskInput;
