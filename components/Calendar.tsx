import React from 'react';
import { ChevronLeft, ChevronRight } from './Icons';

interface CalendarProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

const Calendar: React.FC<CalendarProps> = ({ selectedDate, onSelectDate }) => {
  const [viewDate, setViewDate] = React.useState(new Date(selectedDate));

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const daysInMonth = getDaysInMonth(viewDate.getFullYear(), viewDate.getMonth());
  const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay();

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const renderDays = () => {
    const days = [];
    // Empty cells for offset
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<div key={`empty-${i}`} className="h-8 w-8"></div>);
    }

    // Get today's date in local timezone (not UTC)
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), i);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const isSelected = dateStr === selectedDate;
      const isToday = dateStr === todayStr;

      days.push(
        <button
          key={i}
          onClick={() => onSelectDate(dateStr)}
          className={`h-8 w-8 text-xs rounded-full flex items-center justify-center transition-all
            ${isSelected 
              ? 'bg-brand-500 dark:bg-accent-600 text-white font-bold shadow-md shadow-brand-500/20 dark:shadow-accent-600/30' 
              : 'hover:bg-brand-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-400'}
            ${isToday && !isSelected ? 'border border-brand-500 dark:border-accent-600 text-brand-600 dark:text-accent-500' : ''}
          `}
        >
          {i}
        </button>
      );
    }
    return days;
  };

  return (
    <div className="p-4 bg-white dark:bg-near-black rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 transition-colors duration-200">
      <div className="flex justify-between items-center mb-4">
        <button onClick={handlePrevMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </span>
        <button onClick={handleNextMonth} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
          <div key={d} className="text-[10px] text-gray-400 dark:text-gray-600 font-medium">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 place-items-center">
        {renderDays()}
      </div>
    </div>
  );
};

export default Calendar;