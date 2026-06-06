'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export function SearchableSelect({
    options = [],
    value,
    onValueChange,
    placeholder = 'Select option...',
    emptyMessage = 'No options found.',
    className,
    error = false,
    isLoading = false,
    side = 'bottom',
}) {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const inputRef = React.useRef(null);

    const filteredOptions = options.filter((option) =>
        option.label.toLowerCase().includes(search.toLowerCase()) ||
        option.value.toLowerCase().includes(search.toLowerCase())
    );

    const selectedOption = options.find((option) => option.value === value);

    React.useEffect(() => {
        if (!open) {
            setSearch('');
        } else {
            // Delay focus to allow popover to finalize its position and animation on mobile/iOS
            const timer = setTimeout(() => {
                inputRef.current?.focus();
            }, 150);
            return () => clearTimeout(timer);
        }
    }, [open]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        'w-full justify-between font-normal text-sm h-9 px-3 border-2 border-primary/20 bg-background shadow-sm hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:border-primary/40 hover:text-black transition-all',
                        !value && 'text-muted-foreground',
                        error && 'border-destructive',
                        className
                    )}
                    disabled={isLoading}
                >
                    <span className="truncate">
                        {isLoading ? 'Loading...' : selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0"
                align="start"
                side={side}
                sideOffset={4}
                avoidCollisions={true}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <div className="flex items-center border-b px-3 bg-muted/20">
                    <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    <input
                        ref={inputRef}
                        className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Search..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div
                    className="min-h-[100px] max-h-[300px] overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-primary/20"
                    style={{
                        overscrollBehavior: 'contain',
                        WebkitOverflowScrolling: 'touch',
                        touchAction: 'pan-y'
                    }}
                >
                    {filteredOptions.length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                            {emptyMessage}
                        </div>
                    ) : (
                        filteredOptions.map((option) => (
                            <div
                                key={option.value}
                                className={cn(
                                    'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-primary/10 hover:text-primary transition-colors',
                                    value === option.value && 'bg-primary/20 text-primary font-medium'
                                )}
                                onClick={() => {
                                    onValueChange(option.value);
                                    setOpen(false);
                                }}
                            >
                                <Check
                                    className={cn(
                                        'mr-2 h-4 w-4 shrink-0',
                                        value === option.value ? 'opacity-100' : 'opacity-0'
                                    )}
                                />
                                <span className="truncate">{option.label}</span>
                            </div>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
