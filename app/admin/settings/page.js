'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Loader2, Info, CalendarOff, Plus, Trash2, AlertCircle, Save, CalendarDays, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../lib/admin-api';
import { cn } from '../../../lib/utils';

// 0 = Sun, 1 = Mon, ... 6 = Sat
const DAYS_OF_WEEK = [
    { index: 0, label: 'Sunday',    short: 'Sun' },
    { index: 1, label: 'Monday',    short: 'Mon' },
    { index: 2, label: 'Tuesday',   short: 'Tue' },
    { index: 3, label: 'Wednesday', short: 'Wed' },
    { index: 4, label: 'Thursday',  short: 'Thu' },
    { index: 5, label: 'Friday',    short: 'Fri' },
    { index: 6, label: 'Saturday',  short: 'Sat' },
];

export default function SettingsPage() {
    // ── One-off Holidays ──────────────────────────────────────────
    const [holidays, setHolidays] = useState([]);
    const [isLoadingHolidays, setIsLoadingHolidays] = useState(true);
    const [isAddingHoliday, setIsAddingHoliday] = useState(false);
    const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });
    const [deletingId, setDeletingId] = useState(null);

    // ── Weekly Off Days ───────────────────────────────────────────
    const [offDays, setOffDays] = useState(new Set()); // Set<number>
    const [isLoadingOffDays, setIsLoadingOffDays] = useState(true);
    const [isSavingOffDays, setIsSavingOffDays] = useState(false);
    const [adminPermissions, setAdminPermissions] = useState([]);
    const [isPermsLoading, setIsPermsLoading] = useState(true);

    useEffect(() => {
        const perms = localStorage.getItem('adminPermissions');
        if (perms) {
            setAdminPermissions(JSON.parse(perms));
        }
        setIsPermsLoading(false);
    }, []);

    const hasPermission = (perm) => {
        return adminPermissions.includes('SUPER_ADMIN') || adminPermissions.includes(perm);
    };

    useEffect(() => {
        fetchHolidays();
        fetchOffDays();
    }, []);

    // ── Fetch functions ───────────────────────────────────────────
    const fetchHolidays = async () => {
        setIsLoadingHolidays(true);
        try {
            const res = await adminFetch('/api/admin/holidays');
            const data = await res.json();
            if (data.success) {
                setHolidays(data.holidays || []);
            } else {
                toast.error(data.message || 'Failed to load holidays');
            }
        } catch (err) {
            console.error('Error fetching holidays:', err);
            toast.error('Network error loading holidays');
        } finally {
            setIsLoadingHolidays(false);
        }
    };

    const fetchOffDays = async () => {
        setIsLoadingOffDays(true);
        try {
            const res = await adminFetch('/api/admin/settings');
            const data = await res.json();
            if (data.success && data.configs?.HOLIDAY_WEEKDAYS) {
                const saved = data.configs.HOLIDAY_WEEKDAYS
                    .split(',')
                    .map((n) => parseInt(n.trim(), 10))
                    .filter((n) => !isNaN(n) && n >= 0 && n <= 6);
                setOffDays(new Set(saved));
            } else {
                setOffDays(new Set());
            }
        } catch (err) {
            console.error('Error fetching off-days:', err);
            toast.error('Network error loading weekly off days');
        } finally {
            setIsLoadingOffDays(false);
        }
    };

    // ── One-off Holiday handlers ──────────────────────────────────
    const handleAddHoliday = async (e) => {
        e.preventDefault();
        if (!newHoliday.date) {
            toast.error('Please select a date');
            return;
        }
        setIsAddingHoliday(true);
        try {
            const res = await adminFetch('/api/admin/holidays', {
                method: 'POST',
                body: JSON.stringify({ date: newHoliday.date, name: newHoliday.name || null }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Holiday added successfully');
                setNewHoliday({ date: '', name: '' });
                fetchHolidays();
            } else {
                toast.error(data.message || 'Failed to add holiday');
            }
        } catch (err) {
            console.error('Error adding holiday:', err);
            toast.error('Network error. Please try again.');
        } finally {
            setIsAddingHoliday(false);
        }
    };

    const handleDeleteHoliday = async (id) => {
        setDeletingId(id);
        try {
            const res = await adminFetch('/api/admin/holidays', {
                method: 'DELETE',
                body: JSON.stringify({ id }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Holiday removed');
                setHolidays((prev) => prev.filter((h) => h.id !== id));
            } else {
                toast.error(data.message || 'Failed to remove holiday');
            }
        } catch (err) {
            console.error('Error deleting holiday:', err);
            toast.error('Network error. Please try again.');
        } finally {
            setDeletingId(null);
        }
    };

    // ── Weekly Off Days handlers ──────────────────────────────────
    const toggleOffDay = (index) => {
        setOffDays((prev) => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const handleSaveOffDays = async () => {
        if (!hasPermission('edit_delivery_settings')) return;
        setIsSavingOffDays(true);
        try {
            const value = [...offDays].sort((a, b) => a - b).join(',');
            const res = await adminFetch('/api/admin/settings', {
                method: 'POST',
                body: JSON.stringify({ key: 'HOLIDAY_WEEKDAYS', value }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Weekly off days saved');
            } else {
                toast.error(data.message || 'Failed to save');
            }
        } catch (err) {
            console.error('Error saving off days:', err);
            toast.error('Network error. Please try again.');
        } finally {
            setIsSavingOffDays(false);
        }
    };

    // Format YYYY-MM-DD → "Mon DD, YYYY"
    const formatHolidayDate = (dateStr) => {
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    };

    // Minimum selectable date = today (YYYY-MM-DD in IST)
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    if (isPermsLoading) {
        return <div className="flex justify-center items-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    if (!hasPermission('view_delivery_settings')) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh]">
                <XCircle className="h-16 w-16 text-destructive mb-4" />
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to view Delivery Settings.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 w-full animate-in fade-in duration-500">
            <div className="flex flex-col gap-1">
                <h1 className="text-lg md:text-3xl font-extrabold tracking-tight text-foreground">Delivery Settings</h1>
                <p className="text-muted-foreground text-lg">Manage weekly off days, holidays and delivery schedule</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* ── Left Column: Weekly Off Days ──────────────────────────────────── */}
                <div className="lg:col-span-5 space-y-8">
                    <Card className="border-2 shadow-sm overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b pb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <CalendarDays className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl">Weekly Off Days</CardTitle>
                                    <CardDescription>Select recurring non-delivery days</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6">
                            {isLoadingOffDays ? (
                                <div className="flex flex-col items-center justify-center py-10 gap-3">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                    <span className="text-sm font-medium text-muted-foreground">Fetching settings...</span>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-4 gap-3">
                                        {DAYS_OF_WEEK.map((day) => {
                                            const active = offDays.has(day.index);
                                            return (
                                                <button
                                                    key={day.index}
                                                    type="button"
                                                    onClick={() => hasPermission('edit_delivery_settings') && toggleOffDay(day.index)}
                                                    disabled={!hasPermission('edit_delivery_settings')}
                                                    className={cn(
                                                        'group relative flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all duration-200',
                                                        active
                                                            ? 'bg-primary border-primary text-primary-foreground shadow-md scale-105 z-10'
                                                            : 'bg-background border-border text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground',
                                                        !hasPermission('edit_delivery_settings') && 'opacity-70 cursor-not-allowed hover:bg-background hover:border-border hover:text-muted-foreground'
                                                    )}
                                                >
                                                    <span className="text-[10px] uppercase tracking-widest font-bold opacity-70 mb-0.5">
                                                        {day.short}
                                                    </span>
                                                    {active && (
                                                        <CheckCircle2 className="absolute top-1 right-1 h-3 w-3 text-primary-foreground/80" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className={cn(
                                        "p-4 rounded-xl border-2 border-dashed transition-colors",
                                        offDays.size > 0 ? "bg-primary/5 border-primary/20" : "bg-muted/50 border-muted"
                                    )}>
                                        {offDays.size > 0 ? (
                                            <div className="flex items-start gap-3">
                                                <Info className="h-5 w-5 text-primary mt-0.5" />
                                                <div>
                                                    <p className="text-sm font-semibold text-primary">Active Off Days</p>
                                                    <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                                                        {[...offDays]
                                                            .sort((a, b) => a - b)
                                                            .map((i) => DAYS_OF_WEEK[i].label)
                                                            .join(', ')}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-center text-muted-foreground py-2">
                                                No weekly off days selected. Deliveries happen daily.
                                            </p>
                                        )}
                                    </div>

                                    {hasPermission('edit_delivery_settings') && (
                                        <Button 
                                            onClick={handleSaveOffDays} 
                                            disabled={isSavingOffDays} 
                                            className="w-full h-12 text-md font-semibold shadow-lg hover:shadow-xl transition-all"
                                        >
                                            {isSavingOffDays
                                                ? <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                                : <Save className="h-5 w-5 mr-2" />}
                                            Save Schedule
                                        </Button>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>

                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 text-blue-800">
                        <Info className="h-5 w-5 shrink-0" />
                        <p className="text-xs leading-relaxed font-medium">
                            Orders scheduled for these days will automatically be rescheduled to the next available working day in the system.
                        </p>
                    </div>
                </div>

                {/* ── Right Column: One-off Holiday Dates ─────────────────────────────── */}
                <div className="lg:col-span-7 space-y-8">
                    <Card className="border-2 shadow-sm overflow-hidden">
                        <CardHeader className="bg-muted/30 border-b pb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <CalendarOff className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl">Holiday Calendar</CardTitle>
                                    <CardDescription>Manage specific non-delivery dates</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-8">
                            {/* Add holiday form */}
                            {hasPermission('edit_delivery_settings') && (
                                <form onSubmit={handleAddHoliday} className="bg-muted/40 p-5 rounded-2xl border-2 border-muted-foreground/10 space-y-4">
                                    <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Add New Holiday</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="holiday-date" className="text-xs font-bold text-muted-foreground uppercase">Pick Date</Label>
                                            <Input
                                                id="holiday-date"
                                            type="date"
                                            min={todayStr}
                                            value={newHoliday.date}
                                            onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
                                            className="h-11 border-2 focus-visible:ring-primary bg-background"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="holiday-name" className="text-xs font-bold text-muted-foreground uppercase">Reason/Label</Label>
                                        <Input
                                            id="holiday-name"
                                            type="text"
                                            placeholder="e.g. Diwali, Eid"
                                            value={newHoliday.name}
                                            onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                                            className="h-11 border-2 focus-visible:ring-primary bg-background"
                                        />
                                    </div>
                                </div>
                                <Button type="submit" disabled={isAddingHoliday} className="w-full h-11 font-bold text-md">
                                    {isAddingHoliday
                                        ? <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                        : <Plus className="h-5 w-5 mr-2" />}
                                    Register Holiday
                                </Button>
                            </form>
                            )}

                            {/* Holidays list */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Configured Holidays</h3>
                                    {!isLoadingHolidays && holidays.length > 0 && (
                                        <span className="bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
                                            {holidays.length} DATES
                                        </span>
                                    )}
                                </div>

                                {isLoadingHolidays ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
                                    </div>
                                ) : holidays.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border-2 border-dashed bg-muted/20">
                                        <div className="p-4 bg-muted rounded-full mb-4">
                                            <CalendarOff className="h-10 w-10 text-muted-foreground" />
                                        </div>
                                        <p className="font-bold text-lg text-muted-foreground">Calendar Clear</p>
                                        <p className="text-sm text-muted-foreground/60 mt-1">No specific holidays configured yet.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                        {holidays.map((h) => (
                                            <div
                                                key={h.id}
                                                className="group flex items-center justify-between p-4 rounded-2xl border-2 bg-card hover:border-primary/50 hover:shadow-md transition-all duration-200"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="h-10 w-10 bg-muted group-hover:bg-primary/10 rounded-xl flex items-center justify-center transition-colors">
                                                        <CalendarOff className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-sm tracking-tight">{formatHolidayDate(h.date)}</p>
                                                        {h.name && (
                                                            <p className="text-xs font-medium text-muted-foreground mt-0.5 line-clamp-1 italic">
                                                                "{h.name}"
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                {hasPermission('delete_delivery_settings') && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleDeleteHoliday(h.id)}
                                                        disabled={deletingId === h.id}
                                                        className="h-9 w-9 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        {deletingId === h.id
                                                            ? <Loader2 className="h-4 w-4 animate-spin" />
                                                            : <Trash2 className="h-4 w-4" />}
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>




            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #cbd5e1;
                }
            `}</style>
        </div>
    );
}
