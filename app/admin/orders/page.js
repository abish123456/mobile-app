'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '../../../lib/admin-api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { Badge } from '../../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Calendar as CalendarComponent } from '../../../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { CalendarIcon, Package, Loader2, AlertCircle, Filter, RefreshCw, RotateCcw, User, Phone, MapPin, Calendar, CreditCard, Clock, Search, ChevronLeft, ChevronRight, Reply, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../components/ui/dialog';
import toast from 'react-hot-toast';
import AddressForm from '../../../components/app/AddressForm';

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [areas, setAreas] = useState([]);
  const [pincodes, setPincodes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reconcilingOrderId, setReconcilingOrderId] = useState(null);
  const [showReconcileDialog, setShowReconcileDialog] = useState(false);
  const [razorpayPaymentId, setRazorpayPaymentId] = useState('');
  const [isReconciling, setIsReconciling] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [isLoadingOrderDetails, setIsLoadingOrderDetails] = useState(false);

  const [deliveryBoys, setDeliveryBoys] = useState([]);

  // Reschedule state
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleOrder, setRescheduleOrder] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState(null);
  const [isRescheduleDatePickerOpen, setIsRescheduleDatePickerOpen] = useState(false);
  const [rescheduleConfirmation, setRescheduleConfirmation] = useState(false);

  // Reassign state
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassignOrder, setReassignOrder] = useState(null);
  const [selectedDeliveryBoyId, setSelectedDeliveryBoyId] = useState('');
  // const [selectedDeliveryBoyId, setSelectedDeliveryBoyId] = useState('');
  // const [selectedDeliveryBoyId, setSelectedDeliveryBoyId] = useState('');


  // Cancel state
  const [showCancelConfirmDialog, setShowCancelConfirmDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState(null);

  // Edit Address state
  const [showEditAddressDialog, setShowEditAddressDialog] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [orderToEditAddress, setOrderToEditAddress] = useState(null);
  const [editAddressData, setEditAddressData] = useState({});

  // Cleanup abandoned orders state
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });

  // Holiday/Weekly Off states
  const [holidayDates, setHolidayDates] = useState(new Set());
  const [weeklyOffDays, setWeeklyOffDays] = useState(new Set());


  // Filters - all optional, no defaults
  const [selectedDate, setSelectedDate] = useState(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState(null);
  const [isDeliveryDatePickerOpen, setIsDeliveryDatePickerOpen] = useState(false);
  const [selectedDeliveredDate, setSelectedDeliveredDate] = useState(null);
  const [isDeliveredDatePickerOpen, setIsDeliveredDatePickerOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState('ALL');
  const [selectedPincode, setSelectedPincode] = useState('ALL');
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState('ALL');
  const [selectedDeliveryStatus, setSelectedDeliveryStatus] = useState('ALL');
  const [filterDeliveryBoyId, setFilterDeliveryBoyId] = useState('ALL');
  const [selectedReason, setSelectedReason] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [reasons, setReasons] = useState([]);

  useEffect(() => {
    fetchOrders();
    fetchDeliveryBoys();
    fetchConfig();

    // Auto-refresh every 60 seconds (1 minute)
    const intervalId = setInterval(() => {
      fetchOrders();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [selectedDate, selectedDeliveryDate, selectedDeliveredDate, selectedArea, selectedPincode, selectedPaymentStatus, selectedDeliveryStatus, filterDeliveryBoyId, selectedReason, pagination.page, pagination.limit, searchQuery]);

  // Reset to page 1 when filters or search changes
  useEffect(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
  }, [selectedDate, selectedDeliveryDate, selectedDeliveredDate, selectedArea, selectedPincode, selectedPaymentStatus, selectedDeliveryStatus, filterDeliveryBoyId, selectedReason, searchQuery]);

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
    setError('');

    try {
      const params = new URLSearchParams({
        ...(selectedDate && { date: format(selectedDate, 'yyyy-MM-dd') }),
        ...(selectedDeliveryDate && { deliveryDate: format(selectedDeliveryDate, 'yyyy-MM-dd') }),
        ...(selectedDeliveredDate && { deliveredDate: format(selectedDeliveredDate, 'yyyy-MM-dd') }),
        ...(selectedArea !== 'ALL' && { area: selectedArea }),
        ...(selectedPincode !== 'ALL' && { pincode: selectedPincode }),
        ...(selectedPaymentStatus !== 'ALL' && { paymentStatus: selectedPaymentStatus }),
        ...(selectedDeliveryStatus !== 'ALL' && { deliveryStatus: selectedDeliveryStatus }),
        ...(filterDeliveryBoyId !== 'ALL' && { deliveryBoyId: filterDeliveryBoyId }),
        ...(selectedReason !== 'ALL' && { reason: selectedReason }),
        ...(searchQuery.trim() && { search: searchQuery.trim() }),
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      const response = await adminFetch(`/api/admin/orders?${params.toString()}`);
      const data = await response.json();

      if (data.success) {

        // Data is already sorted by backend DESC
        setOrders(data.orders || []);
        setAreas(data.areas || []);
        setPincodes(data.pincodes || []);
        if (data.reasons) setReasons(data.reasons);

        if (data.pagination) {
          setPagination(prev => ({
            ...prev,
            page: data.pagination.page,
            limit: data.pagination.limit,
            total: data.pagination.total,
            totalPages: data.pagination.totalPages,
          }));
        }
        // Signal that data has been refreshed
        window.dispatchEvent(new CustomEvent('admin-data-refreshed'));
      } else {
        setError(data.message || 'Failed to fetch orders');
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return formatInTimeZone(new Date(dateString), 'Asia/Kolkata', 'MMM dd, yyyy');
  };

  const formatTime = (dateString) => {
    if (!dateString) return 'N/A';
    return formatInTimeZone(new Date(dateString), 'Asia/Kolkata', 'h:mm a');
  };

  const formatDeliverySlot = (slot) => {
    return slot
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getStatusBadge = (status) => {
    const variants = {
      PENDING: 'secondary',
      CONFIRMED: 'warning',
      OUT_FOR_DELIVERY: 'default',
      DELIVERED: 'success',
      CANCELLED: 'destructive',
      NOT_DELIVERED: 'orange',
    };
    return variants[status] || 'secondary';
  };

  const getPaymentStatusBadge = (status) => {
    const variants = {
      PENDING: 'secondary',
      SUCCESS: 'default',
      FAILED: 'destructive',
    };
    return variants[status] || 'secondary';
  };

  const handleResetFilters = () => {
    setSelectedDate(null);
    setSelectedDeliveryDate(null);
    setSelectedArea('ALL');
    setSelectedPincode('ALL');
    setSelectedPaymentStatus('ALL');
    setSelectedDeliveryStatus('ALL');
    setFilterDeliveryBoyId('ALL');
    setSelectedReason('ALL');
    setSelectedDeliveredDate(null);
    setSearchQuery('');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    setPagination(prev => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReconcileClick = (orderId) => {
    setReconcilingOrderId(orderId);
    setRazorpayPaymentId('');
    setShowReconcileDialog(true);
  };

  const handleOrderClick = async (order) => {
    setSelectedOrder(order);
    setShowOrderDialog(true);
    setIsLoadingOrderDetails(true);


    try {
      // Fetch full order details including address
      const response = await adminFetch(`/api/admin/orders/${order.id}`);
      const data = await response.json();

      if (data.success && data.order) {
        setSelectedOrder(data.order);
      } else {
        toast.error('Failed to load order details');
        setShowOrderDialog(false);
      }
    } catch (err) {
      console.error('Error fetching order details:', err);
      console.error('Error fetching order details:', err);
      toast.error('Failed to load order details');
      setShowOrderDialog(false);
    } finally {
      setIsLoadingOrderDetails(false);
    }
  };

  const handleReconcileConfirm = async () => {
    if (!reconcilingOrderId) return;

    setIsReconciling(true);
    try {
      const response = await adminFetch('/api/payments/reconcile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: reconcilingOrderId,
          ...(razorpayPaymentId.trim() && { razorpayPaymentId: razorpayPaymentId.trim() }),
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Order reconciled successfully!`);
        setShowReconcileDialog(false);
        setReconcilingOrderId(null);
        setRazorpayPaymentId('');
        // Refresh orders to show updated status
        await fetchOrders();
      } else {
        toast.error(data.message || 'Failed to reconcile order');
      }
    } catch (err) {
      console.error('Error reconciling order:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsReconciling(false);
    }
  };

  const openRescheduleDialog = (order) => {
    setRescheduleOrder(order);
    // Set the initial date to the order's existing delivery date
    setRescheduleDate(order.deliveryDate ? new Date(order.deliveryDate) : new Date());
    setRescheduleConfirmation(false); // Reset confirmation
    setShowRescheduleDialog(true);
  };

  const handleRescheduleConfirm = async () => {
    if (!rescheduleOrder || !rescheduleDate) {
      toast.error("Please select a date");
      return;
    }

    setIsRescheduling(true);
    try {
      const response = await adminFetch('/api/admin/orders/reschedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: rescheduleOrder.id,
          date: format(rescheduleDate, 'yyyy-MM-dd'),
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Order rescheduled successfully');

        // SMS notification part is implicit in success message or can be appended if critical
        // if (data.smsSent) { toast.success('Order rescheduled & SMS sent'); }

        setShowRescheduleDialog(false);
        setShowOrderDialog(false); // Close details dialog too
        fetchOrders(); // Refresh list
      } else {
        toast.error(data.message || 'Failed to reschedule order');
      }
    } catch (err) {
      console.error('Error rescheduling order:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsRescheduling(false);
    }
  };

  const openReassignDialog = (order) => {
    setReassignOrder(order);
    // Pre-select current delivery boy if assigned
    if (order.assignedDeliveryBoy && order.assignedDeliveryBoy.id) {
      setSelectedDeliveryBoyId(order.assignedDeliveryBoy.id);
    } else {
      setSelectedDeliveryBoyId('');
    }
    setShowReassignDialog(true);
  };

  // Always ensure orders are sorted before rendering (by UTC timestamp)
  const sortedOrders = useMemo(() => {
    return orders; // Already sorted by backend DESC
  }, [orders]);

  const handleReassignConfirm = async () => {
    if (!reassignOrder || !selectedDeliveryBoyId) {
      toast.error("Please select a delivery person");
      return;
    }

    setIsReassigning(true);
    try {
      const response = await adminFetch('/api/admin/orders/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: reassignOrder.id,
          deliveryBoyId: selectedDeliveryBoyId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Show success message below refresh button
        toast.success('Order reassigned successfully');

        setShowReassignDialog(false);
        setShowOrderDialog(false);
        fetchOrders();
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

  const handleCancelOrder = async () => {
    if (!orderToCancel) return;

    setIsCancelling(true);
    try {
      const response = await adminFetch(`/api/admin/orders/${orderToCancel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CANCEL' }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Order cancelled successfully');
        setShowCancelConfirmDialog(false);
        setOrderToCancel(null);
        setShowOrderDialog(false);
        fetchOrders(); // Refresh the list
      } else {
        toast.error(data.message || 'Failed to cancel order');
      }
    } catch (err) {
      console.error('Error cancelling order:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  const openCancelConfirm = (order) => {
    setOrderToCancel(order);
    setShowCancelConfirmDialog(true);
  };

  const openEditAddressDialog = (order) => {
    setOrderToEditAddress(order);
    setEditAddressData({
      ...order.address,
      addressLine1: order.address.line1,
      addressLine2: order.address.line2,
    });
    setShowEditAddressDialog(true);
  };

  const handleUpdateAddress = async () => {
    if (!orderToEditAddress) return;

    // Simple validation (similar to customer side but basic here since AddressForm has its own)
    if (!editAddressData.addressLine1 || !editAddressData.pincode || !editAddressData.area || !editAddressData.latitude || !editAddressData.longitude) {
      toast.error("Please fill all required fields and pin the location on map");
      return;
    }

    setIsSavingAddress(true);
    try {
      const response = await adminFetch(`/api/admin/orders/${orderToEditAddress.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_ADDRESS',
          address: editAddressData
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Address updated and route recalculated');
        setShowEditAddressDialog(false);
        fetchOrders(); // Refresh the list to see new staff/route
      } else {
        toast.error(data.message || 'Failed to update address');
      }
    } catch (err) {
      console.error('Error updating address:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleCleanupAbandoned = async () => {
    setIsCleaningUp(true);
    try {
      const response = await adminFetch('/api/admin/orders/cleanup-abandoned', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        toast.success(data.message || 'Cleaned up abandoned orders');
        setShowCleanupDialog(false);
        fetchOrders();
      } else {
        toast.error(data.message || 'Failed to cleanup orders');
      }
    } catch (err) {
      console.error('Error cleaning up orders:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsCleaningUp(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Orders & Deliveries</h1>
          <p className="text-muted-foreground">View and manage all orders & deliveries</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
          <div className="relative flex-grow sm:flex-grow-0">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search Order ID, Name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 w-full sm:w-[250px]"
            />
          </div>
          {/* <Button onClick={() => setShowCleanupDialog(true)} variant="destructive" size="sm" disabled={isLoading || isCleaningUp} className="w-full sm:w-auto">
            <Trash2 className={cn("h-4 w-4 mr-2", isCleaningUp && "animate-spin")} />
            Cleanup Abandoned
          </Button> */}
          <Button onClick={fetchOrders} variant="outline" size="sm" disabled={isLoading} className="w-full sm:w-auto">
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
          <Button onClick={handleResetFilters} variant="outline" size="sm">
            Reset Filters
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 pb-4">


            {/* Ordered Date Picker */}
            <div className="space-y-2 w-full">
              <Label>Ordered Date</Label>
              <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "All Dates"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date);
                        setIsDatePickerOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Expected Delivery Date Picker */}
            <div className="space-y-2 w-full">
              <Label>Exp Delivery Date</Label>
              <Popover open={isDeliveryDatePickerOpen} onOpenChange={setIsDeliveryDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal border-2 border-primary/20",
                      !selectedDeliveryDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDeliveryDate ? format(selectedDeliveryDate, "PPP") : "All Dates"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDeliveryDate}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDeliveryDate(date);
                        setIsDeliveryDatePickerOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Delivered Date Picker */}
            <div className="space-y-2 w-full">
              <Label>Delivered Date</Label>
              <Popover open={isDeliveredDatePickerOpen} onOpenChange={setIsDeliveredDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal border-2 border-primary/20",
                      !selectedDeliveredDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDeliveredDate ? format(selectedDeliveredDate, "PPP") : "All Dates"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDeliveredDate}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDeliveredDate(date);
                        setIsDeliveredDatePickerOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Area Filter */}
            {/* <div className="space-y-2">
              <Label>Area</Label>
              <Select value={selectedArea} onValueChange={setSelectedArea}>
                <SelectTrigger>
                  <SelectValue placeholder="All Areas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Areas</SelectItem>
                  {areas.map((area) => (
                    <SelectItem key={area} value={area}>
                      {area}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div> */}

            {/* Pincode Filter */}
            <div className="space-y-2 w-full">
              <Label>Pincode</Label>
              <Select value={selectedPincode} onValueChange={setSelectedPincode}>
                <SelectTrigger className="w-full border-2 border-primary/20 bg-background shadow-sm hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:border-primary/40 hover:text-black transition-all">
                  <SelectValue placeholder="All Pincodes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Pincodes</SelectItem>
                  {pincodes.map((pc) => (
                    <SelectItem key={pc} value={pc}>
                      {pc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Status Filter */}
            <div className="space-y-2 w-full">
              <Label>Payment Status</Label>
              <Select value={selectedPaymentStatus} onValueChange={setSelectedPaymentStatus}>
                <SelectTrigger className="w-full border-2 border-primary/20 bg-background shadow-sm hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:border-primary/40 hover:text-black transition-all">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Delivery Status Filter */}
            <div className="space-y-2 w-full">
              <Label>Order Status</Label>
              <Select value={selectedDeliveryStatus} onValueChange={setSelectedDeliveryStatus}>
                <SelectTrigger className="w-full border-2 border-primary/20 bg-background shadow-sm hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:border-primary/40 hover:text-black transition-all">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="ORDER_RECEIVED">Order Received</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                  <SelectItem value="DELIVERY_IN_PROGRESS">Delivery in Progress</SelectItem>
                  <SelectItem value="DELIVERED">Delivered</SelectItem>
                  <SelectItem value="NOT_DELIVERED">Not Delivered</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Delivery Boy Filter */}
            <div className="space-y-2 w-full">
              <Label>Delivery Staff</Label>
              <Select value={filterDeliveryBoyId} onValueChange={setFilterDeliveryBoyId}>
                <SelectTrigger className="w-full border-2 border-primary/20 bg-background shadow-sm hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:border-primary/40 hover:text-black transition-all">
                  <SelectValue placeholder="All Delivery Staff" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Delivery Staffs</SelectItem>
                  {deliveryBoys
                    .filter(db => db.active) // Ensure we only show active ones if needed, or all
                    .map((db) => (
                      <SelectItem key={db.id} value={db.id}>
                        {db.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Delivery Reason Filter */}
            <div className="space-y-2 w-full">
              <Label>Delivery Reason</Label>
              <Select value={selectedReason} onValueChange={setSelectedReason}>
                <SelectTrigger className="w-full border-2 border-primary/20 bg-background shadow-sm hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:border-primary/40 hover:text-black transition-all">
                  <SelectValue placeholder="All Reasons" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Reasons</SelectItem>
                  {reasons.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>


        </CardContent>
      </Card>

      {/* Error Alert */}
      {
        error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )
      }

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Orders List</CardTitle>
          {/* <CardDescription>
            {sortedOrders.length} order{sortedOrders.length !== 1 ? 's' : ''} found
          </CardDescription> */}
        </CardHeader>
        <CardContent>
          {(isLoading && sortedOrders.length === 0) ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : sortedOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No orders found</h3>
              <p className="text-muted-foreground">
                {selectedDate || selectedDeliveryDate || selectedDeliveredDate || selectedArea !== 'ALL' || selectedPincode !== 'ALL' || selectedPaymentStatus !== 'ALL' || selectedDeliveryStatus !== 'ALL' || filterDeliveryBoyId !== 'ALL'
                  ? 'Try adjusting your filters to see more orders.'
                  : 'No orders have been placed yet.'}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile View: Cards */}
              <div className="md:hidden space-y-4">
                {sortedOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-lg border shadow-sm p-4 space-y-3 cursor-pointer active:scale-[0.98] transition-all"
                    onClick={() => handleOrderClick(order)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">#{order.orderNumber || 'PENDING'}</div>
                        <div className="font-bold text-lg leading-tight">{order.customer.name}</div>
                        <div className="text-sm text-muted-foreground">{order.customer.phone}</div>
                      </div>
                      <div className="flex flex-col items-end">
                        <Badge variant={getStatusBadge(order.status)} className="uppercase text-[10px] py-0.5">
                          {order.status.replace(/_/g, ' ')}
                        </Badge>
                        </div>
                      </div>


                    <div className="grid grid-cols-2 gap-4 text-sm border-t pt-3">
                      <div>
                        <div className="text-[11px] text-muted-foreground uppercase">Items</div>
                        <div className="font-medium mt-0.5">
                          {order.items && order.items.length > 0
                            ? `${order.items.length} ${order.items.length === 1 ? 'item' : 'items'}`
                            : order.productName || 'Water Can'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground uppercase">Amount</div>
                        <div className="font-bold text-primary mt-0.5">₹{Math.ceil(Number(order.amount))}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground uppercase">Ordered</div>
                        <div className="mt-0.5">{order.createdAtIST ? order.createdAtIST.split(',')[0] : 'N/A'}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground uppercase">Payment</div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={getPaymentStatusBadge(order.paymentStatus)} className="scale-90 origin-left">
                            {order.paymentStatus === 'SUCCESS' ? 'Paid' : 'Pending'}
                          </Badge>
                          {order.isQrPayment && (
                            <Badge variant="secondary" className="bg-purple-100 text-purple-700 border-purple-200 text-[8px] py-0 px-1 uppercase font-bold scale-90">
                              QR
                            </Badge>
                          )}
                        </div>
                      </div>
                      {order.status === 'NOT_DELIVERED' && order.notDeliveredReason && (
                        <div className="col-span-2 text-[10px] text-orange-600 font-semibold bg-orange-50 px-2 py-1.5 rounded border border-orange-100 italic whitespace-normal break-words mt-1">
                          Reason: {order.notDeliveredReason}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View: Table */}
              <div className={cn("hidden md:block rounded-md border overflow-x-auto transition-opacity", isLoading && "opacity-50 pointer-events-none")}>
                <div className="min-w-[1330px]">
                  {/* Fixed Header Table */}
                  <div className="bg-gray-50 border-b">
                    <Table className="table-fixed min-w-[1330px] [&>[data-slot=table-container]]:overflow-visible">
                      <TableHeader className="bg-gray-50">
                        <TableRow className="bg-gray-50 hover:bg-gray-50 border-0">
                          <TableHead className="text-center text-black py-4 w-[120px]">Order ID</TableHead>
                          <TableHead className="text-center text-black py-4 w-[220px]">Customer</TableHead>
                          <TableHead className="text-center text-black py-4 w-[180px]">Items</TableHead>
                          <TableHead className="text-center text-black py-4 w-[140px]">Ordered Date</TableHead>
                          <TableHead className="text-center text-black py-4 w-[140px]">Amount</TableHead>
                          <TableHead className="text-center text-black py-4 w-[200px]">Exp Delivery Date</TableHead>
                          <TableHead className="text-center text-black py-4 w-[100px]">Payment Type</TableHead>
                          <TableHead className="text-center text-black py-4 w-[80px]">Payment Status</TableHead>
                          <TableHead className="text-center text-black py-4 w-[150px]">Order Status</TableHead>
                        </TableRow>
                      </TableHeader>
                    </Table>
                  </div>

                  {/* Scrollable Body Table */}
                  <div className="overflow-y-auto max-h-[600px]">
                    <Table className="table-fixed min-w-[1330px] [&>[data-slot=table-container]]:overflow-visible">
                      <TableHeader className="h-0 invisible opacity-0 pointer-events-none">
                        <TableRow className="h-0 border-0">
                          <TableHead className="w-[120px] h-0 py-0 border-0"></TableHead>
                          <TableHead className="w-[220px] h-0 py-0 border-0"></TableHead>
                          <TableHead className="w-[180px] h-0 py-0 border-0"></TableHead>
                          <TableHead className="w-[140px] h-0 py-0 border-0"></TableHead>
                          <TableHead className="w-[140px] h-0 py-0 border-0"></TableHead>
                          <TableHead className="w-[200px] h-0 py-0 border-0"></TableHead>
                          <TableHead className="w-[100px] h-0 py-0 border-0"></TableHead>
                          <TableHead className="w-[80px] h-0 py-0 border-0"></TableHead>
                          <TableHead className="w-[150px] h-0 py-0 border-0"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedOrders.map((order) => (
                          <TableRow
                            key={order.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleOrderClick(order)}
                          >
                            <TableCell className="font-mono align-top w-[120px] whitespace-normal break-words text-center">
                              <div className="flex flex-col items-center group/btn gap-0.5">
                                <div className="flex items-center justify-center gap-1 w-full">
                                  <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-tight">#{order.orderNumber || 'PENDING'}</div>

                                  {/* Integrated Edit Action */}
                                  {!order.isRouteGenerated && (order.status !== 'DELIVERED' && order.status !== 'CANCELLED') && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-4 w-4 text-foreground hover:text-blue-600 hover:bg-blue-50/50 rounded-full transition-all opacity-50 group-hover/btn:opacity-100 hover:scale-125"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openEditAddressDialog(order);
                                            }}
                                          >
                                            <Pencil className="h-2.5 w-2.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-[10px]">Edit Address</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>

                                {order.dailyTotal > 1 && (
                                  <div className="text-[10px] text-muted-foreground/60">
                                    {order.dailyPosition}/{order.dailyTotal}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="align-top w-[220px] whitespace-normal break-words">
                              <div className="flex flex-col items-center group relative text-center">

                                <div className="font-medium">{order.customer.name}</div>

                                {order.address.contactName && order.address.contactName !== order.customer.name && (
                                  <div className="text-[11px] text-blue-600 font-medium leading-none my-0.5">
                                    {order.address.contactName}
                                  </div>
                                )}

                                <div className="text-sm text-muted-foreground">
                                  {order.customer.phone}
                                </div>

                                {/* Tooltip - right side */}
                                {order.address && (
                                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 hidden group-hover:block bg-gray-100 text-black border border-gray-200 shadow-lg text-xs rounded px-3 py-2 w-[250px] break-words z-50 whitespace-normal pointer-events-none">
                                    <p className="font-semibold mb-1">Address Details</p>
                                    <div className="space-y-0.5">
                                      <p>{order.address.line1}</p>
                                      {order.address.line2 && <p>{order.address.line2}</p>}
                                      <p>{order.address.area}, {order.address.city}</p>
                                      <p className="font-medium">{order.address.pincode}</p>
                                      {order.address.landmark && <p className="text-[10px] italic">Landmark: {order.address.landmark}</p>}
                                    </div>
                                  </div>
                                )}

                              </div>
                            </TableCell>
                            <TableCell className="align-top font-medium w-[180px]">
                              <div className="flex flex-col gap-1 mt-0.5 items-center">
                                {order.items && order.items.length > 0 ? (
                                  order.items.map((item, idx) => (
                                    <div key={idx} className="text-[11px] leading-tight flex items-center gap-2 py-0.5 border-b border-gray-50/50 last:border-0 last:pb-0">
                                      <span className="text-foreground/80 font-semibold">{item.productName}</span>
                                      <span className="text-[10px] text-muted-foreground font-bold bg-muted/50 px-1.5 py-0.5 rounded-sm">x{item.quantity}</span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-[11px] leading-tight flex items-center gap-2 py-0.5">
                                    <span className="text-foreground/80 font-semibold">{order.productName || 'Water Can'}</span>
                                    <span className="text-[10px] text-muted-foreground font-bold bg-muted/50 px-1.5 py-0.5 rounded-sm">x{order.quantity}</span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="align-top w-[140px] whitespace-normal break-words text-center">
                              {order.createdAtIST ? (
                                <div className="flex flex-col items-center">
                                  <div className="text-sm font-medium">
                                    {order.createdAtIST.split(',')[0]}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                                    {order.createdAtIST.split(',')[1]}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-sm">N/A</div>
                              )}
                            </TableCell>
                            <TableCell className="font-semibold align-top w-[140px] text-center">₹{Math.ceil(Number(order.amount))}</TableCell>
                            <TableCell className="align-top w-[200px] whitespace-normal break-words text-center">
                              <div className="text-sm flex flex-col items-center">
                                <div>{formatDate(order.deliveryDate)}</div>
                                {order.status === 'DELIVERED' && order.deliveredAtIST && (
                                  <div className="text-[11px] text-green-600 font-semibold mt-0.5">
                                    Delivered: {order.deliveredAtIST}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="align-top w-[100px] text-center">
                              <div className="flex flex-col items-center gap-1">
                                <Badge variant="outline" className="font-mono font-normal whitespace-normal text-center h-auto py-1">
                                  {order.paymentInstrument || (order.paymentMethod === 'COD' ? 'COD' : 'Online')}
                                </Badge>
                                {order.isQrPayment && (
                                  <Badge variant="secondary" className="bg-purple-100 text-purple-700 border-purple-200 text-[9px] py-0 px-1.5 h-4 uppercase font-bold">
                                    QR Paid
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="align-top w-[80px] text-center">
                              <div className="flex justify-center">
                                <Badge variant={getPaymentStatusBadge(order.paymentStatus)} className="whitespace-normal text-center h-auto py-1">
                                  {order.paymentStatus === 'SUCCESS' ? 'Paid' : order.paymentStatus === 'COD' ? 'Pending' : order.paymentStatus}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="align-top w-[150px] text-center">
                              <div className="flex items-center justify-center gap-2 flex-wrap">
                                <Badge variant={getStatusBadge(order.status)} className="whitespace-nowrap text-center h-auto py-0.5 px-2 text-[10px] uppercase font-medium tracking-wider">
                                  {/* Logic: 
                                    1. If PENDING (and Paid/COD) and NOT assigned -> "ORDER RECEIVED"
                                    2. If Assigned AND Route NOT Generated -> "CONFIRMED"
                                    3. If Assigned AND Route Generated -> "DELIVERY IN PROGRESS"
                                */}
                                  {(order.status === 'DELIVERED' || order.status === 'CANCELLED' || order.status === 'NOT_DELIVERED')
                                    ? order.status.replace(/_/g, ' ')
                                    : (order.status === 'OUT_FOR_DELIVERY' || order.isRouteGenerated)
                                      ? 'DELIVERY IN PROGRESS'
                                      : order.isAssigned
                                        ? 'CONFIRMED'
                                        : 'ORDER RECEIVED'}
                                </Badge>

                                {order.status === 'NOT_DELIVERED' && order.notDeliveredReason && (
                                  <div className="text-[10px] text-orange-600 font-semibold mt-1 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100 italic whitespace-normal break-words max-w-[130px]">
                                    {order.notDeliveredReason}
                                  </div>
                                )}
                                {order.isReassigned && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Reply className="h-4 w-4 text-amber-500" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Re-assigned</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                              {/* "NOT ASSIGNED" warning removed as requested */}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </>
          )
          }

          {/* Pagination Controls */}
          {!isLoading && pagination.total > 0 && (
            <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
              <Select
                value={pagination.limit.toString()}
                onValueChange={(value) => {
                  setPagination(prev => ({
                    ...prev,
                    limit: parseInt(value),
                    page: 1
                  }));
                }}
              >
                <SelectTrigger className="h-9 w-auto border-none shadow-none hover:bg-muted/50 transition-colors px-2 gap-2 focus:ring-0">
                  <div className="text-sm font-medium flex items-center gap-1">
                    <span>{Math.min(pagination.total, (pagination.page - 1) * pagination.limit + 1)}</span>
                    <span>-</span>
                    <span>{Math.min(pagination.total, pagination.page * pagination.limit)}</span>
                    <span className="mx-1 font-normal text-muted-foreground">of</span>
                    <span>{pagination.total}</span>
                  </div>
                </SelectTrigger>
                <SelectContent align="end">
                  {[10, 25, 50, 100].map((val) => (
                    <SelectItem key={val} value={val.toString()}>
                      {val} per page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-medium">
                Page {pagination.page} of {pagination.totalPages}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reconciliation Dialog */}
      <AlertDialog open={showReconcileDialog} onOpenChange={setShowReconcileDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reconcile Payment</AlertDialogTitle>
            <AlertDialogDescription>
              This will check Razorpay for payment status and update the order if payment succeeded.
              Use this for orders where payment was successful but verification failed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="razorpayPaymentId">Razorpay Payment ID (Optional)</Label>
              <Input
                id="razorpayPaymentId"
                placeholder="pay_xxxxx (leave empty to auto-detect)"
                value={razorpayPaymentId}
                onChange={(e) => setRazorpayPaymentId(e.target.value)}
                disabled={isReconciling}
              />
              <p className="text-xs text-muted-foreground">
                If provided, will use this payment ID. Otherwise, will try to find from order records.
              </p>
            </div>
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm font-medium">Order ID:</p>
              <p className="text-xs font-mono text-muted-foreground">
                {reconcilingOrderId}
                {selectedOrder?.orderNumber && <span className="ml-2">(#{selectedOrder.orderNumber})</span>}
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReconciling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReconcileConfirm}
              disabled={isReconciling}
            >
              {isReconciling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Reconciling...
                </>
              ) : (
                'Reconcile'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
        <DialogContent className="w-[90vw] max-w-5xl sm:max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle className="text-xl flex items-center gap-3">
              Order Details
              {selectedOrder?.orderNumber && (
                <span className="text-sm font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded">#{selectedOrder.orderNumber}</span>
              )}
            </DialogTitle>
            <DialogDescription className="text-[10px] font-mono mt-1 opacity-70">
              Internal ID: {selectedOrder?.id?.toUpperCase()}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 pt-0 scrollbar-hide">

            {isLoadingOrderDetails ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : selectedOrder ? (
              <div className="space-y-5 pt-4">
                {/* Customer Information */}
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-foreground">
                    <User className="h-4 w-4" />
                    Customer Information
                  </h3>
                  <div className="pl-6">
                    <div className="grid grid-cols-4 gap-4">
                      {selectedOrder.customer?.id && (
                        <div className="items-center gap-2">
                          <p className="text-xs text-muted-foreground mb-1">Customer ID:</p>
                          <p className="font-mono text-xs font-medium text-foreground">{selectedOrder.customer.id.slice(-8).toUpperCase()}</p>
                        </div>
                      )}
                      <div className="items-center gap-2">
                        <p className="text-xs text-muted-foreground mb-1">Name:</p>
                        <p className="font-medium text-sm text-foreground">{selectedOrder.customer?.name || 'N/A'}</p>
                      </div>
                      <div className="items-center gap-2">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <Phone className="h-3 w-3" />
                          Phone:
                        </p>
                        <p className="font-medium text-sm text-foreground">{selectedOrder.customer?.phone || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Order Information */}
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-foreground">
                    <Package className="h-4 w-4" />
                    Order Breakdown
                  </h3>
                  <div className="pl-6">
                    {selectedOrder.items && selectedOrder.items.length > 0 ? (
                      <div className="border rounded-lg overflow-hidden mb-4">
                        <div className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 border-b h-auto">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                              Item List ({selectedOrder.items.length})
                            </span>
                          </div>
                        </div>

                        <div className="max-h-[350px] overflow-y-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-muted text-muted-foreground uppercase font-medium sticky top-0 z-10">
                              <tr>
                                <th className="px-3 py-2">Product</th>
                                <th className="px-2 py-2 text-center">Qty</th>
                                <th className="px-3 py-2 text-right">Price</th>
                                {/* <th className="px-3 py-2 text-right">Deposit</th> */}
                                {/* <th className="px-3 py-2 text-right">GST</th> */}
                                <th className="px-3 py-2 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {selectedOrder.items.map((item, idx) => {
                                // Calculate GST for display
                                const itemPrice = item.price || 0;
                                const itemTotal = itemPrice * item.quantity;
                                const gstRate = item.gst || 5.0;
                                const gstAmount = itemTotal * (gstRate / 100);
                                const lineTotal = itemTotal + gstAmount;

                                return (
                                  <tr key={item.id || idx}>
                                    <td className="px-3 py-2 font-medium text-foreground">{item.productName}</td>
                                    <td className="px-2 py-2 text-center text-foreground">{item.quantity}</td>
                                    <td className="px-3 py-2 text-right text-foreground">₹{itemPrice.toFixed(2)}</td>
                                    {/* <td className="px-3 py-2 text-right text-foreground">₹{(item.depositAmount || 0).toFixed(2)}</td> */}
                                    {/* <td className="px-3 py-2 text-right text-foreground">
                                      <div className="flex flex-col items-end">
                                        <span>₹{gstAmount.toFixed(2)}</span>
                                        <span className="text-[10px] text-muted-foreground">({gstRate}%)</span>
                                      </div>
                                    </td> */}
                                    <td className="px-3 py-2 text-right text-foreground font-semibold">₹{itemTotal.toFixed(2)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Subtotal & GST */}
                        <div className="border-t p-3 space-y-2 bg-muted/20">
                          {(() => {
                            const subtotal = selectedOrder.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                            const totalGst = selectedOrder.items.reduce((sum, item) => sum + ((item.price * item.quantity) * ((item.gst || 5.0) / 100)), 0);
                            return (
                              <>
                                <div className="flex justify-between text-xs">
                                  <span className="text-foreground">Subtotal</span>
                                  <span>₹{subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                  <span className="text-foreground">Total Tax (GST)</span>
                                  <span>₹{totalGst.toFixed(2)}</span>
                                </div>
                                {selectedOrder.depositAmount > 0 && (
                                  <div className="flex justify-between text-xs font-medium text-muted-foreground">
                                    <span>Charged Deposit</span>
                                    <span>₹{selectedOrder.depositAmount.toFixed(2)}</span>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>


                        {/* Grand Total always visible outside accordion */}
                        <div className="bg-muted/50 font-semibold text-foreground px-3 py-2 flex items-center justify-between border-t">
                          <span className="uppercase text-[12px]">Grand Total</span>
                          <span>₹{selectedOrder.amount ? Math.ceil(Number(selectedOrder.amount)) :
                            Math.ceil(selectedOrder.items.reduce((sum, item) => sum + (item.price * item.quantity) + ((item.price * item.quantity) * ((item.gst || 5.0) / 100)), 0))
                          }</span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Order ID</p>
                          <p className="font-mono text-xs font-medium text-foreground">{selectedOrder.orderNumber ? `#${selectedOrder.orderNumber}` : selectedOrder.id?.slice(-8).toUpperCase()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Product Name</p>
                          <p className="font-medium text-sm text-foreground">{selectedOrder.productName || 'Water Can'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Quantity</p>
                          <p className="font-medium text-sm text-foreground">
                            {selectedOrder.originalQuantity && selectedOrder.additionalQuantity
                              ? `${selectedOrder.originalQuantity} + ${selectedOrder.additionalQuantity} cans`
                              : `${selectedOrder.quantity} can${selectedOrder.quantity !== 1 ? 's' : ''}`}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Amount</p>
                          <p className="font-medium text-base text-foreground">₹{Math.ceil(Number(selectedOrder.amount))}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Delivery Address */}
                {selectedOrder.address && (
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-foreground">
                      <MapPin className="h-4 w-4" />
                      Delivery Address & Contact
                    </h3>
                    <div className="pl-6 flex flex-col md:flex-row md:flex-wrap items-start md:items-center gap-x-8 gap-y-4">
                      {/* Address Details */}
                      <div className="space-y-0.5 flex-1 min-w-[250px] max-w-full">
                        <div className="font-medium text-sm text-foreground flex flex-wrap items-start gap-2">
                          <span className="break-words">{selectedOrder.address.line1}{selectedOrder.address.line2 && `, ${selectedOrder.address.line2}`}</span>
                          {selectedOrder.address.nickname && (
                            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                              {selectedOrder.address.nickname}
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {selectedOrder.address.area}, {selectedOrder.address.city} - {selectedOrder.address.pincode}
                          {selectedOrder.address.landmark && (
                            <span className="ml-1 italic text-muted-foreground/80">
                              ({selectedOrder.address.landmark})
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Contact Info */}
                      {selectedOrder.address.contactName && (
                        <div className="flex items-center gap-3 md:px-4 md:border-l md:h-10 border-muted-foreground/20 pt-2 md:pt-0">
                          <div className="p-2 bg-primary/5 rounded-full">
                            <User className="h-4 w-4 text-primary/70" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider leading-none mb-1">Contact Person</span>
                            <span className="text-sm font-semibold text-foreground">{selectedOrder.address.contactName}</span>
                          </div>
                        </div>
                      )}

                      {/* Phone Info */}
                      {selectedOrder.address.contactPhone && (
                        <div className="flex items-center gap-3 md:px-4 md:border-l md:h-10 border-muted-foreground/20">
                          <div className="p-2 bg-primary/5 rounded-full">
                            <Phone className="h-4 w-4 text-primary/70" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider leading-none mb-1">Contact Number</span>
                            <span className="text-sm font-semibold text-foreground">{selectedOrder.address.contactPhone}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}



                {/* Delivery Information */}
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-foreground">
                    <Calendar className="h-4 w-4" />
                    Delivery Information
                  </h3>
                  <div className="grid grid-cols-4 gap-4 pl-6">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        Order Date
                      </p>
                      <p className="font-medium text-sm text-foreground">{selectedOrder.createdAtIST || formatDate(selectedOrder.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Order Time
                      </p>
                      <p className="font-medium text-sm text-foreground">{selectedOrder.createdAtIST ? selectedOrder.createdAtIST.split(', ').pop() : formatTime(selectedOrder.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3" />
                        {selectedOrder.status === 'DELIVERED' ? 'Delivered Date' : 'Delivery Date'}
                      </p>
                      <div className="font-medium text-sm text-foreground">
                        {selectedOrder.status === 'DELIVERED' ? (
                          <span>{selectedOrder.updatedAt ? formatDate(selectedOrder.updatedAt) : 'N/A'}</span>
                        ) : (
                          <span>{formatDate(selectedOrder.deliveryDate)} (Expected)</span>
                        )}
                      </div>
                    </div>
                    {selectedOrder.status === 'DELIVERED' && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Delivered Time
                        </p>
                        <div className="font-medium text-sm text-foreground">
                          <span>{selectedOrder.updatedAt ? formatTime(selectedOrder.updatedAt) : 'N/A'}</span>
                        </div>
                      </div>
                    )}
                    {selectedOrder.assignedDeliveryBoy && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {selectedOrder.status === 'DELIVERED' ? 'Delivery Person' : 'Assigned To'}
                        </p>
                        <div className="font-medium text-sm text-foreground">
                          {selectedOrder.assignedDeliveryBoy.name}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status Information */}
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-foreground">
                    <CreditCard className="h-4 w-4" />
                    Status
                  </h3>
                  <div className="grid grid-cols-3 gap-4 pl-6">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Payment Status</p>
                      <Badge variant={getPaymentStatusBadge(selectedOrder.paymentStatus)} className="text-xs">
                        {selectedOrder.paymentStatus === 'SUCCESS' ? 'Paid' : 'Pending'}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Payment Method</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedOrder.paymentBreakdown ? (
                          <Badge variant="default" className="text-xs">
                            {selectedOrder.paymentBreakdown}
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">
                            {selectedOrder.paymentMethod}
                          </Badge>
                        )}
                        {selectedOrder.isQrPayment && (
                          <Badge variant="secondary" className="bg-purple-100 text-purple-700 border-purple-200 text-xs">
                            QR Paid
                          </Badge>
                        )}
                        {selectedOrder.bankRrn && (
                          <div className="w-full">
                            <p className="text-[10px] text-muted-foreground mt-1 font-mono">Bank RRN: {selectedOrder.bankRrn}</p>
                          </div>
                        )}
                        {selectedOrder.upiId && (
                          <div className="w-full">
                            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">UPI ID: {selectedOrder.upiId}</p>
                          </div>
                        )}
                        {selectedOrder.payerContact && (
                          <div className="w-full">
                            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">Payer: {selectedOrder.payerContact}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Order Status</p>
                      <Badge variant={getStatusBadge(selectedOrder.status)} className="whitespace-normal text-center h-auto py-1">
                        {(selectedOrder.status === 'DELIVERED' || selectedOrder.status === 'CANCELLED' || selectedOrder.status === 'NOT_DELIVERED')
                          ? selectedOrder.status.replace(/_/g, ' ')
                          : (selectedOrder.status === 'OUT_FOR_DELIVERY' || selectedOrder.isRouteGenerated)
                            ? 'DELIVERY IN PROGRESS'
                            : selectedOrder.isAssigned
                              ? 'CONFIRMED'
                              : 'ORDER RECEIVED'}

                      </Badge>
                      {selectedOrder.status === 'NOT_DELIVERED' && selectedOrder.notDeliveredReason && (
                        <div className="mt-2 p-2 bg-orange-50 border border-orange-100 rounded text-orange-700 text-xs italic">
                          <strong>Reason:</strong> {selectedOrder.notDeliveredReason}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 mt-4">
                    {/* Reschedule Button - Show for all statuses except DELIVERED/CANCELLED and when route token is NOT generated */}
                    {selectedOrder.status !== 'DELIVERED' &&
                      selectedOrder.status !== 'CANCELLED' &&
                      !selectedOrder.routeToken && (
                        <Button
                          onClick={() => openRescheduleDialog(selectedOrder)}
                          className="bg-orange-600 hover:bg-orange-700"
                        >
                          <CalendarIcon className="h-4 w-4 mr-2" />
                          Reschedule Order
                        </Button>
                      )}

                    {/* Cancel Button */}
                    {selectedOrder.status !== 'DELIVERED' && selectedOrder.status !== 'CANCELLED' && (
                      <Button
                        variant="destructive"
                        onClick={() => openCancelConfirm(selectedOrder)}
                        disabled={isCancelling}
                      >
                        {isCancelling ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Cancelling...
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-4 w-4 mr-2" />
                            Cancel Order
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRescheduleDialog} onOpenChange={setShowRescheduleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule Order</DialogTitle>
            <DialogDescription>
              Select a new delivery date for Order #{rescheduleOrder?.orderNumber || rescheduleOrder?.id?.slice(-8).toUpperCase()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Warning if order is assigned */}
            {rescheduleOrder?.isAssigned && rescheduleOrder?.assignedDeliveryBoy && (
              <Alert className="bg-amber-50 border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-sm">
                  ⚠️ This order is currently assigned to <strong>{rescheduleOrder.activeRouteName || 'Route'}</strong> with <strong>{rescheduleOrder.assignedDeliveryBoy.name}</strong>.
                  <br />
                  Changing the delivery date will remove it from this route and automatically reassign it to the route for the new date based on pincode.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label>New Delivery Date</Label>
              <Popover open={isRescheduleDatePickerOpen} onOpenChange={setIsRescheduleDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !rescheduleDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {rescheduleDate ? format(rescheduleDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={rescheduleDate}
                    defaultMonth={rescheduleDate || new Date()}
                    onSelect={(date) => {
                      setRescheduleDate(date);
                      if (date) setIsRescheduleDatePickerOpen(false);
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

            {/* Confirmation checkbox if order is assigned */}
            {rescheduleOrder?.isAssigned && rescheduleOrder?.assignedDeliveryBoy && (
              <div className="flex items-start space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="reschedule-confirm"
                  checked={rescheduleConfirmation}
                  onChange={(e) => setRescheduleConfirmation(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="reschedule-confirm" className="text-sm font-normal cursor-pointer">
                  I understand this will reassign the order to a different route
                </Label>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setShowRescheduleDialog(false)} disabled={isRescheduling}>
              Cancel
            </Button>
            <Button
              onClick={handleRescheduleConfirm}
              disabled={isRescheduling || !rescheduleDate || (rescheduleOrder?.isAssigned && !rescheduleConfirmation)}
            >
              {isRescheduling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Confirm Reschedule'
              )}
            </Button>
          </AlertDialogFooter>
        </DialogContent>
      </Dialog >

      <AlertDialog open={showCancelConfirmDialog} onOpenChange={setShowCancelConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to cancel this order?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Any assigned delivery routes will be updated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>No, Keep Order</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelOrder}
              disabled={isCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Yes, Cancel Order'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <Dialog open={showReassignDialog} onOpenChange={setShowReassignDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign Driver</DialogTitle>
            <DialogDescription>
              Select a new delivery person for Order #{reassignOrder?.orderNumber || reassignOrder?.id?.slice(-8).toUpperCase()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Delivery Person</Label>
              <Select value={selectedDeliveryBoyId} onValueChange={setSelectedDeliveryBoyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select delivery person" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const activeDeliveryBoys = deliveryBoys.filter(db => db.active && !db.onLeave);

                    if (activeDeliveryBoys.length === 0) {
                      return (
                        <SelectItem value="no_person" disabled>
                          No delivery staff available
                        </SelectItem>
                      );
                    }

                    return activeDeliveryBoys.map((db) => (
                      <SelectItem key={db.id} value={db.id}>
                        {db.name} ({db.pincodes && db.pincodes.length > 0 ? db.pincodes.join(', ') : 'No Area'})
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
            </div>
          </div>

          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setShowReassignDialog(false)} disabled={isReassigning}>
              Cancel
            </Button>
            <Button onClick={handleReassignConfirm} disabled={isReassigning || !selectedDeliveryBoyId}>
              {isReassigning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Confirm Reassign'
              )}
            </Button>
          </AlertDialogFooter>
        </DialogContent>
      </Dialog >

      {/* Edit Address Dialog */}
      <Dialog open={showEditAddressDialog} onOpenChange={setShowEditAddressDialog}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle className="text-xl flex items-center gap-3">
              Edit Delivery Address
              {orderToEditAddress?.orderNumber && (
                <span className="text-sm font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded">#{orderToEditAddress.orderNumber}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 pt-4 scrollbar-hide">
            <AddressForm
              formData={editAddressData}
              onChange={(field, value) => setEditAddressData(prev => ({ ...prev, [field]: value }))}
              showDefaultToggle={false}
            />
          </div>

          <DialogFooter className="p-4 border-t bg-muted/20 gap-2">
            <Button variant="outline" onClick={() => setShowEditAddressDialog(false)} disabled={isSavingAddress}>
              Cancel
            </Button>
            <Button onClick={handleUpdateAddress} disabled={isSavingAddress}>
              {isSavingAddress ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cleanup Confirm Dialog */}
      <AlertDialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cleanup Abandoned Orders</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel all unpaid "ONLINE PENDING" orders older than 15 minutes? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCleaningUp}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCleanupAbandoned} disabled={isCleaningUp} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isCleaningUp ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cleaning up...
                </>
              ) : (
                'Yes, Cancel Abandoned Orders'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  );
}
