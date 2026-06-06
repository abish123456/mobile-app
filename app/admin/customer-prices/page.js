'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
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
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { Calendar as CalendarComponent } from '../../../components/ui/calendar';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Plus, Edit, Trash2, Loader2, AlertCircle, IndianRupee, Search, ChevronLeft, ChevronRight, History, MapPin, Calendar as CalendarIcon, RotateCcw, RefreshCw } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../lib/admin-api';
import { format, isSameDay } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { cn } from '../../../lib/utils';
import dynamic from 'next/dynamic';

const MapPicker = dynamic(() => import('../../../components/app/MapPicker'), {
  ssr: false,
  loading: () => <div className="h-[300px] w-full bg-muted animate-pulse rounded-lg flex items-center justify-center">Loading Map...</div>
});

export default function CustomerPricesPage() {
  const [prices, setPrices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [serviceAreas, setServiceAreas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [depositRate, setDepositRate] = useState(200);

  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [selectedPrice, setSelectedPrice] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [fixedCustomer, setFixedCustomer] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isProfileEdit, setIsProfileEdit] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedDate, setSelectedDate] = useState(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const [showWalletHistoryDialog, setShowWalletHistoryDialog] = useState(false);
  const [selectedWalletCustomer, setSelectedWalletCustomer] = useState(null);
  const [walletHistory, setWalletHistory] = useState([]);
  const [isWalletHistoryLoading, setIsWalletHistoryLoading] = useState(false);

  const formatPhoneNumber = (phone) => {
    if (!phone) return '';
    return phone.split('_')[0];
  };

  const [formData, setFormData] = useState({
    customerId: '',
    customerName: '',
    customerPhone: '',
    cansInHand: '',
    depositWalletBalance: '',
    customerAddress: {
      line1: '',
      line2: '',
      area: '',
      city: '',
      pincode: '',
      latitude: null,
      longitude: null
    },
    productId: '',
    price: '',
    customPrices: {},
    active: true
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);


    try {
      const [pricesRes, customersRes, productsRes, serviceAreasRes] = await Promise.all([
        adminFetch('/api/admin/customer-prices'),
        adminFetch('/api/admin/customers'),
        adminFetch('/api/admin/products'),
        fetch('/shop/api/service-areas'),
      ]);

      const customersData = await customersRes.json();
      const productsData = await productsRes.json();
      const serviceAreasData = await serviceAreasRes.json();
      const pricesData = await pricesRes.json();

      if (customersData.success) {
        setCustomers(customersData.customers || []);
        if (customersData.depositRate > 0) {
          setDepositRate(customersData.depositRate);
        }
      } else {
        toast.error(customersData.message || 'Failed to fetch customers');
      }

      if (productsData.success) {
        // Only show products marked for custom pricing
        const allProducts = productsData.products || [];
        const customPriceProducts = allProducts.filter(p => p.isCustomPrice);
        setProducts(customPriceProducts);

        // If API didn't return depositRate, fallback to finding it in products
        if (!customersData.depositRate || customersData.depositRate <= 0) {
          const rate = allProducts.find(p => p.depositAmount > 0)?.depositAmount || 200;
          setDepositRate(rate);
        }
      } else {
        toast.error(productsData.message || 'Failed to fetch products');
      }

      if (serviceAreasData.success) {
        setServiceAreas(serviceAreasData.serviceAreas || []);
      } else {
        toast.error(serviceAreasData.message || 'Failed to fetch service areas');
      }

      if (pricesData.success) {
        setPrices(pricesData.prices || []);
      } else {
        toast.error(pricesData.message || 'Failed to fetch prices');
      }

      // Signal that data has been refreshed
      window.dispatchEvent(new CustomEvent('admin-data-refreshed'));
    } catch (err) {
      console.error('Error fetching data:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = () => {
    setSelectedPrice(null);
    setFixedCustomer(null);
    setIsEditMode(false);
    setIsProfileEdit(false);
    setFormData({
      customerId: '',
      customerName: '',
      customerPhone: '',
      productId: products.length === 1 ? products[0].id : '',
      price: '',
      active: true
    });
    setShowDialog(true);
  };

  const handleEditProfile = (customer) => {
    setSelectedPrice(null);
    setFixedCustomer(customer);
    setIsEditMode(true);
    setIsProfileEdit(true);
    setFormData({
      customerId: customer.id,
      customerName: customer.name || '',
      customerPhone: customer.phone || '',
      cansInHand: customer.cansInHand || 0,
      depositWalletBalance: customer.depositWalletBalance || 0,
      customerAddress: {
        line1: customer.line1 || '',
        line2: customer.line2 || '',
        area: customer.area || '',
        city: customer.city || '',
        pincode: customer.pincode || '',
        latitude: customer.latitude || null,
        longitude: customer.longitude || null
      },
      active: customer.active !== false,
      createdAt: customer.createdAt,
      productId: products.length === 1 ? products[0].id : '',
      price: '',
      customPrices: (() => {
        const cp = {};
        products.forEach(p => {
          const match = (pricesByCustomer[customer.id] || []).find(price => price.productId === p.id);
          cp[p.id] = match ? match.price.toString() : '';
        });
        return cp;
      })()
    });
    setShowDialog(true);
  };

  const handleEdit = (price) => {
    setSelectedPrice(price);
    setFixedCustomer(null);
    setIsEditMode(true);
    setIsProfileEdit(false);
    setFormData({
      customerId: price.customerId,
      customerName: '',
      customerPhone: '',
      productId: price.productId,
      price: price.price.toString(),
      active: true
    });
    setShowDialog(true);
  };

  const handleDelete = (price) => {
    setSelectedPrice(price);
    setShowDeleteDialog(true);
  };

  const handleViewWalletHistory = async (customer) => {
    setSelectedWalletCustomer(customer);
    setWalletHistory([]);
    setShowWalletHistoryDialog(true);
    setIsWalletHistoryLoading(true);

    try {
      const response = await adminFetch(`/api/admin/customers/${customer.id}/wallet-history?t=${Date.now()}`);
      const data = await response.json();

      if (data.success) {
        setWalletHistory(data.transactions || []);
      } else {
        toast.error(data.message || 'Failed to load deposit logs');
      }
    } catch (err) {
      console.error('Error fetching wallet history:', err);
      toast.error('Network error');
    } finally {
      setIsWalletHistoryLoading(false);
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      if (isProfileEdit) {

        if (!formData.customerName || !formData.customerName.trim()) {
          toast.error('Customer Name is mandatory');
          setIsSaving(false);
          return;
        }
        if (!formData.customerAddress.line1 || !formData.customerAddress.line1.trim()) {
          toast.error('Address Line 1 is mandatory');
          setIsSaving(false);
          return;
        }
        if (!formData.customerAddress.city || !formData.customerAddress.city.trim()) {
          toast.error('City is mandatory');
          setIsSaving(false);
          return;
        }
        if (!formData.customerAddress.area || !formData.customerAddress.area.trim()) {
          toast.error('Area is mandatory');
          setIsSaving(false);
          return;
        }
        if (!formData.customerAddress.pincode || !formData.customerAddress.pincode.trim()) {
          toast.error('Pincode is mandatory');
          setIsSaving(false);
          return;
        }
        if (!formData.customerAddress.latitude || !formData.customerAddress.longitude) {
          toast.error('Please pin the exact location on the map');
          setIsSaving(false);
          return;
        }

        // Handle Customer Profile Update
        const payload = {
          id: formData.customerId,
          name: formData.customerName,
          phone: formData.customerPhone,
          cansInHand: formData.cansInHand,
          depositWalletBalance: formData.depositWalletBalance,
          address: formData.customerAddress,
          active: formData.active,
          city: formData.customerAddress.city,
          pincode: formData.customerAddress.pincode,
          latitude: formData.customerAddress.latitude,
          longitude: formData.customerAddress.longitude,
        };

        const response = await adminFetch('/api/admin/customers', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (data.success) {
          // Handle Custom Price Updates
          const pricePromises = products.map(async (product) => {
            const inputVal = formData.customPrices[product.id];
            const inputPrice = parseFloat(inputVal);
            const existingPriceObj = (pricesByCustomer[formData.customerId] || []).find(price => price.productId === product.id);

            // Criteria to remove custom price:
            // 1. Input is empty/invalid or negative
            // 2. Input equals default product price
            if (!inputVal || isNaN(inputPrice) || inputPrice < 0 || inputPrice === product.price) {
              if (existingPriceObj) {
                await adminFetch(`/api/admin/customer-prices?id=${existingPriceObj.id}`, { method: 'DELETE' });
              }
              return;
            }

            // If we have a valid custom price different from default
            // Update or Create
            if (!existingPriceObj || existingPriceObj.price !== inputPrice) {
              await adminFetch('/api/admin/customer-prices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  customerId: formData.customerId,
                  productId: product.id,
                  price: inputPrice
                })
              });
            }
          });

          await Promise.all(pricePromises);

          toast.success('Customer profile and prices updated successfully!');
          setShowDialog(false);
          fetchData();
        } else {
          toast.error(data.message || 'Failed to update profile');
        }
      } else {
        // Handle Price Update (Existing Logic)
        const selectedProduct = products.find(p => p.id === formData.productId);
        const inputPrice = parseFloat(formData.price);

        if (inputPrice < 0) {
          toast.error('Price cannot be negative');
          setIsSaving(false);
          return;
        }

        // Check if custom price matches default price
        if (selectedProduct && inputPrice === selectedProduct.price) {
          // If editing an existing custom price, delete it as it's no longer needed
          if (selectedPrice) {
            const response = await adminFetch(
              `/api/admin/customer-prices?id=${selectedPrice.id}`,
              {
                method: 'DELETE',
              }
            );

            const data = await response.json();

            if (data.success) {
              toast.success('Price matches default. Custom price removed.');
              setShowDialog(false);
              setSelectedPrice(null);
              fetchData();
            } else {
              toast.error(data.message || 'Failed to remove redundant custom price');
            }
          } else {
            // If adding a new price but it matches default, just don't save anything
            toast.success('Price matches default. No custom price needs to be set.');
            setShowDialog(false);
          }
          setIsSaving(false);
          return;
        }

        const payload = {
          customerId: formData.customerId,
          productId: formData.productId,
          price: inputPrice,
        };

        const response = await adminFetch('/api/admin/customer-prices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (data.success) {
          toast.success(
            selectedPrice ? 'Price updated successfully!' : 'Price added successfully!'
          );
          setShowDialog(false);
          fetchData();
        } else {
          toast.error(data.message || 'Failed to save price');
        }
      }
    } catch (err) {
      console.error('Error saving data:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsSaving(true);

    try {
      const response = await adminFetch(
        `/api/admin/customer-prices?id=${selectedPrice.id}`,
        {
          method: 'DELETE',
        }
      );

      const data = await response.json();

      if (data.success) {
        toast.success('Price deleted successfully!');
        setShowDeleteDialog(false);
        setShowDialog(false);
        setSelectedPrice(null);
        fetchData();
      } else {
        toast.error(data.message || 'Failed to delete price');
      }
    } catch (err) {
      console.error('Error deleting price:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Create a map of customer prices for quick lookup
  const pricesByCustomer = {};
  prices.forEach((price) => {
    if (!pricesByCustomer[price.customerId]) {
      pricesByCustomer[price.customerId] = [];
    }
    pricesByCustomer[price.customerId].push(price);
  });

  // Filter customers based on search term
  const filteredCustomers = customers.filter((customer) => {
    // 1. Text Search Filter
    let searchMatch = true;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      searchMatch = (
        (customer.name || "").toLowerCase().includes(search) ||
        customer.phone.toLowerCase().includes(search) ||
        customer.id.toLowerCase().includes(search)
      );
    }

    // 2. Date Filter (Match creation day in IST)
    let dateMatch = true;
    if (selectedDate && customer.createdAt) {
      const zonedDate = toZonedTime(new Date(customer.createdAt), "Asia/Kolkata");
      dateMatch = isSameDay(zonedDate, selectedDate);
    }

    return searchMatch && dateMatch;
  });

  // Sort by creation time (newest first) only if a date filter is active
  // Otherwise stays alphabetical by name as returned by the API
  if (selectedDate) {
    filteredCustomers.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });
  }

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Customer Profile </h1>
          <p className="text-muted-foreground">Manage customers and pricing</p>
        </div>
      </div>



      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Customer List</CardTitle>
              <CardDescription>
                View and manage customers and their custom prices
              </CardDescription>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              {/* Date Filter */}
              <div className="flex items-center gap-2">
                {selectedDate && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setSelectedDate(null)}
                    title="Clear Date Filter"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 px-3 justify-start text-left font-normal border-gray-200",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "MMM dd, yyyy") : "Filter by Date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        setSelectedDate(date);
                        setIsDatePickerOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-64 h-9"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(isLoading && customers.length === 0) ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-center">Customer ID</TableHead>
                    <TableHead className="text-center">Customer Info</TableHead>
                    <TableHead className="text-center">Created On</TableHead>
                    <TableHead className="text-center">No. of 20L Empty Cans in Hand</TableHead>
                    <TableHead className="text-center">Address</TableHead>
                    <TableHead className="text-center text-sm">Prices</TableHead>
                    <TableHead className="text-center">Deposit Amount</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center">
                        No customers found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedCustomers.map((customer) => {
                      const customerPrices = pricesByCustomer[customer.id] || [];
                      return (
                        <TableRow key={customer.id}>
                          <TableCell className="font-mono text-xs text-center">
                            {customer.id.slice(-8).toUpperCase()}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center max-w-[150px] mx-auto">
                              <span className="font-medium whitespace-normal break-words" title={customer.name || 'Unknown'}>
                                {customer.name || 'Unknown'}
                              </span>
                              <span className="text-xs text-muted-foreground truncate">{formatPhoneNumber(customer.phone)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center mx-auto text-[11px] font-medium text-gray-600 bg-gray-50 px-2 py-1 rounded border border-gray-100 max-w-fit">
                              {customer.createdAt ? formatInTimeZone(new Date(customer.createdAt), 'Asia/Kolkata', 'MMM dd, yyyy') : 'N/A'}
                              <span className="text-[10px] text-gray-400 font-normal">{customer.createdAt ? formatInTimeZone(new Date(customer.createdAt), 'Asia/Kolkata', 'hh:mm a') : ''}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1.5 font-bold px-2.5 py-1 mx-auto max-w-fit">
                              <span className="text-lg">
                                {customer.totalCansCount || 0}
                              </span>
                              <span className="text-[10px] uppercase tracking-wider"></span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center mx-auto text-xs max-w-[250px] whitespace-normal break-words">
                              <span>{customer.line1}</span>
                              {customer.line2 && <span className="text-muted-foreground">{customer.line2}</span>}
                              <span className="text-muted-foreground">
                                {customer.area}, {customer.pincode}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[400px] text-center">
                            <div className="flex flex-wrap justify-center gap-2">
                              {products.map((product) => {
                                const customPrice = (pricesByCustomer[customer.id] || []).find(
                                  (p) => p.productId === product.id
                                );
                                const displayPrice = customPrice ? customPrice.price : product.price;
                                const isCustom = !!customPrice;

                                return (
                                  <div
                                    key={product.id}
                                    className="bg-secondary text-secondary-foreground rounded-full px-3 py-1 flex items-center gap-2 border border-transparent"
                                  >
                                    <span className="text-xs font-medium">{product.name}:</span>
                                    <span className="text-xs font-bold">
                                      ₹{Number(displayPrice).toFixed(2)}
                                      {isCustom && (
                                        <span className="ml-1 text-[10px] font-medium opacity-80">(custom)</span>
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2 font-semibold text-primary">
                              ₹{Math.ceil(Number(customer.depositWalletBalance || 0))}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                onClick={() => handleViewWalletHistory(customer)}
                                title="View Deposit History"
                              >
                                <History className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-2">
                              {customer.active !== false ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditProfile(customer)}
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </Button>
                              ) : (
                                <Badge variant="destructive" className="text-[10px] h-4 px-1.5 py-2.5 uppercase font-bold tracking-wider">Deactivated</Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {!isLoading && filteredCustomers.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-end gap-x-1 gap-y-4 mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm  whitespace-nowrap">
                  <b>{Math.min(filteredCustomers.length, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(filteredCustomers.length, currentPage * itemsPerPage)}</b> of <b>{filteredCustomers.length}</b>
                </span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => {
                    setItemsPerPage(parseInt(value));
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-auto border-none shadow-none bg-transparent hover:bg-accent/50 focus:ring-0 gap-1 px-2">
                    <SelectValue placeholder={`${itemsPerPage} per page`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 per page</SelectItem>
                    <SelectItem value="25">25 per page</SelectItem>
                    <SelectItem value="50">50 per page</SelectItem>
                    <SelectItem value="100">100 per page</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 p-0  border-gray-200"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>

                <div className="text-sm">
                  Page {currentPage} of {totalPages || 1}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 p-0  border-gray-200"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[600px] lg:max-w-[1000px] w-[95vw] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>
              {isProfileEdit ? 'Edit Customer Details' : 'Manage Customer Price'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh]">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {isProfileEdit ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column: Profile & Pricing */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Customer ID</Label>
                        <div className="p-2 bg-muted rounded-md text-sm font-mono text-muted-foreground">
                          {formData.customerId.slice(-8).toUpperCase()}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Phone Number</Label>
                        <div className="p-2 bg-muted rounded-md text-sm font-medium">
                          {formatPhoneNumber(formData.customerPhone)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Account Created On</Label>
                      <div className="p-2 bg-muted rounded-md text-sm text-muted-foreground">
                        {formData.createdAt ? formatInTimeZone(new Date(formData.createdAt), 'Asia/Kolkata', 'MMMM dd, yyyy hh:mm a') : 'N/A'}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="customerName">Name *</Label>
                      <Input
                        id="customerName"
                        value={formData.customerName}
                        onChange={(e) =>
                          setFormData({ ...formData, customerName: e.target.value })
                        }
                        required
                        placeholder="Customer Name"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="cansInHand">Cans In Hand</Label>
                        <Input
                          id="cansInHand"
                          type="number"
                          value={formData.cansInHand}
                          onChange={(e) => {
                            const cans = parseInt(e.target.value) || 0;
                            // Use state depositRate instead of searching in filtered products
                            const newBalance = (cans * depositRate).toFixed(2);

                            setFormData({
                              ...formData,
                              cansInHand: e.target.value,
                              depositWalletBalance: newBalance
                            });
                          }}
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="depositWalletBalance">Deposit Balance (₹)</Label>
                        <Input
                          id="depositWalletBalance"
                          type="number"
                          step="0.01"
                          value={formData.depositWalletBalance}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              depositWalletBalance: e.target.value
                            });
                          }}
                          className="font-semibold text-primary"
                          placeholder="0.00"
                        />
                      </div>
                    </div>


                    <div className="border rounded-md p-4 bg-muted/20">
                      <h3 className="font-semibold mb-3 text-sm">Product Pricing</h3>
                      <div className="space-y-4 max-h-[200px] overflow-y-auto pr-2">
                        {products.map(product => (
                          <div key={product.id} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                            <div>
                              <Label htmlFor={`price-${product.id}`} className="text-sm font-medium">{product.name}</Label>
                              <p className="text-[10px] text-muted-foreground">Default: ₹{Number(product.price).toFixed(2)}</p>
                            </div>
                            <Input
                              id={`price-${product.id}`}
                              type="number"
                              step="any"
                              min="0"
                              placeholder={`Default: ${product.price}`}
                              value={formData.customPrices[product.id] || ''}
                              onChange={(e) => {
                                setFormData(prev => ({
                                  ...prev,
                                  customPrices: {
                                    ...prev.customPrices,
                                    [product.id]: e.target.value
                                  }
                                }));
                              }}
                              className="h-8 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Address */}
                  <div className="space-y-4">
                    <div className="border rounded-md p-4 bg-muted/20 h-full">
                      <h3 className="font-semibold mb-3 text-sm">Address</h3>
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="line1" className="text-xs">Address Line 1 *</Label>
                          <Input
                            id="line1"
                            value={formData.customerAddress.line1}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customerAddress: { ...formData.customerAddress, line1: e.target.value }
                              })
                            }
                            required
                            placeholder="House No., Building Name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="line2" className="text-xs">Address Line 2 </Label>
                          <Input
                            id="line2"
                            value={formData.customerAddress.line2}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customerAddress: { ...formData.customerAddress, line2: e.target.value }
                              })
                            }
                            placeholder="Street, Landmark"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="city" className="text-xs">City *</Label>
                          <Input
                            id="city"
                            value={formData.customerAddress.city}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                customerAddress: { ...formData.customerAddress, city: e.target.value }
                              })
                            }
                            required
                            placeholder="City"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 w-full overflow-hidden">

                          <div className="space-y-2 min-w-0">
                            <Label htmlFor="pincode" className="text-xs">Pincode *</Label>
                            <Select
                              value={formData.customerAddress.pincode}
                              onValueChange={(value) => {
                                // Auto-fill area and city
                                const match = serviceAreas.find(sa => sa.pincode === value);
                                setFormData(prev => ({
                                  ...prev,
                                  customerAddress: {
                                    ...prev.customerAddress,
                                    pincode: value,
                                    area: match ? match.areaName : prev.customerAddress.area,
                                    city: match ? 'Coimbatore' : prev.customerAddress.city
                                  }
                                }));
                              }}
                            >
                              <SelectTrigger id="pincode" className="w-full">
                                <div className="truncate text-left w-full">
                                  <SelectValue placeholder="Select Pincode" />
                                </div>
                              </SelectTrigger>
                              <SelectContent>
                                {serviceAreas.map((area) => (
                                  <SelectItem key={area.pincode} value={area.pincode}>
                                    <div className="truncate max-w-[100px] sm:max-w-[200px]">
                                      {area.pincode} - {area.areaName}
                                    </div>
                                  </SelectItem>
                                ))}
                                {serviceAreas.length === 0 && (
                                  <SelectItem value="none" disabled>No service areas available</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2 min-w-0">
                            <Label htmlFor="area" className="text-xs">Area *</Label>
                            <Input
                              id="area"
                              value={formData.customerAddress.area}
                              readOnly
                              className="bg-muted truncate"
                              placeholder="Area"
                            />
                          </div>
                        </div>
                        <div className="space-y-4 pt-4 border-t border-border/40">
                          <Label className="flex items-center gap-2 text-xs font-semibold">
                            <MapPin className="h-3 w-3 text-primary" />
                            Pin Exact Location *
                          </Label>
                          <MapPicker
                            value={formData.customerAddress.latitude && formData.customerAddress.longitude ? { lat: formData.customerAddress.latitude, lng: formData.customerAddress.longitude } : null}
                            onChange={(lat, lng) => {
                              setFormData({
                                ...formData,
                                customerAddress: {
                                  ...formData.customerAddress,
                                  latitude: lat,
                                  longitude: lng
                                }
                              });
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="productId">Product *</Label>
                    <Select
                      value={formData.productId}
                      onValueChange={(value) => {
                        // Check if a price already exists for this customer and product
                        const existingPrice = prices.find(
                          p => p.customerId === formData.customerId && p.productId === value
                        );

                        if (existingPrice) {
                          setSelectedPrice(existingPrice);
                          setFormData({
                            ...formData,
                            productId: value,
                            price: existingPrice.price.toString()
                          });
                        } else {
                          setSelectedPrice(null);
                          setFormData({
                            ...formData,
                            productId: value,
                            price: ''
                          });
                        }
                      }}
                      disabled={isEditMode || products.length === 1}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} (Default: ₹{Number(product.price).toFixed(2)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="price">Custom Price (₹) *</Label>
                    <Input
                      id="price"
                      type="number"
                      min="0"
                      step="any"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="50"
                      required
                    />
                    {formData.productId && (
                      <p className="text-xs text-muted-foreground">
                        Default price: ₹
                        {Number(products.find((p) => p.id === formData.productId)?.price || 0).toFixed(2)}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
            <DialogFooter className="px-6 py-4 bg-gray-50/50 border-t gap-2 flex-col sm:flex-row">
              {selectedPrice && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => handleDelete(selectedPrice)}
                  disabled={isSaving}
                  className="sm:mr-auto w-full sm:w-auto mb-2 sm:mb-0"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDialog(false)}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving} className="flex-1 sm:flex-none">
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : selectedPrice ? (
                    'Update Profile'
                  ) : selectedPrice ? (
                    'Update Price'
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer Price</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the custom price for{' '}
              <strong>{selectedPrice?.customerName || 'this customer'}</strong>? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isSaving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Wallet History Dialog */}
      <Dialog open={showWalletHistoryDialog} onOpenChange={setShowWalletHistoryDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Deposit History</DialogTitle>
            <DialogDescription>
              Transaction logs for <strong>{selectedWalletCustomer?.name || selectedWalletCustomer?.phone}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[500px] overflow-y-auto">
            {isWalletHistoryLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : walletHistory.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground italic">
                No deposit logs found for this customer.
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[140px]">Date & Time</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right w-[120px]">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {walletHistory.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="text-xs font-medium whitespace-nowrap">
                          {transaction.createdAtIST || (transaction.createdAt ? formatInTimeZone(new Date(transaction.createdAt), 'Asia/Kolkata', 'MMM dd, yyyy hh:mm:ss a') : 'N/A')}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium">{transaction.description}</span>
                            <span className={`text-[10px] uppercase font-bold ${transaction.type === 'CREDIT' ? 'text-green-600' : 'text-red-500'}`}>
                              {transaction.type}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className={`text-right font-mono font-bold whitespace-nowrap ${Number(transaction.amount) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {Number(transaction.amount) > 0 ? '+' : (Number(transaction.amount) < 0 ? '-' : '')}₹{Math.ceil(Math.abs(Number(transaction.amount)))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWalletHistoryDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div >
  );
}
