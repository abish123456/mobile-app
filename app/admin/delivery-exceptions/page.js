'use client';

import { useState, useEffect } from 'react';
import { adminFetch } from '../../../lib/admin-api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import { Loader2, AlertCircle, RefreshCw, User, Calendar as CalendarIcon, MapPin, Truck, ChevronLeft, ChevronRight, X, Plus, UserPlus, Search, XCircle } from 'lucide-react';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Input } from '../../../components/ui/input';
import { DatePicker } from '../../../components/ui/date-picker';
import { format, subDays } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import toast from 'react-hot-toast';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { Calendar } from '../../../components/ui/calendar';
import { cn } from '../../../lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '../../../components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../../components/ui/select';

export default function NotDeliveredPage() {
    const [orders, setOrders] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [deliveryBoys, setDeliveryBoys] = useState([]);
    const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'reassigned'
    const [selectedDate, setSelectedDate] = useState(subDays(new Date(), 1));
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Reassign state
    const [showReassignDialog, setShowReassignDialog] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [selectedDeliveryBoyId, setSelectedDeliveryBoyId] = useState('');
    const [reassignDate, setReassignDate] = useState(new Date());
    const [isReassigning, setIsReassigning] = useState(false);
    const [isReassignDatePickerOpen, setIsReassignDatePickerOpen] = useState(false);
    const [holidayDates, setHolidayDates] = useState(new Set());
    const [weeklyOffDays, setWeeklyOffDays] = useState(new Set());



    useEffect(() => {
        fetchOrders();
    }, [activeTab, selectedDate, debouncedSearch]);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 500);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    useEffect(() => {
        fetchDeliveryBoys();
        fetchConfig();
 
        const intervalId = setInterval(() => {
            fetchOrders();
        }, 60000);
 
        return () => clearInterval(intervalId);
    }, [activeTab, selectedDate]);

    const fetchConfig = async () => {
        try {
            const res = await fetch('/shop/api/config', { cache: 'no-store' });
            const data = await res.json();
            if (data.success && data.config) {
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

    const fetchOrders = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                tab: activeTab,
                ...(selectedDate && { date: format(selectedDate, 'yyyy-MM-dd') }),
                ...(debouncedSearch && { search: debouncedSearch })
            });
            const response = await adminFetch(`/api/admin/orders/not-delivered?${params.toString()}`);
            const data = await response.json();
            if (data.success) {
                setOrders(data.orders);
                // Signal that data has been refreshed
                window.dispatchEvent(new CustomEvent('admin-data-refreshed'));
            } else {
                setError(data.message || 'Failed to fetch orders');
            }
        } catch (err) {
            console.error('Error fetching orders:', err);
            setError('Network error');
        } finally {
            setIsLoading(false);
        }
    };

    const totalPages = Math.ceil(orders.length / itemsPerPage);
    const paginatedOrders = orders.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, selectedDate]);

    const fetchDeliveryBoys = async () => {
        try {
            const response = await adminFetch('/api/admin/delivery-boys');
            const data = await response.json();
            if (data.success) {
                setDeliveryBoys(data.deliveryBoys || []);
            }
        } catch (err) {
            console.error('Error fetching delivery staff:', err);
        }
    };

    const handleResetFilters = () => {
        setSearchQuery('');
        setSelectedDate(subDays(new Date(), 1));
        setCurrentPage(1);
        if (!searchQuery && format(selectedDate, 'yyyy-MM-dd') === format(subDays(new Date(), 1), 'yyyy-MM-dd')) {
            fetchOrders();
        }
    };

    const handleReassignClick = async (order) => {
        setSelectedOrder(order);
        setSelectedDeliveryBoyId(''); // Reset selection
        
        // Find next working day for reassignment
        const today = new Date();
        today.setHours(0,0,0,0);
        try {
            const res = await fetch(`/shop/api/config`, { cache: 'no-store' });
            const data = await res.json();
            // Use order's deliveryDate or today as base? 
            // Usually reassign is for "ASAP" (tomorrow)
            setReassignDate(new Date()); 
        } catch (e) {}

        setShowReassignDialog(true);
    };

    const handleReassignConfirm = async () => {
        if (!selectedOrder || !reassignDate) {
            toast.error("Please select a date");
            return;
        }

        setIsReassigning(true);
        try {
            const response = await adminFetch('/api/admin/orders/reassign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: selectedOrder.id,
                    newDate: reassignDate,
                }),
            });

            const data = await response.json();

            if (data.success) {
                toast.success('Order reassigned successfully');
                setShowReassignDialog(false);
                setActiveTab('reassigned'); // Navigate to Reassigned tab
            } else {
                toast.error(data.message || 'Failed to reassign order');
            }
        } catch (err) {
            console.error('Error reassigning order:', err);
            toast.error('Network error. Please try again.');
        } finally {
            setIsReassigning(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                {/* <div>
                    <h1 className="text-3xl font-bold">Not Delivered Orders</h1>
                    <p className="text-muted-foreground">Manage orders that failed delivery</p>
                </div> */}
                {/* Custom Tabs */}
                <div className="flex space-x-1 rounded-lg bg-gray-100 p-1 w-fit">
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'pending'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900'
                            }`}
                    >
                        Not Delivered
                    </button>
                    <button
                        onClick={() => setActiveTab('reassigned')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'reassigned'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500 hover:text-gray-900'
                            }`}
                    >
                        Reassigned
                    </button>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search name or mobile..."
                            className="pl-9 h-9 border-slate-200 focus-visible:ring-primary shadow-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <XCircle className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <DatePicker 
                            date={selectedDate}
                            setDate={setSelectedDate}
                            placeholder="Filter by Date"
                            className="w-[160px] h-9"
                            disabled={(date) => {
                                // Holiday check
                                const istDateStr = new Intl.DateTimeFormat('en-CA', {
                                    timeZone: 'Asia/Kolkata',
                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                }).format(date);
                                if (holidayDates.has(istDateStr)) return true;

                                // Weekly off check
                                const weekdayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
                                    new Intl.DateTimeFormat('en-US', {
                                        timeZone: 'Asia/Kolkata', weekday: 'short',
                                    }).format(date)
                                );
                                if (weeklyOffDays.has(weekdayIdx)) return true;

                                return false;
                            }}
                        />
                        {selectedDate && (
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => setSelectedDate(null)}
                                className="h-9 w-9 text-slate-400 hover:text-slate-600 shrink-0"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleResetFilters}
                            className="h-9 px-3 gap-1.5"
                            disabled={isLoading}
                        >
                            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Reset
                        </Button>
                    </div>
                </div>
            </div>



            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>{activeTab === 'pending' ? 'Failed Deliveries' : 'Reassigned Orders'}</CardTitle>
                    <CardDescription>{orders.length} orders found</CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
                    ) : orders.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">No orders found.</div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-gray-50">
                                        <TableHead>Order Id</TableHead>
                                        <TableHead>Customer Info</TableHead>
                                        <TableHead>Address</TableHead>
                                        {activeTab === 'pending' ? (
                                            <>
                                                <TableHead>Order Date & Time</TableHead>
                                                <TableHead>Failed Reason</TableHead>
                                                <TableHead>Assigned To</TableHead>
                                                <TableHead>Actions</TableHead>
                                            </>
                                        ) : (
                                            <>
                                                {/* <TableHead>Reassign Time</TableHead> */}
                                                <TableHead>Last Assigned To</TableHead>
                                                <TableHead>Now Assigned To</TableHead>
                                                <TableHead>Delivery Status</TableHead>
                                            </>
                                        )}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginatedOrders.map((order) => (
                                        <TableRow key={order.id}>
                                            <TableCell className="align-top">
                                                <div className="font-bold text-sm">#{order.orderNumber || order.id.slice(-8).toUpperCase()}</div>
                                                {/* <div className="text-[10px] opacity-70">ID: {order.id.slice(-8).toUpperCase()}</div> */}
                                                {/* {activeTab === 'pending' && (
                                                    <>
                                                        <div className="text-xs text-gray-500 mb-1">
                                                            {order.createdAt ? formatInTimeZone(new Date(order.createdAt), 'Asia/Kolkata', 'dd MMM yyyy') : '-'}
                                                        </div>
                                                        <div className="text-xs text-gray-600">
                                                            Qty: {order.product.quantity} | ₹{order.product.amount}
                                                        </div>
                                                    </>
                                                )} */}
                                            </TableCell>

                                            <TableCell className="align-top max-w-[150px] whitespace-normal break-words">
                                                        <div className="font-medium text-sm">{order.customer.name}</div>
                                                        <div className="text-xs text-gray-500">{order.customer.phone}</div>
                                                        {/* <div className="text-xs text-gray-400 font-mono mt-0.5">
                                                            {order.customer.id.slice(-8).toUpperCase()}
                                                        </div> */}
                                                    </TableCell>
                                                    <TableCell className="max-w-[200px] text-xs text-gray-600 align-top whitespace-normal break-words">
                                                        <div className="space-y-1">
                                                            <p>{order.address.line1}</p>
                                                            <p>{order.address.area}</p>
                                                            <p>{order.address.city} - {order.address.pincode}</p>
                                                        </div>
                                                    </TableCell>

                                            {activeTab === 'pending' ? (
                                                <>
                                                    <TableCell className="align-top">
                                                        <div className="text-sm text-gray-900 font-medium">
                                                            {order.createdAt ? formatInTimeZone(new Date(order.createdAt), 'Asia/Kolkata', 'dd MMM yyyy, hh:mm a') : '-'}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="align-top max-w-[180px] whitespace-normal break-words">
                                                        <div className="text-gray-900 text-sm font-medium">
                                                            {order.notDeliveredReason}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                            <CalendarIcon className="h-3 w-3" />
                                                            {order.deliveryDate ? formatInTimeZone(new Date(order.deliveryDate), 'Asia/Kolkata', 'dd MMM') : '-'}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="align-top">
                                                        <div className="flex items-center gap-2 text-sm text-gray-700">
                                                            <User className="h-3 w-3 text-gray-400" />
                                                            {order.previousDeliveryBoy}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="align-top">
                                                        {!order.activeRouteId ? (
                                                            <div className="flex items-center text-xs text-gray-500 italic font-medium">
                                                                <AlertCircle className="h-3 w-3 mr-1.5 shrink-0" />
                                                                Create Route for {order.address.pincode}
                                                            </div>
                                                        ) : (order.activeRouteId && (order.lastDeliveryBoy === 'Unassigned' || !order.lastDeliveryBoy || order.lastDeliveryBoy === 'Unknown')) ? (
                                                            <div className="flex items-center text-xs text-gray-500 italic font-medium">
                                                                <AlertCircle className="h-3 w-3 mr-1.5 shrink-0" />
                                                                Assign Staff to {order.activeRouteName}
                                                            </div>
                                                        ) : (
                                                            <Button
                                                                size="sm"
                                                                className="bg-orange-600 hover:bg-orange-700 text-white h-7 text-xs"
                                                                onClick={() => handleReassignClick(order)}
                                                            >
                                                                <Truck className="h-3 w-3 mr-1.5" />
                                                                Reassign
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </>
                                            ) : (
                                                <>
                                                    {/* <TableCell className="align-top">
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {order.reassignedAt ? formatInTimeZone(new Date(order.reassignedAt), 'Asia/Kolkata', 'dd MMM, hh:mm a') : '-'}
                                                        </div>
                                                    </TableCell> */}
                                                    <TableCell className="align-top">
                                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                                            <User className="h-3 w-3" />
                                                            {order.previousDeliveryBoy}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="align-top">
                                                        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                                                            <User className="h-3 w-3 text-green-600" />
                                                            {order.lastDeliveryBoy}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1 ml-5">
                                                            {order.deliveryDate ? formatInTimeZone(new Date(order.deliveryDate), 'Asia/Kolkata', 'dd MMM') : '-'}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="align-top">
                                                        <Badge 
                                                            variant={order.status === 'DELIVERED' ? 'success' : order.status === 'CANCELLED' ? 'destructive' : 'secondary'}
                                                            className={cn(
                                                                "text-[10px] uppercase font-bold",
                                                                order.status === 'OUT_FOR_DELIVERY' && "bg-blue-100 text-blue-700 hover:bg-blue-100",
                                                                order.status === 'DELIVERED' && "bg-green-100 text-green-700 hover:bg-green-100",
                                                                order.status === 'PENDING' && "bg-yellow-100 text-yellow-700 hover:bg-yellow-100"
                                                            )}
                                                        >
                                                            {order.status?.replace(/_/g, ' ')}
                                                        </Badge>
                                                    </TableCell>
                                                </>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    {/* Pagination Controls */}
                    {!isLoading && totalPages > 1 && (
                        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
                            <span className="text-sm text-muted-foreground mr-2">
                                Showing {Math.min(orders.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(orders.length, currentPage * itemsPerPage)} of {orders.length}
                            </span>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage <= 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="text-sm font-medium">
                                Page {currentPage} of {totalPages}
                            </div>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage >= totalPages}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Reassign Dialog */}
            <Dialog open={showReassignDialog} onOpenChange={setShowReassignDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Reassign Order</DialogTitle>
                        <DialogDescription>
                            Assign Order #{selectedOrder?.orderNumber || selectedOrder?.id.slice(-8).toUpperCase()} to a delivery staff for retry.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        <label className="text-sm font-medium block">New Delivery Date</label>
                        <Popover open={isReassignDatePickerOpen} onOpenChange={setIsReassignDatePickerOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !reassignDate && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {reassignDate ? format(reassignDate, "PPP") : "Pick a date"}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={reassignDate}
                                    defaultMonth={reassignDate || new Date()}
                                    onSelect={(date) => {
                                        setReassignDate(date);
                                        if (date) setIsReassignDatePickerOpen(false);
                                    }}
                                    initialFocus
                                    disabled={(date) => {
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        if (date < today) return true;

                                        // Holiday check
                                        const istDateStr = new Intl.DateTimeFormat('en-CA', {
                                            timeZone: 'Asia/Kolkata',
                                            year: 'numeric', month: '2-digit', day: '2-digit',
                                        }).format(date);
                                        if (holidayDates.has(istDateStr)) return true;

                                        // Weekly off check
                                        const weekdayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
                                            new Intl.DateTimeFormat('en-US', {
                                                timeZone: 'Asia/Kolkata', weekday: 'short',
                                            }).format(date)
                                        );
                                        if (weeklyOffDays.has(weekdayIdx)) return true;

                                        return false;
                                    }}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Staff selection removed for automated route matching */}
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowReassignDialog(false)}>Cancel</Button>
                        <Button onClick={handleReassignConfirm} disabled={isReassigning}>
                            {isReassigning ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Reassign'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
