'use client';

import { useState, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { CalendarIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

// Returns the IST weekday index (0=Sun … 6=Sat) for any Date
function getISTWeekday(d) {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
  }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

// Returns YYYY-MM-DD string in IST for a Date object
function toISTDateStr(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export default function DeliverySlotSelector({ value, onChange, error, trigger }) {
  const [cutoffHour, setCutoffHour] = useState(11);
  const [cutoffMinute, setCutoffMinute] = useState(0);
  const [holidayDates, setHolidayDates] = useState(new Set()); // Set<"YYYY-MM-DD">
  const [weeklyOffDays, setWeeklyOffDays] = useState(new Set()); // Set<0-6>

  // Fetch config (cutoff + holidays + weekly off days) once on mount
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/shop/api/config', { cache: 'no-store' });
        const data = await res.json();
        if (data.success && data.config) {
          if (data.config.SAME_DAY_CUTOFF_HOUR) {
            setCutoffHour(parseInt(data.config.SAME_DAY_CUTOFF_HOUR));
          }
          if (data.config.SAME_DAY_CUTOFF_MINUTE) {
            setCutoffMinute(parseInt(data.config.SAME_DAY_CUTOFF_MINUTE));
          }
          if (Array.isArray(data.config.holidays)) {
            setHolidayDates(new Set(data.config.holidays.map((h) => h.date)));
          }
          if (Array.isArray(data.config.HOLIDAY_WEEKDAYS)) {
            setWeeklyOffDays(new Set(data.config.HOLIDAY_WEEKDAYS));
          }
        }
      } catch (err) {
        console.error('Error fetching config:', err);
      }
    };
    fetchConfig();
  }, []);

  // Parse value: format is "YYYY-MM-DD"
  const parseValue = (val) => {
    if (!val) return null;
    const parts = val.split('-');
    if (parts.length >= 3) {
      const dateStr = parts.slice(0, 3).join('-');
      return new Date(dateStr + 'T00:00:00');
    }
    return null;
  };

  const selectedDate = parseValue(value);
  const [date, setDate] = useState(selectedDate || null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Update state when value prop changes (from parent)
  useEffect(() => {
    const parsed = parseValue(value);
    setDate(parsed || null);
  }, [value]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = addDays(today, 30);

  // Disable dates: past, beyond 30 days, post-cutoff tomorrow, holidays, weekly off-days
  const isDateDisabled = (d) => {
    const dateToCheck = new Date(d);
    dateToCheck.setHours(0, 0, 0, 0);

    if (dateToCheck <= today) return true;
    if (dateToCheck > maxDate) return true;

    // Cutoff check for tomorrow
    const istFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = istFormatter.formatToParts(new Date());
    const currentHourIST = parseInt(parts.find((p) => p.type === 'hour')?.value || '0');
    const currentMinuteIST = parseInt(parts.find((p) => p.type === 'minute')?.value || '0');

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (dateToCheck.getTime() === tomorrow.getTime()) {
      if (currentHourIST > cutoffHour || (currentHourIST === cutoffHour && currentMinuteIST >= cutoffMinute)) {
        return true;
      }
    }

    // Holiday check (one-off dates)
    const istDateStr = toISTDateStr(dateToCheck);
    if (holidayDates.has(istDateStr)) return true;

    // Weekly off-day check
    const weekdayIdx = getISTWeekday(dateToCheck);
    if (weeklyOffDays.has(weekdayIdx)) return true;

    return false;
  };

  const handleDateSelect = (newDate) => {
    if (newDate) {
      setDate(newDate);
      const dateStr = format(newDate, 'yyyy-MM-dd');
      onChange(dateStr);
      setIsOpen(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  if (trigger) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          {trigger}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date || new Date()}
            onSelect={handleDateSelect}
            disabled={isDateDisabled}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between max-[400px]:flex-col-reverse max-[400px]:items-start max-[400px]:gap-2">
          <p className="text-sm font-medium">Select delivery date</p>
          {error ? (
            <div className="flex items-center gap-1.5 text-destructive text-xs sm:text-sm">
              <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="font-medium">{error}</span>
            </div>
          ) : showSuccess && (
            <div className="flex items-center gap-1.5 text-green-600 text-xs sm:text-sm">
              <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="font-medium">Delivery time confirmed</span>
            </div>
          )}
        </div>
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? format(date, "PPP") : "Pick a date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              disabled={isDateDisabled}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
