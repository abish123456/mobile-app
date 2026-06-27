import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { adminFetch } from '../../lib/admin-api';
import toast from 'react-hot-toast';
import { Clock, Calendar, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function ShiftTimeDialog({ open, onOpenChange, selectedDate }) {
    const [config, setConfig] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    // Default Tab State
    const [hour, setHour] = useState('8');
    const [minute, setMinute] = useState('0');

    // Override Tab State
    const [overrideHour, setOverrideHour] = useState('8');
    const [overrideMinute, setOverrideMinute] = useState('0');

    useEffect(() => {
        if (open) {
            fetchConfig();
        }
    }, [open]);

    const fetchConfig = async () => {
        setIsLoading(true);
        try {
            const res = await adminFetch('/api/admin/shift-start-time');
            const data = await res.json();
            if (data.success && data.config) {
                setConfig(data.config);
                setHour(String(data.config.defaultHour));
                setMinute(String(data.config.defaultMinute));
                
                // Init override fields
                if (data.config.overrideDate && data.config.overrideDate === format(selectedDate || new Date(), 'yyyy-MM-dd')) {
                    setOverrideHour(String(data.config.overrideHour));
                    setOverrideMinute(String(data.config.overrideMinute));
                } else {
                    setOverrideHour(String(data.config.defaultHour));
                    setOverrideMinute(String(data.config.defaultMinute));
                }
            }
        } catch (err) {
            console.error('Error fetching shift config', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveDefault = async () => {
        setIsSaving(true);
        try {
            const res = await adminFetch('/api/admin/shift-start-time', {
                method: 'POST',
                body: JSON.stringify({
                    type: 'default',
                    hour: parseInt(hour),
                    minute: parseInt(minute)
                })
            });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
                onOpenChange(false);
            } else {
                toast.error(data.message || 'Failed to save');
            }
        } catch (err) {
            console.error(err);
            toast.error('Network error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveOverride = async () => {
        setIsSaving(true);
        try {
            const dateStr = format(selectedDate || new Date(), 'yyyy-MM-dd');
            const res = await adminFetch('/api/admin/shift-start-time', {
                method: 'POST',
                body: JSON.stringify({
                    type: 'override',
                    date: dateStr,
                    hour: parseInt(overrideHour),
                    minute: parseInt(overrideMinute)
                })
            });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
                onOpenChange(false);
            } else {
                toast.error(data.message || 'Failed to save override');
            }
        } catch (err) {
            console.error(err);
            toast.error('Network error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleClearOverride = async () => {
        setIsSaving(true);
        try {
            const res = await adminFetch('/api/admin/shift-start-time', {
                method: 'POST',
                body: JSON.stringify({
                    type: 'clear_override'
                })
            });
            const data = await res.json();
            if (data.success) {
                toast.success(data.message);
                onOpenChange(false);
            } else {
                toast.error(data.message || 'Failed to clear override');
            }
        } catch (err) {
            console.error(err);
            toast.error('Network error');
        } finally {
            setIsSaving(false);
        }
    };

    const targetDateStr = format(selectedDate || new Date(), 'yyyy-MM-dd');
    const hasActiveOverride = config?.overrideDate === targetDateStr;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-primary" />
                        Shift Start Time
                    </DialogTitle>
                    <DialogDescription>
                        Set the earliest time delivery staff can start their shifts.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2">
                    {isLoading ? (
                        <div className="flex justify-center py-8"><span className="text-muted-foreground text-sm">Loading config...</span></div>
                    ) : (
                        <Tabs defaultValue="override" className="w-full">
                            <TabsList className="grid w-full grid-cols-2 mb-4">
                                <TabsTrigger value="override" className="gap-2">
                                    <Calendar className="w-4 h-4" /> Date Override
                                </TabsTrigger>
                                <TabsTrigger value="default" className="gap-2">
                                    <Clock className="w-4 h-4" /> Global Default
                                </TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="override" className="space-y-4">
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md mb-4">
                                    <p className="text-sm flex items-start gap-2 text-amber-800">
                                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                        This applies ONLY to the selected date: <strong>{format(selectedDate || new Date(), 'MMM dd, yyyy')}</strong>
                                    </p>
                                </div>

                                <div className="grid gap-2">
                                    <Label>Override Start Time</Label>
                                    <div className="flex items-center gap-2">
                                        <Select value={overrideHour} onValueChange={setOverrideHour}>
                                            <SelectTrigger className="w-[120px]">
                                                <SelectValue placeholder="Hour" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Array.from({ length: 24 }).map((_, i) => (
                                                    <SelectItem key={i} value={String(i)}>
                                                        {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <span>:</span>
                                        <Select value={overrideMinute} onValueChange={setOverrideMinute}>
                                            <SelectTrigger className="w-[100px]">
                                                <SelectValue placeholder="Minute" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {['0', '15', '30', '45'].map((m) => (
                                                    <SelectItem key={m} value={m}>
                                                        {m.padStart(2, '0')}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {hasActiveOverride && (
                                        <p className="text-xs text-green-600 mt-2 font-medium">
                                            An override is currently active for this date.
                                        </p>
                                    )}
                                </div>
                                <div className="flex justify-between pt-4">
                                    <Button variant="outline" onClick={handleClearOverride} disabled={isLoading || isSaving || !config?.overrideDate} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                                        Clear Any Override
                                    </Button>
                                    <Button onClick={handleSaveOverride} disabled={isLoading || isSaving}>
                                        {isSaving ? 'Saving...' : 'Save Override'}
                                    </Button>
                                </div>
                            </TabsContent>

                            <TabsContent value="default" className="space-y-4">
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md mb-4">
                                    <p className="text-sm flex items-start gap-2 text-blue-800">
                                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                        Changing this affects ALL dates that do not have a specific override set.
                                    </p>
                                </div>

                                <div className="grid gap-2">
                                    <Label>Global Default Start Time</Label>
                                    <div className="flex items-center gap-2">
                                        <Select value={hour} onValueChange={setHour}>
                                            <SelectTrigger className="w-[120px]">
                                                <SelectValue placeholder="Hour" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Array.from({ length: 24 }).map((_, i) => (
                                                    <SelectItem key={i} value={String(i)}>
                                                        {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <span>:</span>
                                        <Select value={minute} onValueChange={setMinute}>
                                            <SelectTrigger className="w-[100px]">
                                                <SelectValue placeholder="Minute" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {['0', '15', '30', '45'].map((m) => (
                                                    <SelectItem key={m} value={m}>
                                                        {m.padStart(2, '0')}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        Currently: {config?.defaultHour}:{String(config?.defaultMinute || 0).padStart(2, '0')} (24H)
                                    </p>
                                </div>
                                <div className="flex justify-end pt-4">
                                    <Button onClick={handleSaveDefault} disabled={isLoading || isSaving}>
                                        {isSaving ? 'Saving...' : 'Save Global Default'}
                                    </Button>
                                </div>
                            </TabsContent>
                        </Tabs>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
