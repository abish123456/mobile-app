'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Calendar } from '../../../../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../../../components/ui/popover';
import { Alert, AlertDescription } from '../../../../components/ui/alert';
import { format } from 'date-fns';
import { CalendarIcon, Loader2, AlertCircle, ArrowLeft, Package } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../../lib/admin-api';

export default function CreateRoutePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [error, setError] = useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);


  const [formData, setFormData] = useState({
    date: new Date(),
    pincode: '',
    deliveryBoyId: '',
  });

  const [holidayDates, setHolidayDates] = useState(new Set());
  const [weeklyOffDays, setWeeklyOffDays] = useState(new Set());

  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [pincodes, setPincodes] = useState([]);
  const lastFetchKey = useRef('');

  const fetchDeliveryBoys = async () => {
    try {
      const response = await adminFetch('/api/admin/delivery-boys');
      const data = await response.json();

      if (data.success) {
        const activeBoys = (data.deliveryBoys || []).filter((db) => db.active);
        setDeliveryBoys(activeBoys);
      }
    } catch (err) {
      console.error('Error fetching delivery staff:', err);
    }
  };

  const fetchPincodes = async () => {
    try {
      // Fetch pincodes from orders API (it returns pincodes list)
      const response = await adminFetch('/api/admin/orders');
      const data = await response.json();

      if (data.success && data.pincodes && Array.isArray(data.pincodes)) {
        setPincodes(data.pincodes);
      }
    } catch (err) {
      console.error('Error fetching pincodes:', err);
    }
  };

  useEffect(() => {
    fetchDeliveryBoys();
    fetchPincodes();
    fetchConfig();
  }, []);

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

  // Convert date to string for stable dependency comparison
  const dateKey = formData.date ? format(formData.date, 'yyyy-MM-dd') : '';
  const pincodeKey = formData.pincode || '';
  const fetchKey = `${dateKey}|${pincodeKey}`;

  useEffect(() => {
    // Skip if we've already fetched for this combination
    if (lastFetchKey.current === fetchKey) {
      return;
    }

    const fetchOrders = async () => {
      if (!formData.date) return; // Don't fetch if no date selected

      // Mark as fetching
      lastFetchKey.current = fetchKey;

      setIsLoadingOrders(true);
      try {
        const dateStr = format(formData.date, 'yyyy-MM-dd');
        const params = new URLSearchParams({
          date: dateStr,
          deliveryStatus: 'ALL',
          ...(formData.pincode && formData.pincode !== 'ALL' && { pincode: formData.pincode }),
        });

        const response = await adminFetch(`/api/admin/orders?${params.toString()}`);
        const data = await response.json();

        if (data.success) {
          // Filter out orders that are already assigned to a route
          const unassignedOrders = (data.orders || []).filter((order) => {
            // Include PENDING or CONFIRMED orders that are NOT yet assigned
            // The API now returns 'isAssigned' flag
            if (order.isAssigned) return false;

            return order.status === 'PENDING' || order.status === 'CONFIRMED';
          });
          setOrders(unassignedOrders);
          if (data.pincodes && Array.isArray(data.pincodes)) {
            setPincodes(data.pincodes);
          }
        }
      } catch (err) {
        console.error('Error fetching orders:', err);
        // Reset fetch key on error so we can retry
        lastFetchKey.current = '';
      } finally {
        setIsLoadingOrders(false);
      }
    };

    fetchOrders();
  }, [fetchKey, formData.date, formData.pincode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.date) {
      setError('Please select a date');
      return;
    }

    if (!formData.pincode || formData.pincode.trim().length === 0) {
      setError('Please enter a pincode');
      return;
    }

    if (!formData.deliveryBoyId) {
      setError('Please select a delivery staff');
      return;
    }

    if (selectedOrderIds.length === 0) {
      setError('Please select at least one order');
      return;
    }

    setIsLoading(true);

    try {
      const response = await adminFetch('/api/admin/routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: format(formData.date, 'yyyy-MM-dd'),
          area: formData.pincode, // backend stores postal code in area field
          deliveryBoyId: formData.deliveryBoyId,
          orderIds: selectedOrderIds,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Route created successfully!');
        router.push('/admin/routes');
      } else {
        setError(data.message || 'Failed to create route');
        toast.error(data.message || 'Failed to create route');
      }
    } catch (err) {
      console.error('Error creating route:', err);
      const errorMsg = 'Network error. Please try again.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleOrderSelection = (orderId) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.length === orders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(orders.map((order) => order.id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create Route</h1>
          <p className="text-muted-foreground">Create a new delivery route and assign orders</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Route Details</CardTitle>
            <CardDescription>Enter route information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Delivery Date *</Label>
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.date ? format(formData.date, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.date}
                      defaultMonth={formData.date || new Date()}
                      onSelect={(date) => {
                        if (date) {
                          setFormData((prev) => ({ ...prev, date }));
                          setSelectedOrderIds([]); // Reset selections when date changes
                          setIsDatePickerOpen(false);
                        }
                      }}
                      initialFocus
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
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Postal Code / Pincode *</Label>
                <Input
                  value={formData.pincode}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, pincode: e.target.value }));
                    setSelectedOrderIds([]); // Reset selections when pincode changes
                  }}
                  placeholder="Enter postal code / pincode"
                  required
                  list="pincodes"
                  inputMode="numeric"
                />
                <datalist id="pincodes">
                  {pincodes.map((pincode) => (
                    <option key={pincode} value={pincode} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-2">
                <Label>Delivery Staff *</Label>
                <select
                  value={formData.deliveryBoyId || ''}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, deliveryBoyId: e.target.value }));
                  }}
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select delivery staff</option>
                  {deliveryBoys.map((db) => (
                    <option key={db.id} value={db.id}>
                      {db.name} ({db.phone})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Select Orders</CardTitle>
                <CardDescription>
                  Choose orders to assign to this route ({selectedOrderIds.length} selected)
                </CardDescription>
              </div>
              {orders.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectAll}
                >
                  {selectedOrderIds.length === orders.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingOrders ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No orders available</h3>
                <p className="text-muted-foreground">
                  No pending orders found for {format(formData.date, 'MMM dd, yyyy')}
                  {formData.pincode && ` in pincode ${formData.pincode}`}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {orders.map((order) => {
                  const isSelected = selectedOrderIds.includes(order.id);
                  return (
                    <div
                      key={order.id}
                      className={cn(
                        "flex items-start gap-4 p-4 border rounded-lg cursor-pointer hover:bg-accent transition-colors",
                        isSelected && "bg-accent border-primary"
                      )}
                      onClick={() => toggleOrderSelection(order.id)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOrderSelection(order.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">
                            Order #{order.id.slice(-8).toUpperCase()}
                          </div>
                          <div className="text-lg font-semibold">₹{order.amount}</div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <div>{order?.customer?.name || 'N/A'}{order?.customer?.phone ? ` - ${order.customer.phone}` : ''}</div>
                          <div>
                            {order?.address?.line1 || 'Address unavailable'}
                            {order?.address?.area ? `, ${order.address.area}` : ''}
                            {order?.address?.city ? `, ${order.address.city}` : ''}
                            {order?.address?.pincode ? ` - ${order.address.pincode}` : ''}
                          </div>
                          <div className="mt-1">
                            {order.quantity} can{order.quantity !== 1 ? 's' : ''} • {order.paymentMethod === 'COD' ? 'COD' : 'Paid'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || selectedOrderIds.length === 0}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Route...
              </>
            ) : (
              `Create Route (${selectedOrderIds.length} orders)`
            )}
          </Button>
        </div>
      </form>


    </div>
  );
}

