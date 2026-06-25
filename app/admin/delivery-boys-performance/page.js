'use client';

import { useState, useEffect } from 'react';
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
import { CalendarIcon, Loader2, TrendingUp, Package, CheckCircle2, XCircle, Clock, Users, BarChart3, AlertCircle, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { adminFetch } from '../../../lib/admin-api';
import toast from 'react-hot-toast';

export default function DeliveryBoysPerformancePage() {
  const [performance, setPerformance] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [selectedDeliveryBoyId, setSelectedDeliveryBoyId] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
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
    fetchPerformance();
  }, [startDate, endDate, selectedDeliveryBoyId]);

  const fetchPerformance = async () => {
    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();

      if (startDate) {
        params.append('startDate', format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        params.append('endDate', format(endDate, 'yyyy-MM-dd'));
      }

      if (selectedDeliveryBoyId && selectedDeliveryBoyId !== 'all') {
        params.append('deliveryBoyId', selectedDeliveryBoyId);
      }

      const response = await adminFetch(`/api/admin/delivery-boys-performance?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setPerformance(data.performance || []);
        setDeliveryBoys(data.deliveryBoys || []);
        // Signal that data has been refreshed
        window.dispatchEvent(new CustomEvent('admin-data-refreshed'));
      } else {
        setError(data.message || 'Failed to fetch performance data');
      }
    } catch (err) {
      console.error('Error fetching performance:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.ceil(performance.length / itemsPerPage);
  const paginatedPerformance = performance.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, selectedDeliveryBoyId]);

  const resetFilters = () => {
    setStartDate(null);
    setEndDate(null);
    setSelectedDeliveryBoyId('all');
  };

  if (isPermsLoading) {
    return <div className="flex justify-center items-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!hasPermission('view_delivery_performance')) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <XCircle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view Delivery Performance.</p>
      </div>
    );
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount || 0);
  };

  const totalStats = performance.reduce(
    (acc, db) => ({
      totalOrdersAssigned: acc.totalOrdersAssigned + db.totalOrdersAssigned,
      totalCansAssigned: acc.totalCansAssigned + (db.totalCansAssigned || 0),
      totalOrdersDelivered: acc.totalOrdersDelivered + db.totalOrdersDelivered,
      totalOrdersNotDelivered: acc.totalOrdersNotDelivered + db.totalOrdersNotDelivered,
      totalOrdersPending: acc.totalOrdersPending + db.totalOrdersPending,
      totalCansDelivered: acc.totalCansDelivered + db.totalCansDelivered,
      totalExtraCansDelivered: acc.totalExtraCansDelivered + db.totalExtraCansDelivered,
      totalOnlineAmount: acc.totalOnlineAmount + db.totalOnlineAmount,
    }),
    {
      totalOrdersAssigned: 0,
      totalCansAssigned: 0,
      totalOrdersDelivered: 0,
      totalOrdersNotDelivered: 0,
      totalOrdersPending: 0,
      totalCansDelivered: 0,
      totalExtraCansDelivered: 0,
      totalOnlineAmount: 0,
    }
  );

  const overallSuccessRate =
    totalStats.totalOrdersAssigned > 0
      ? ((totalStats.totalOrdersDelivered / totalStats.totalOrdersAssigned) * 100).toFixed(2)
      : '0.00';

  return (
    <div className="space-y-6 ">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Delivery Performance
          </h1>
          <p className="text-muted-foreground mt-1">
            Track delivery performance and statistics
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !startDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      if (date) {
                        setStartDate(date);
                        setIsStartDatePickerOpen(false);
                      }
                    }}
                    disabled={(date) => date > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !endDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => {
                      if (date) {
                        setEndDate(date);
                        setIsEndDatePickerOpen(false);
                      }
                    }}
                    disabled={(date) => date > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Delivery Staff</Label>
              <Select value={selectedDeliveryBoyId} onValueChange={setSelectedDeliveryBoyId}>
                <SelectTrigger className="w-full border-2 border-primary/20 bg-background shadow-sm hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:border-primary/40 hover:text-black transition-all">
                  <SelectValue placeholder="All Delivery Staff" />
                </SelectTrigger>
                <SelectContent className="w-85">
                  <SelectItem value="all">All Delivery Staff</SelectItem>
                  {deliveryBoys.map((db) => (
                    <SelectItem key={db.id} value={db.id}>
                      {db.name} ({db.phone})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex items-end">
              <Button
                variant="outline"
                onClick={resetFilters}
                className="w-full"
                disabled={!startDate && !endDate && selectedDeliveryBoyId === 'all'}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders Assigned</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStats.totalOrdersAssigned}</div>
            <p className="text-xs text-muted-foreground">
              For selected delivery staff
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders Delivered</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totalStats.totalOrdersDelivered}</div>
            <p className="text-xs text-muted-foreground">
              Success rate: {overallSuccessRate}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items Need to Delivered</CardTitle>
            <Package className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{totalStats.totalCansAssigned}</div>
            <p className="text-xs text-muted-foreground">
              Total assigned quantity
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items Delivered</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalStats.totalCansDelivered}</div>
            <p className="text-xs text-muted-foreground">
              Total quantity delivered
            </p>
          </CardContent>
        </Card>
        {/* <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Extra Cans Delivered</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{totalStats.totalExtraCansDelivered}</div>
            <p className="text-xs text-muted-foreground">
              Additional cans delivered
            </p>
          </CardContent>
        </Card> */}
      </div>

      {/* Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Delivery Staff Performance</CardTitle>
          <CardDescription>
            Detailed statistics for each delivery staff {startDate && endDate ? `from ${format(startDate, 'MMM dd, yyyy')} to ${format(endDate, 'MMM dd, yyyy')}` : 'All Time'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : performance.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No performance data found for the selected period.</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {paginatedPerformance.map((db) => (
                  <div key={db.deliveryBoyId} className="rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold">{db.deliveryBoyName}</div>
                        <div className="text-sm text-muted-foreground">{db.deliveryBoyPhone}</div>
                      </div>
                      {db.assignedRouteNames ? (
                        <Badge variant="outline">{db.assignedRouteNames}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">No route assigned</span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">Orders Assigned</span>
                        <span className="font-medium">{db.totalOrdersAssigned}</span>
                      </div>
                      {/* <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">Success Rate</span>
                        <div>
                          <Badge
                            variant={
                              db.deliverySuccessRate >= 90
                                ? 'default'
                                : db.deliverySuccessRate >= 70
                                  ? 'secondary'
                                  : 'destructive'
                            }
                            className="h-5 px-1.5"
                          >
                            {db.deliverySuccessRate}%
                          </Badge>
                        </div>
                      </div> */}

                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">Delivered</span>
                        <span className="font-medium text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {db.totalOrdersDelivered}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">Not Delivered</span>
                        <span className="font-medium text-red-600 flex items-center gap-1">
                          <XCircle className="h-3 w-3" /> {db.totalOrdersNotDelivered}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">Pending</span>
                        <span className="font-medium text-yellow-600 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {db.totalOrdersPending}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">Items Delivered</span>
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-blue-600" />
                          <span className="font-medium">{db.totalCansDelivered}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">Items Not Delivered</span>
                        <div className="flex items-center gap-1">
                          <XCircle className="h-3 w-3 text-red-600" />
                          <span className="font-medium">{db.totalCansNotDelivered}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t flex justify-between items-center">
                      <span className="text-sm font-medium">Total Amount</span>
                      <span className="font-bold text-lg">{formatCurrency(db.totalOnlineAmount)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              {!isLoading && totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
                  <span className="text-sm text-muted-foreground mr-2">
                    Showing {Math.min(performance.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(performance.length, currentPage * itemsPerPage)} of {performance.length}
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
            </>
          )}
        </CardContent>
      </Card>


    </div>
  );
}

