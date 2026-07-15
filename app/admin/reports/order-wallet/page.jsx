'use client';

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx-js-style';
import { format, subMonths } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

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
import { Download, FileText, Loader2, IndianRupee, Search, ChevronLeft, ChevronRight, History, CalendarDays, CalendarIcon, RotateCcw, FileDown, Wallet } from 'lucide-react';
import { cn } from '../../../../lib/utils';

import { adminFetch } from '../../../../lib/admin-api';
import toast from 'react-hot-toast';

export default function OrderWalletReportPage() {
  const [data, setData] = useState({ summary: null, topBalances: [], transactions: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('orderWalletReportTab') || 'history';
    }
    return 'history';
  });
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [startDate, setStartDate] = useState(subMonths(new Date(), 1));
  const [endDate, setEndDate] = useState(new Date());
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  const handleTabChange = (value) => {
    setActiveTab(value);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('orderWalletReportTab', value);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab, startDate, endDate, typeFilter]);

  const fetchReport = async () => {
    setIsLoading(true);
    setError('');
    try {
      let url = `/api/admin/order-wallet?page=1&limit=5000`; // Fetch all for frontend pagination
      if (startDate && endDate) {
        url += `&fromDate=${format(startDate, 'yyyy-MM-dd')}&toDate=${format(endDate, 'yyyy-MM-dd')}`;
      }

      const response = await adminFetch(url);
      const result = await response.json();
      
      if (result.success) {
        setData({
          summary: result.summary,
          topBalances: result.topBalances || [],
          transactions: result.transactions || []
        });
      } else {
        setError(result.message || 'Failed to fetch order wallet report');
        toast.error(result.message || 'Failed to fetch order wallet report');
      }
    } catch (err) {
      console.error('Error fetching order wallet report:', err);
      setError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredData = activeTab === 'snapshot'
    ? data.topBalances.filter(c => 
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone?.includes(searchQuery) ||
        (c.id && c.id.slice(-8).toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : data.transactions.filter(t => {
        const matchesSearch = t.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.customerPhone?.includes(searchQuery) ||
          t.referenceId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.orderNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (t.customerId && t.customerId.slice(-8).toLowerCase().includes(searchQuery.toLowerCase()));
          
        let matchesType = true;
        if (typeFilter !== 'ALL') {
          matchesType = t.type === typeFilter;
        }
        
        return matchesSearch && matchesType;
      });

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
        ? ['Customer ID', 'Customer Name', 'Phone', 'Order Wallet Balance']
        : ['Date & Time', 'Customer ID', 'Customer Name', 'Phone', 'Transaction Type', 'Amount (₹)', 'Reference Type', 'Reference #', 'Description'];

      const rowData = activeTab === 'snapshot'
        ? filteredData.map(c => [
            c.id,
            c.name || '-',
            c.phone || '-',
            c.balance || 0
          ])
        : filteredData.map(t => [
            t.createdAt ? formatInTimeZone(new Date(t.createdAt), 'Asia/Kolkata', 'dd MMM yyyy, h:mm a') : '-',
            t.customerId || '-',
            t.customerName || '-',
            t.customerPhone || '-',
            t.type || '-',
            t.amount || 0,
            t.referenceType || '-',
            t.orderNumber || t.referenceId || '-',
            t.description || '-'
          ]);

      const worksheetData = [headers, ...rowData];
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      
      const wscols = activeTab === 'snapshot'
        ? [{wch: 35}, {wch: 25}, {wch: 15}, {wch: 20}]
        : [{wch: 22}, {wch: 35}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 20}, {wch: 30}];
      
      worksheet['!cols'] = wscols;

      const titleStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "0F172A" } } };
      for (let i = 0; i < headers.length; i++) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c: i });
        if (!worksheet[cellRef]) continue;
        worksheet[cellRef].s = titleStyle;
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, activeTab === 'snapshot' ? "Balances" : "Transactions");
      
      const fileName = `OrderWallet_${activeTab === 'snapshot' ? 'Balances' : 'Transactions'}_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      toast.success('Excel file downloaded successfully');
    } catch (err) {
      console.error('Error generating Excel file:', err);
      toast.error('Failed to generate Excel file');
    }
  };

  const handleDownloadCsv = () => {
    let url = `/api/admin/order-wallet?export=csv`;
    if (activeTab === 'history' && startDate && endDate) {
      url += `&fromDate=${format(startDate, 'yyyy-MM-dd')}&toDate=${format(endDate, 'yyyy-MM-dd')}`;
    }
    if (activeTab === 'history' && typeFilter !== 'ALL') {
      url += `&type=${typeFilter}`;
    }
    window.location.href = url;
  };

  const resetFilters = () => {
    setStartDate(subMonths(new Date(), 1));
    setEndDate(new Date());
    setTypeFilter('ALL');
    setSearchQuery('');
  };

  return (
    <div className="space-y-6 pb-24">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <TabsList className="grid w-full lg:w-[320px] grid-cols-2 bg-slate-100 p-1 shrink-0">
            <TabsTrigger value="history" className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm transition-all rounded-md">
              <History className="h-4 w-4" />
              Transactions
            </TabsTrigger>
            <TabsTrigger value="snapshot" className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm transition-all rounded-md">
              <IndianRupee className="h-4 w-4" />
              Top Balances
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto justify-end">
            {activeTab === 'history' && (
              <>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative w-full sm:w-44">
                    <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full h-9 justify-start text-left font-normal bg-white text-xs border-slate-200 shadow-sm", !startDate && "text-muted-foreground")}
                        >
                          <CalendarIcon className="mr-2 h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{startDate ? format(startDate, "MMM dd, yyyy") : <span>Start Date</span>}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={(date) => { setStartDate(date); setIsStartDatePickerOpen(false); }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="relative w-full sm:w-44">
                    <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn("w-full h-9 justify-start text-left font-normal bg-white text-xs border-slate-200 shadow-sm", !endDate && "text-muted-foreground")}
                        >
                          <CalendarIcon className="mr-2 h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{endDate ? format(endDate, "MMM dd, yyyy") : <span>End Date</span>}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={(date) => { setEndDate(date); setIsEndDatePickerOpen(false); }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <Button variant="outline" size="sm" onClick={resetFilters} className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:text-red-700 text-xs h-9 shrink-0 px-3">
                  Reset
                </Button>
              </>
            )}

            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" onClick={handleDownloadExcel} className="bg-white shadow-sm h-9 text-xs" disabled={isLoading}>
                <FileDown className="mr-1.5 h-4 w-4" />
                Export Excel
              </Button>
              <Button onClick={fetchReport} disabled={isLoading} className="shadow-sm h-9 text-xs">
                <RotateCcw className={cn("mr-1.5 h-4 w-4", isLoading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {activeTab === 'history' && data.summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card className="bg-white border-slate-200 shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Total Transactions</p>
                  <h3 className="text-2xl font-bold text-slate-900">{data.summary.txCount}</h3>
                </div>
                <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                  <History className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-slate-200 shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Total Credits (+)</p>
                  <h3 className="text-2xl font-bold text-emerald-600">₹{data.summary.totalCredits}</h3>
                </div>
                <div className="h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <Download className="h-6 w-6 rotate-180" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-slate-200 shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Total Debits (-)</p>
                  <h3 className="text-2xl font-bold text-amber-600">₹{data.summary.totalDebits}</h3>
                </div>
                <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                  <Download className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white border-slate-200 shadow-sm">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Net Balance Change</p>
                  <h3 className={cn("text-2xl font-bold", data.summary.net >= 0 ? "text-emerald-600" : "text-amber-600")}>
                    {data.summary.net >= 0 ? '+' : ''}₹{data.summary.net}
                  </h3>
                </div>
                <div className={cn("h-12 w-12 rounded-full flex items-center justify-center", data.summary.net >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                  <Wallet className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Data Table */}
        <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                {activeTab === 'history' ? <History className="h-5 w-5 text-blue-500" /> : <IndianRupee className="h-5 w-5 text-blue-500" />}
                {activeTab === 'history' ? 'Transaction History' : 'Top Order Wallet Balances'}
              </CardTitle>
              <div className="flex flex-col sm:flex-row gap-3">
                {activeTab === 'history' && (
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[140px] bg-white h-9 text-sm">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Types</SelectItem>
                      <SelectItem value="CREDIT">Credits (+)</SelectItem>
                      <SelectItem value="DEBIT">Debits (-)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search customer, ID, phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-white h-9 text-sm"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex flex-col justify-center items-center h-64 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin mb-4 text-blue-500" />
                <p>Loading report data...</p>
              </div>
            ) : error ? (
              <div className="flex justify-center items-center h-64 text-red-500">
                <p>{error}</p>
              </div>
            ) : paginatedData.length === 0 ? (
              <div className="flex flex-col justify-center items-center h-64 text-slate-500">
                <FileText className="h-12 w-12 mb-4 text-slate-300" />
                <p className="text-lg font-medium text-slate-700">No records found</p>
                <p className="text-sm">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                      {activeTab === 'snapshot' ? (
                        <>
                          <TableHead className="w-[200px] font-semibold text-slate-600">Customer</TableHead>
                          <TableHead className="font-semibold text-slate-600">Contact</TableHead>
                          <TableHead className="text-right font-semibold text-slate-600">Wallet Balance</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead className="w-[180px] font-semibold text-slate-600">Date & Time</TableHead>
                          <TableHead className="w-[200px] font-semibold text-slate-600">Customer</TableHead>
                          <TableHead className="font-semibold text-slate-600">Transaction</TableHead>
                          <TableHead className="font-semibold text-slate-600">Reference</TableHead>
                          <TableHead className="text-right font-semibold text-slate-600">Amount</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeTab === 'snapshot' ? (
                      paginatedData.map((customer) => (
                        <TableRow key={customer.id} className="hover:bg-slate-50/50">
                          <TableCell>
                            <div className="font-medium text-slate-900">{customer.name || '-'}</div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">ID: {customer.id?.substring(0, 8)}...</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-slate-700">{customer.phone || '-'}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="font-bold text-green-600 text-lg">₹{customer.balance || 0}</span>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      paginatedData.map((tx) => (
                        <TableRow key={tx.id} className="hover:bg-slate-50/50">
                          <TableCell>
                            <div className="font-medium text-slate-900">
                              {formatInTimeZone(new Date(tx.createdAt), 'Asia/Kolkata', 'dd MMM yyyy')}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {formatInTimeZone(new Date(tx.createdAt), 'Asia/Kolkata', 'h:mm a')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-slate-900">{tx.customerName || '-'}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                              <span>{tx.customerPhone || '-'}</span>
                              <span className="font-mono text-[10px] bg-slate-100 px-1 rounded">{tx.customerId?.substring(0, 8)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 items-start">
                              <Badge variant="outline" className={cn(
                                "font-semibold text-[11px] px-2 py-0 h-5",
                                tx.type === 'CREDIT' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                              )}>
                                {tx.type}
                              </Badge>
                              {tx.description && (
                                <div className="text-xs text-slate-500 max-w-[200px] truncate" title={tx.description}>
                                  {tx.description}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {tx.orderNumber ? (
                              <div>
                                <span className="text-xs font-semibold text-slate-700">Order</span>
                                <div className="text-xs font-mono text-slate-500 mt-0.5">{tx.orderNumber}</div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={cn(
                              "font-bold text-base",
                              tx.type === 'CREDIT' ? "text-emerald-600" : "text-amber-600"
                            )}>
                              {tx.type === 'CREDIT' ? '+' : '-'}₹{tx.amount}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
            
            {/* Pagination */}
            {!isLoading && totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-slate-500">
                    Showing <span className="font-medium text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium text-slate-900">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> of <span className="font-medium text-slate-900">{filteredData.length}</span> entries
                  </p>
                  <Select value={itemsPerPage.toString()} onValueChange={(val) => { setItemsPerPage(parseInt(val)); setCurrentPage(1); }}>
                    <SelectTrigger className="h-8 w-[70px] text-xs bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-8 bg-white"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                  </Button>
                  <div className="text-sm font-medium text-slate-600 min-w-[3rem] text-center">
                    {currentPage} / {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-8 bg-white"
                  >
                    Next <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
