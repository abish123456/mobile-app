import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { adminFetch } from '../../lib/admin-api';
import toast from 'react-hot-toast';
import { Clock } from 'lucide-react';

export default function ShiftTimeDialog({ open, onOpenChange }) {
    const [config, setConfig] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hour, setHour] = useState('8');
    const [minute, setMinute] = useState('0');

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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-primary" />
                        Global Shift Start Time
                    </DialogTitle>
                    <DialogDescription>
                        Set the default time when morning deliveries can begin. Delivery staff cannot start their shift before this time.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {isLoading ? (
                        <div className="flex justify-center"><span className="text-muted-foreground text-sm">Loading config...</span></div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid gap-2">
                                <Label>Default Start Time</Label>
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
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSaveDefault} disabled={isLoading || isSaving}>
                        {isSaving ? 'Saving...' : 'Save Default Time'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
