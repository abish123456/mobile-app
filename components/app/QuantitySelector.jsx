'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Minus, Plus } from 'lucide-react';

const MIN_QUANTITY = 1;

export default function QuantitySelector({ value, onChange, showLabel = true, disabled = false, max = 100 }) {
  const [inputValue, setInputValue] = useState(String(value || MIN_QUANTITY));

  // Update input value when prop value changes (from outside)
  useEffect(() => {
    setInputValue(String(value || MIN_QUANTITY));
  }, [value]);

  const handleDecrease = () => {
    const current = parseInt(inputValue, 10) || MIN_QUANTITY;
    const newValue = Math.max(0, current - 1);
    setInputValue(String(newValue));
    onChange(newValue);
  };

  const handleIncrease = () => {
    const current = parseInt(inputValue, 10) || MIN_QUANTITY;
    if (current >= max) return; // Prevent increase if at max
    const newValue = current + 1;
    setInputValue(String(newValue));
    onChange(newValue);
  };

  const handleInputChange = (e) => {
    const raw = e.target.value;
    // Allow empty input while typing
    if (raw === '') {
      setInputValue('');
      return;
    }
    // Only allow digits
    const digitsOnly = raw.replace(/\D/g, '');
    if (digitsOnly === '') {
      setInputValue('');
      return;
    }
    const num = parseInt(digitsOnly, 10);
    if (!Number.isNaN(num)) {
      // Enforce max
      if (num > max) {
        setInputValue(String(max));
        onChange(max);
      } else {
        setInputValue(String(num));
        // Only update if > 0 (allow typing 0, but don't remove item until blur)
        if (num > 0) {
          onChange(num);
        }
      }
    }
  };

  const handleInputBlur = () => {
    const num = parseInt(inputValue, 10);
    // If empty or 0, pass 0 to onChange (cart will handle removal)
    if (Number.isNaN(num) || num === 0) {
      onChange(0);
      // Reset display to show current value after blur
      setInputValue(String(value || MIN_QUANTITY));
    } else if (num < MIN_QUANTITY) {
      // If less than minimum, set to minimum
      const safeValue = MIN_QUANTITY;
      setInputValue(String(safeValue));
      onChange(safeValue);
    } else if (num > max) { // Should be covered by handleInputChange but double check
      const safeValue = max;
      setInputValue(String(safeValue));
      onChange(safeValue);
    } else {
      // Ensure input shows the actual value
      setInputValue(String(num));
    }
  };

  return (
    <div className={showLabel ? "space-y-2" : ""}>
      {showLabel && <p className="text-sm font-medium">Select quantity</p>}
      <div className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={handleDecrease}
          disabled={disabled || (parseInt(inputValue, 10) || MIN_QUANTITY) <= 1}
          className="shrink-0"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          disabled={disabled}
          className="w-16 sm:w-16 text-center text-base font-semibold h-9 sm:h-9"
        />

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={handleIncrease}
          disabled={disabled || (parseInt(inputValue, 10) || MIN_QUANTITY) >= max}
          className="shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

    </div>
  );
}