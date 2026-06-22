'use client';

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx-js-style';
import { format, subMonths } from 'date-fns';

import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Label } from '../../../../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../components/ui/tabs';
import { Input } from '../../../../components/ui/input';
import { Badge } from '../../../../components/ui/badge';
import { Calendar } from '../../../../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../../../components/ui/popover';
import { Download, FileText, Loader2, Package, IndianRupee, Search, ChevronLeft, ChevronRight, History, CalendarDays, CalendarIcon, RotateCcw, FileDown } from 'lucide-react';
import { cn } from '../../../../lib/utils';

import { adminFetch } from '../../../../lib/admin-api';
import toast from 'react-hot-toast';

export default function DepositReportPage() {
  const [data, setData] = useState({ summary: null, customers: [], history: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('depositReportTab') || 'history';
    }
    return 'history';
  });
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('ALL');
  const [startDate, setStartDate] = useState(subMonths(new Date(), 1));
  const [endDate, setEndDate] = useState(new Date());
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  const handleTabChange = (value) => {
    setActiveTab(value);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('depositReportTab', value);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [activeTab, startDate, endDate]);

  // Reset to first page on search, tab change, or date filter
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab, startDate, endDate, paymentTypeFilter]);

  const fetchReport = async () => {
    setIsLoading(true);
    setError('');
    try {
      let url = `/api/admin/reports/deposit?tab=${activeTab}`;
      if (activeTab === 'history' && startDate && endDate) {
        url += `&startDate=${format(startDate, 'yyyy-MM-dd')}&endDate=${format(endDate, 'yyyy-MM-dd')}`;
      }

      const response = await adminFetch(url);
      const result = await response.json();
      
      if (result.success) {
        setData({
          summary: result.summary,
          customers: result.customers || [],
          history: result.history || []
        });
      } else {
        setError(result.message || 'Failed to fetch deposit report');
        toast.error(result.message || 'Failed to fetch deposit report');
      }
    } catch (err) {
      console.error('Error fetching deposit report:', err);
      setError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredData = activeTab === 'snapshot'
    ? data.customers.filter(c => 
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone?.includes(searchQuery) ||
        (c.id && c.id.slice(-8).toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : data.history.filter(t => {
        const matchesSearch = t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.phone?.includes(searchQuery) ||
          t.referenceId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.orderNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (t.customerId && t.customerId.slice(-8).toLowerCase().includes(searchQuery.toLowerCase()));
          
        let matchesPayment = true;
        if (paymentTypeFilter !== 'ALL') {
          if (paymentTypeFilter === 'QR Payment') {
            matchesPayment = t.isQrPayment === true;
          } else if (paymentTypeFilter === 'ONLINE') {
            matchesPayment = t.paymentMethod === 'ONLINE' && !t.isQrPayment;
          } else if (paymentTypeFilter === 'COD') {
            matchesPayment = t.paymentMethod === 'COD';
          }
        }
        
        return matchesSearch && matchesPayment;
      });

  const getDisplayPaymentType = (tx) => {
    if (tx.isQrPayment) return 'QR Payment';
    return tx.paymentMethod === 'ONLINE' && tx.paymentInstrument ? tx.paymentInstrument : (tx.paymentMethod || '-');
  };

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );


  const handleDownloadExcel = () => {
    if (!filteredData || filteredData.length === 0) {
      toast.error('No data to export');
      return;
    }

    try {
      const headers = activeTab === 'snapshot' 
        ? ['Customer ID', 'Customer Name', 'Phone', 'Cans in Hand', 'Deposit Balance']
        : ['Date', 'Time', 'Order Number', 'Customer ID', 'Customer Name', 'Phone', 'Payment Type', 'Amount'];

      const excelData = [
        [activeTab === 'snapshot' ? 'Customer Deposit & Cans Report' : 'Deposit Transaction History'],
        [`Generated on: ${format(new Date(), 'PPP p')}`],
        [],
        headers,
        ...(activeTab === 'snapshot' ? filteredData.map(c => [
          c.id ? c.id.slice(-8).toUpperCase() : 'N/A',
          c.name || 'N/A',
          c.phone || 'N/A',
          c.cansInHand || 0,
          c.depositWalletBalance || 0
        ]) : filteredData.map(tx => [
          tx.createdAt ? format(new Date(tx.createdAt), 'yyyy-MM-dd') : 'N/A',
          tx.createdAt ? format(new Date(tx.createdAt), 'hh:mm a') : 'N/A',
          tx.orderNumber || '-',
          tx.customerId ? tx.customerId.slice(-8).toUpperCase() : 'N/A',
          tx.name || 'N/A',
          tx.phone || 'N/A',
          getDisplayPaymentType(tx),
          tx.amount || 0
        ]))
      ];

      const ws = XLSX.utils.aoa_to_sheet(excelData);
      
      // Basic styling
      const headerRowIdx = excelData.indexOf(headers);
      if (headerRowIdx !== -1) {
        headers.forEach((_, colIdx) => {
          const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx, c: colIdx });
          if (ws[cellRef]) {
            ws[cellRef].s = {
              font: { bold: true },
              fill: { fgColor: { rgb: "F3F4F6" } }
            };
          }
        });
      }

      const colWidths = activeTab === 'snapshot' ? [
        { wch: 15 }, // Customer ID
        { wch: 30 }, // Customer Name
        { wch: 20 }, // Phone
        { wch: 15 }, // Cans in Hand
        { wch: 20 }  // Deposit Balance
      ] : [
        { wch: 15 }, // Date
        { wch: 12 }, // Time
        { wch: 20 }, // Order Number
        { wch: 15 }, // Customer ID
        { wch: 25 }, // Customer Name
        { wch: 15 }, // Phone
        { wch: 20 }, // Payment Type
        { wch: 15 }  // Amount
      ];
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Deposit Report");
      XLSX.writeFile(wb, `Deposit_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      
      toast.success('Excel Sheet Downloaded');
    } catch (error) {
      console.error('Error generating Excel:', error);
      toast.error('Failed to generate Excel Sheet');
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deposit Report</h1>
          <p className="text-gray-500">View overall customer deposits and cans in hand</p>
        </div>
        {!isLoading && filteredData.length > 0 && (
          <Button onClick={handleDownloadExcel} className="bg-green-600 hover:bg-green-700 shadow-sm transition-all hover:scale-[1.02]">
            <FileDown className="h-4 w-4 mr-2" /> Download Excel
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full sm:w-[400px] grid-cols-2 mb-6">
          <TabsTrigger value="snapshot">Overview</TabsTrigger>
          <TabsTrigger value="history">Deposit History</TabsTrigger>
        </TabsList>

      {error ? (
        <div className="bg-red-50 text-red-500 p-4 rounded-md border border-red-200">
          {error}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>


          <TabsContent value="snapshot" className="m-0">
            <Card>
            <CardHeader className="border-b">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <CardTitle>Customer Breakdown</CardTitle>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search by ID, name, or phone..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-[150px] min-w-[150px] pl-6">Customer ID</TableHead>
                      <TableHead className="w-[250px] min-w-[250px]">Customer</TableHead>
                      <TableHead className="w-[150px] min-w-[150px]">Phone</TableHead>
                      <TableHead className="w-[150px] min-w-[150px] text-center">Cans in Hand</TableHead>
                      <TableHead className="w-[150px] min-w-[150px] text-right">Deposit Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-gray-500">
                          {searchQuery ? 'No customers match your search.' : 'No deposit records found.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedData.map((customer, index) => (
                        <TableRow key={`${customer.id}-${index}`}>
                          <TableCell className="font-mono text-sm pl-6 text-gray-600">{customer.id ? customer.id.slice(-8).toUpperCase() : 'N/A'}</TableCell>
                          <TableCell className="font-medium">{customer.name || 'N/A'}</TableCell>
                          <TableCell>{customer.phone}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={customer.cansInHand > 0 ? "secondary" : "outline"} className="font-mono">
                              {customer.cansInHand || 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ₹{customer.depositWalletBalance || 0}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {!isLoading && filteredData.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-end gap-x-1 gap-y-4 mt-4 pt-4 border-t px-4 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm whitespace-nowrap">
                      <b>{Math.min(filteredData.length, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(filteredData.length, currentPage * itemsPerPage)}</b> of <b>{filteredData.length}</b>
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
                      className="h-9 w-9 p-0 border-gray-200"
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
                      className="h-9 w-9 p-0 border-gray-200"
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
        </TabsContent>

        <TabsContent value="history" className="m-0 space-y-6">
          <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Start Date</Label>
                  <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-11 border-gray-200", !startDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                        {startDate ? format(startDate, "dd-MM-yyyy") : <span>Start Date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={startDate} onSelect={(date) => { if (date) { setStartDate(date); setIsStartDatePickerOpen(false); } }} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">End Date</Label>
                  <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-11 border-gray-200", !endDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                        {endDate ? format(endDate, "dd-MM-yyyy") : <span>End Date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={endDate} onSelect={(date) => { if (date) { setEndDate(date); setIsEndDatePickerOpen(false); } }} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Payment Type</Label>
                  <Select value={paymentTypeFilter} onValueChange={setPaymentTypeFilter}>
                    <SelectTrigger className="w-full h-11 border-gray-200">
                      <SelectValue placeholder="Payment Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Payments</SelectItem>
                      <SelectItem value="ONLINE">Online</SelectItem>
                      <SelectItem value="COD">COD</SelectItem>
                      <SelectItem value="QR Payment">QR Payment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-3.5 h-4 w-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search by ID, name, or phone..."
                      className="pl-9 h-11 border-gray-200"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                <CardTitle>Deposit Transactions</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-[150px] min-w-[150px] pl-6">Date</TableHead>
                      <TableHead className="w-[150px] min-w-[150px]">Order Number</TableHead>
                      <TableHead className="w-[150px] min-w-[150px]">Customer ID</TableHead>
                      <TableHead className="w-[250px] min-w-[250px]">Customer</TableHead>
                      <TableHead className="w-[150px] min-w-[150px]">Payment Type</TableHead>
                      <TableHead className="w-[150px] min-w-[150px]">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-gray-500">
                          {!startDate || !endDate 
                            ? 'Please select a date range to view transactions.' 
                            : 'No deposit transactions found for the selected period.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedData.map((tx, index) => (
                        <TableRow key={`${tx.transactionId}-${index}`}>
                          <TableCell className="font-medium pl-6">
                            <div className="flex flex-col">
                              <span>{tx.createdAt ? format(new Date(tx.createdAt), 'MMM dd, yyyy') : 'N/A'}</span>
                              <span className="text-xs text-muted-foreground">{tx.createdAt ? format(new Date(tx.createdAt), 'hh:mm a') : ''}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {tx.orderNumber || '-'}
                          </TableCell>
                          <TableCell className="font-mono text-sm text-gray-600">
                            {tx.customerId ? tx.customerId.slice(-8).toUpperCase() : 'N/A'}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{tx.name || 'N/A'}</span>
                              <span className="text-xs text-muted-foreground">{tx.phone}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {tx.paymentMethod ? (
                               <Badge variant="outline">
                                 {getDisplayPaymentType(tx)}
                               </Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="font-medium text-green-600">
                            + ₹{tx.amount || 0}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {!isLoading && filteredData.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-end gap-x-1 gap-y-4 mt-4 pt-4 border-t px-4 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm whitespace-nowrap">
                      <b>{Math.min(filteredData.length, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(filteredData.length, currentPage * itemsPerPage)}</b> of <b>{filteredData.length}</b>
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
                      className="h-9 w-9 p-0 border-gray-200"
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
                      className="h-9 w-9 p-0 border-gray-200"
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
        </TabsContent>
        </>
      )}
      </Tabs>
    </div>
  );
}
