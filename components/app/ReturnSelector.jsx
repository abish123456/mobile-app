'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Minus, Plus } from 'lucide-react';

export default function ReturnSelector({ value, onChange, disabled = false, max = 100 }) {
    const [inputValue, setInputValue] = useState(String(value || 0));

    // Update input value when prop value changes (from outside)
    useEffect(() => {
        setInputValue(String(value || 0));
    }, [value]);

    const handleDecrease = () => {
        const current = parseInt(inputValue, 10) || 0;
        const newValue = Math.max(0, current - 1);
        setInputValue(String(newValue));
        onChange(newValue);
    };

    const handleIncrease = () => {
        const current = parseInt(inputValue, 10) || 0;
        if (current >= max) return; // Prevent increase if at max
        const newValue = current + 1;
        setInputValue(String(newValue));
        onChange(newValue);
    };

    const handleInputChange = (e) => {
        const raw = e.target.value;
        if (raw === '') {
            setInputValue('');
            return;
        }
        const digitsOnly = raw.replace(/\D/g, '');
        if (digitsOnly === '') {
            setInputValue('');
            return;
        }
        const num = parseInt(digitsOnly, 10);
        if (!Number.isNaN(num)) {
            if (num > max) {
                setInputValue(String(max));
                onChange(max);
            } else {
                setInputValue(String(num));
                onChange(num);
            }
        }
    };

    const handleInputBlur = () => {
        const num = parseInt(inputValue, 10);
        if (Number.isNaN(num) || num < 0) {
            onChange(0);
            setInputValue('0');
        } else if (num > max) {
            setInputValue(String(max));
            onChange(max);
        } else {
            setInputValue(String(num));
        }
    };

    return (
        <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-tight">Empty Cans to Return</p>
            <div className="inline-flex items-center gap-2 rounded-md border bg-blue-50/50 px-2 py-1.5 border-blue-100">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleDecrease}
                    disabled={disabled || (parseInt(inputValue, 10) || 0) <= 0}
                    className="shrink-0 h-7 w-7"
                >
                    <Minus className="h-3.5 w-3.5" />
                </Button>

                <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={inputValue}
                    onChange={handleInputChange}
                    onBlur={handleInputBlur}
                    disabled={disabled}
                    className="w-10 sm:w-10 text-center text-sm font-bold h-7 sm:h-7 bg-transparent border-none focus-visible:ring-0 p-0"
                />

                <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleIncrease}
                    disabled={disabled || (parseInt(inputValue, 10) || 0) >= max}
                    className="shrink-0 h-7 w-7"
                >
                    <Plus className="h-3.5 w-3.5" />
                </Button>
            </div>
            {max > 0 && (
                <p className="text-[9px] text-muted-foreground mt-0.5">
                    Available: {max} cans
                </p>
            )}
        </div>
    );
}
