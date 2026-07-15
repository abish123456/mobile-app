'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import { Badge } from '../../../../components/ui/badge';
import { 
  Loader2, Download, MapPin, Clock, Users, ClipboardCheck, ExternalLink, 
  RefreshCw, UserCheck, UserX, AlertTriangle, Calendar, BarChart3
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../../lib/admin-api';

export default function AttendanceReportsPage() {
    const [activeTab, setActiveTab] = useState('dashboard');
    
    // Dashboard
    const [summary, setSummary] = useState({ totalEmployees: 0, presentToday: 0, absentToday: 0, onLeave: 0, lateToday: 0 });
    const [summaryLoading, setSummaryLoading] = useState(true);

    // Daily
    const [dailyDate, setDailyDate] = useState('');
    const [dailyRows, setDailyRows] = useState([]);
    const [dailySummary, setDailySummary] = useState({ total: 0, present: 0, late: 0, absent: 0 });
    const [dailyLoading, setDailyLoading] = useState(false);
    const [staff, setStaff] = useState([]);
    const [locations, setLocations] = useState([]);
    const [staffFilter, setStaffFilter] = useState('all');
    const [locationFilter, setLocationFilter] = useState('all');

    // Monthly
    const [monthFrom, setMonthFrom] = useState('');
    const [monthTo, setMonthTo] = useState('');
    const [monthlyRows, setMonthlyRows] = useState([]);
    const [monthlyTotalDays, setMonthlyTotalDays] = useState(0);
    const [monthlyLoading, setMonthlyLoading] = useState(false);

    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        setDailyDate(today);
        // Set monthly range to current month
        const now = new Date();
        setMonthFrom(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
        setMonthTo(today);
    }, []);

    useEffect(() => {
        fetchDashboard();
    }, []);

    useEffect(() => {
        if (dailyDate && activeTab === 'daily') fetchDaily();
    }, [dailyDate, staffFilter, locationFilter, activeTab]);

    useEffect(() => {
        if (monthFrom && monthTo && activeTab === 'monthly') fetchMonthly();
    }, [monthFrom, monthTo, activeTab]);

    const fetchDashboard = async () => {
        setSummaryLoading(true);
        try {
            const res = await adminFetch('/api/admin/attendance-summary');
            const data = await res.json();
            if (data.success) setSummary(data.summary);
        } catch (err) {
            toast.error('Failed to load dashboard');
        } finally {
            setSummaryLoading(false);
        }
    };

    const fetchDaily = async () => {
        setDailyLoading(true);
        try {
            const params = new URLSearchParams({ reportType: 'daily', dateFrom: dailyDate });
            if (staffFilter !== 'all') params.set('staffId', staffFilter);
            if (locationFilter !== 'all') params.set('locationId', locationFilter);
            const res = await adminFetch(`/api/admin/attendance-reports?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setDailyRows(data.rows || []);
                setDailySummary(data.summary || { total: 0, present: 0, late: 0, absent: 0 });
                setStaff(data.staff || []);
                setLocations(data.locations || []);
            }
        } catch (err) {
            toast.error('Failed to load daily report');
        } finally {
            setDailyLoading(false);
        }
    };

    const fetchMonthly = async () => {
        setMonthlyLoading(true);
        try {
            const params = new URLSearchParams({ reportType: 'monthly', dateFrom: monthFrom, dateTo: monthTo });
            const res = await adminFetch(`/api/admin/attendance-reports?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setMonthlyRows(data.rows || []);
                setMonthlyTotalDays(data.totalDays || 0);
            }
        } catch (err) {
            toast.error('Failed to load monthly report');
        } finally {
            setMonthlyLoading(false);
        }
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
        });
    };

    const exportCSV = (headers, rows, filename) => {
        if (rows.length === 0) { toast.error('No data to export'); return; }
        const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        toast.success('Exported');
    };

    const exportDailyCSV = () => {
        exportCSV(
            ['Emp Code', 'Name', 'Mobile', 'Check In', 'Check Out', 'Location', 'Status', 'Late'],
            dailyRows.map(r => [
                r.employeeCode || '-', r.employeeName || '-', r.mobile || '-',
                formatTime(r.checkIn), formatTime(r.checkOut), r.locationName || '-',
                r.status, r.isLate ? 'Yes' : 'No'
            ]),
            `attendance_daily_${dailyDate}.csv`
        );
    };

    const exportMonthlyCSV = () => {
        exportCSV(
            ['Emp Code', 'Name', 'Present Days', 'Absent Days', 'Late Days', 'Total Days'],
            monthlyRows.map(r => [
                r.employeeCode || '-', r.employeeName || '-',
                r.presentDays, r.absentDays, r.lateDays, r.totalDays
            ]),
            `attendance_monthly_${monthFrom}_${monthTo}.csv`
        );
    };

    const tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
        { id: 'daily', label: 'Daily Report', icon: Calendar },
        { id: 'monthly', label: 'Monthly Report', icon: ClipboardCheck },
    ];

    const statusBadge = (status) => {
        const styles = {
            PRESENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            LATE: 'bg-amber-50 text-amber-700 border-amber-200',
            ABSENT: 'bg-red-50 text-red-600 border-red-200',
        };
        return <Badge className={styles[status] || 'bg-gray-100 text-gray-600'}>{status}</Badge>;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            {/* <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Attendance Management</h1>
                    <p className="text-sm text-slate-500 mt-1">Track employee attendance, check-in/out, and generate reports</p>
                </div>
            </div> */}

            {/* Tabs & Filters Header Row */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Tabs */}
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit shrink-0">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all
                                ${activeTab === tab.id 
                                    ? 'bg-white text-slate-900 shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Right Aligned Filters & Actions */}
                <div className="w-full lg:w-auto">
                    {activeTab === 'dashboard' && (
                        <Button variant="outline" size="sm" onClick={fetchDashboard} className="ml-auto flex bg-white hover:bg-slate-50 shadow-sm">
                            <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
                        </Button>
                    )}

                    {activeTab === 'daily' && (
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end w-full lg:w-auto lg:min-w-[700px]">
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-slate-500">Date</Label>
                                <Input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} className="w-full text-sm h-9 bg-white border-slate-200" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-slate-500">Staff</Label>
                                <Select value={staffFilter} onValueChange={setStaffFilter}>
                                    <SelectTrigger className="w-full text-sm h-9 bg-white border-slate-200"><SelectValue placeholder="All Staff" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Staff</SelectItem>
                                        {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-slate-500">Location</Label>
                                <Select value={locationFilter} onValueChange={setLocationFilter}>
                                    <SelectTrigger className="w-full text-sm h-9 bg-white border-slate-200"><SelectValue placeholder="All Locations" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Locations</SelectItem>
                                        {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col justify-end">
                                <span className="text-xs invisible h-4 select-none mb-1">Export</span>
                                <Button onClick={exportDailyCSV} size="sm" variant="outline" className="w-full h-9 bg-white hover:bg-slate-50 shadow-sm">
                                    <Download className="h-4 w-4 mr-1.5" />Export CSV
                                </Button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'monthly' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end w-full lg:w-auto lg:min-w-[500px]">
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-slate-500">From Date</Label>
                                <Input type="date" value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)} className="text-sm h-9 bg-white border-slate-200" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-slate-500">To Date</Label>
                                <Input type="date" value={monthTo} onChange={(e) => setMonthTo(e.target.value)} className="text-sm h-9 bg-white border-slate-200" />
                            </div>
                            <div className="flex flex-col justify-end">
                                <span className="text-xs invisible h-4 select-none mb-1">Export</span>
                                <Button onClick={exportMonthlyCSV} size="sm" variant="outline" className="w-full h-9 bg-white hover:bg-slate-50 shadow-sm">
                                    <Download className="h-4 w-4 mr-1.5" />Export CSV
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ===== DASHBOARD TAB ===== */}
            {activeTab === 'dashboard' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-800">Today&apos;s Overview</h2>
                    </div>
                    {summaryLoading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                            <Card className="border border-slate-200 shadow-sm">
                                <CardContent className="p-4 flex items-center gap-3">
                                    <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center">
                                        <Users className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-slate-900">{summary.totalEmployees}</p>
                                        <p className="text-xs text-slate-500">Total Employees</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="border border-emerald-200 shadow-sm bg-emerald-50/30">
                                <CardContent className="p-4 flex items-center gap-3">
                                    <div className="h-11 w-11 rounded-xl bg-emerald-100 flex items-center justify-center">
                                        <UserCheck className="h-5 w-5 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-emerald-700">{summary.presentToday}</p>
                                        <p className="text-xs text-slate-500">Present</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="border border-red-200 shadow-sm bg-red-50/30">
                                <CardContent className="p-4 flex items-center gap-3">
                                    <div className="h-11 w-11 rounded-xl bg-red-100 flex items-center justify-center">
                                        <UserX className="h-5 w-5 text-red-500" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-red-600">{summary.absentToday}</p>
                                        <p className="text-xs text-slate-500">Absent</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="border border-amber-200 shadow-sm bg-amber-50/30">
                                <CardContent className="p-4 flex items-center gap-3">
                                    <div className="h-11 w-11 rounded-xl bg-amber-100 flex items-center justify-center">
                                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-amber-600">{summary.lateToday}</p>
                                        <p className="text-xs text-slate-500">Late</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="border border-purple-200 shadow-sm bg-purple-50/30">
                                <CardContent className="p-4 flex items-center gap-3">
                                    <div className="h-11 w-11 rounded-xl bg-purple-100 flex items-center justify-center">
                                        <Calendar className="h-5 w-5 text-purple-600" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-purple-600">{summary.onLeave}</p>
                                        <p className="text-xs text-slate-500">On Leave</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            )}

            {/* ===== DAILY REPORT TAB ===== */}
            {activeTab === 'daily' && (
                <div className="space-y-4">

                    {/* Summary mini-cards */}
                    <div className="grid grid-cols-4 gap-3">
                        <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
                            <p className="text-lg font-bold text-slate-900">{dailySummary.total}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-medium">Total</p>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                            <p className="text-lg font-bold text-emerald-700">{dailySummary.present}</p>
                            <p className="text-[10px] text-emerald-500 uppercase font-medium">Present</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                            <p className="text-lg font-bold text-amber-600">{dailySummary.late}</p>
                            <p className="text-[10px] text-amber-500 uppercase font-medium">Late</p>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                            <p className="text-lg font-bold text-red-600">{dailySummary.absent}</p>
                            <p className="text-[10px] text-red-400 uppercase font-medium">Absent</p>
                        </div>
                    </div>

                    {/* Table */}
                    <Card className="border border-slate-200 shadow-sm">
                        <CardContent className="p-0">
                            {dailyLoading ? (
                                <div className="flex items-center justify-center py-16">
                                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50">
                                                <TableHead className="font-semibold text-slate-600">Emp Code</TableHead>
                                                <TableHead className="font-semibold text-slate-600">Name</TableHead>
                                                <TableHead className="font-semibold text-slate-600">Check In</TableHead>
                                                <TableHead className="font-semibold text-slate-600">Check Out</TableHead>
                                                <TableHead className="font-semibold text-slate-600">Location</TableHead>
                                                <TableHead className="font-semibold text-slate-600">Status</TableHead>
                                                <TableHead className="font-semibold text-slate-600">GPS</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {dailyRows.map((row, idx) => (
                                                <TableRow key={idx} className={
                                                    row.status === 'ABSENT' ? 'bg-red-50/30' : 
                                                    row.status === 'LATE' ? 'bg-amber-50/30' : ''
                                                }>
                                                    <TableCell className="font-mono text-xs text-slate-600">
                                                        {row.employeeCode || '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <p className="font-medium text-slate-900 text-sm">{row.employeeName || 'Unknown'}</p>
                                                        <p className="text-xs text-slate-400">{row.mobile || ''}</p>
                                                    </TableCell>
                                                    <TableCell>
                                                        {row.checkIn ? (
                                                            <div className="flex items-center gap-1">
                                                                <Clock className="h-3 w-3 text-emerald-500" />
                                                                <span className="text-sm font-mono text-slate-700">{formatTime(row.checkIn)}</span>
                                                            </div>
                                                        ) : <span className="text-slate-300 text-sm">-</span>}
                                                    </TableCell>
                                                    <TableCell>
                                                        {row.checkOut ? (
                                                            <div className="flex items-center gap-1">
                                                                <Clock className="h-3 w-3 text-orange-500" />
                                                                <span className="text-sm font-mono text-slate-700">{formatTime(row.checkOut)}</span>
                                                            </div>
                                                        ) : <span className="text-slate-300 text-sm">-</span>}
                                                    </TableCell>
                                                    <TableCell className="text-sm text-slate-600">
                                                        {row.locationName ? (
                                                            <div className="flex items-center gap-1">
                                                                <MapPin className="h-3 w-3 text-blue-500" />
                                                                {row.locationName}
                                                            </div>
                                                        ) : '-'}
                                                    </TableCell>
                                                    <TableCell>{statusBadge(row.status)}</TableCell>
                                                    <TableCell>
                                                        {row.latitude ? (
                                                            <a
                                                                href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`}
                                                                target="_blank" rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-mono"
                                                            >
                                                                {parseFloat(row.latitude).toFixed(4)},{parseFloat(row.longitude).toFixed(4)}
                                                                <ExternalLink className="h-3 w-3" />
                                                            </a>
                                                        ) : '-'}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ===== MONTHLY REPORT TAB ===== */}
            {activeTab === 'monthly' && (
                <div className="space-y-4">

                    {monthlyTotalDays > 0 && (
                        <p className="text-xs text-slate-400">
                            Period: {monthFrom} to {monthTo} ({monthlyTotalDays} days)
                        </p>
                    )}

                    {/* Table */}
                    <Card className="border border-slate-200 shadow-sm">
                        <CardContent className="p-0">
                            {monthlyLoading ? (
                                <div className="flex items-center justify-center py-16">
                                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                                </div>
                            ) : monthlyRows.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                                    <ClipboardCheck className="h-12 w-12 mb-3" />
                                    <p className="text-lg font-medium text-slate-600">No data for this period</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50">
                                                <TableHead className="font-semibold text-slate-600">Emp Code</TableHead>
                                                <TableHead className="font-semibold text-slate-600">Name</TableHead>
                                                <TableHead className="font-semibold text-slate-600 text-center">Present</TableHead>
                                                <TableHead className="font-semibold text-slate-600 text-center">Absent</TableHead>
                                                <TableHead className="font-semibold text-slate-600 text-center">Late</TableHead>
                                                <TableHead className="font-semibold text-slate-600 text-center">Total Days</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {monthlyRows.map((row, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell className="font-mono text-xs text-slate-600">{row.employeeCode || '-'}</TableCell>
                                                    <TableCell>
                                                        <p className="font-medium text-slate-900 text-sm">{row.employeeName || 'Unknown'}</p>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 font-bold text-sm">
                                                            {row.presentDays}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-50 text-red-600 font-bold text-sm">
                                                            {row.absentDays}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-50 text-amber-600 font-bold text-sm">
                                                            {row.lateDays}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-center text-sm text-slate-500 font-mono">{row.totalDays}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
