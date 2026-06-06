'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Calendar } from '../../../../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../../../components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../components/ui/dialog';
import { Badge } from '../../../../components/ui/badge';
import { format, subMonths } from 'date-fns';
import {
  CalendarIcon,
  Loader2,
  RefreshCcw,
  Package,
  Clock,
  User,
  MapPin,
  Download,
  Search,
  FileText,
  FileDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import { cn } from '../../../../lib/utils';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../../lib/admin-api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';

export default function ReassignedReportsPage() {
  const [startDate, setStartDate] = useState(subMonths(new Date(), 1));
  const [endDate, setEndDate] = useState(new Date());
  const [reportData, setReportData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const fetchReport = async () => {
    if (!startDate || !endDate) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
      });

      const response = await adminFetch(`/api/admin/reports/reassigned?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json();

      if (data.success) {
        setReportData(data.orders || []);
      } else {
        toast.error(data.message || 'Failed to fetch report');
      }
    } catch (err) {
      console.error('Error fetching report:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate]);

  const filteredOrders = useMemo(() => {
    if (!searchTerm) return reportData;
    const term = searchTerm.toLowerCase();
    return reportData.filter(order => 
      order.orderNumber?.toLowerCase().includes(term) ||
      order.customerName?.toLowerCase().includes(term) ||
      order.customerPhone?.toLowerCase().includes(term)
    );
  }, [reportData, searchTerm]);

  // Paginated data
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, itemsPerPage]);

  const getDisplayStatus = (order) => {
    if (order.status === 'CANCELLED') return 'Cancelled';
    if (order.status === 'DELIVERED' || order.deliveryStatus === 'DELIVERED') return 'DELIVERED';
    if (order.deliveryStatus === 'NOT_DELIVERED') return 'NOT DELIVERED';
    
    if (order.status === 'PENDING' && (order.paymentStatus === 'SUCCESS' || order.paymentStatus === 'COD') && !order.isAssigned) {
      return 'Order Received';
    }
    
    if (order.isAssigned && !order.isRouteGenerated && order.deliveryStatus !== 'DELIVERED' && order.deliveryStatus !== 'NOT_DELIVERED') {
      return 'Confirmed';
    }
    
    if (order.isRouteGenerated && order.deliveryStatus !== 'DELIVERED' && order.deliveryStatus !== 'NOT_DELIVERED') {
      return 'Delivery in Progress';
    }
    
    return order.status.replace(/_/g, ' ');
  };

  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;

      doc.setFontSize(20);
      doc.setTextColor(40, 40, 40);
      doc.text('Reassigned Orders Report', 14, 20);

      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, 14, 28);
      doc.text(`Range: ${format(startDate, 'PP')} - ${format(endDate, 'PP')}`, 14, 33);

      const tableRows = filteredOrders.map(order => [
        order.orderNumber || order.id.slice(-8).toUpperCase(),
        format(new Date(order.orderCreatedAt), 'dd/MM/yyyy'),
        order.customerName,
        `${getDisplayStatus(order)}${order.deliveredDate ? ` (${format(new Date(order.deliveredDate), 'dd/MM/yyyy hh:mm a')})` : ''}`,
        order.reassignmentCount,
        order.agingDays,
        // format(new Date(order.lastReassignedAt), 'dd/MM/yyyy hh:mm a')
      ]);

      autoTable(doc, {
        startY: 40,
        head: [['Order #', 'Created At', 'Customer', 'Status', 'Reassigned Count', 'Aging' /*, 'Last Reassigned' */]],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] },
        styles: { fontSize: 8 }
      });

      doc.save(`reassigned_report_${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}.pdf`);
      setIsDownloadDialogOpen(false);
      toast.success('PDF Downloaded');
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error('Failed to generate PDF');
    }
  };

  const handleDownloadExcel = () => {
    try {
      const excelData = [];
      
      // Header Info
      excelData.push(["Reassigned Orders Report"]);
      excelData.push(["Generated on:", format(new Date(), 'PPP p')]);
      excelData.push(["Range:", `${format(startDate, 'PP')} - ${format(endDate, 'PP')}`]);
      excelData.push([]); // Spacer

      // Table Headers
      const headers = ["Order #", "Created At", "Customer Name", "Phone", "Status", "Reassigned Count", "Aging (Days)" /*, "Last Reassigned" */];
      excelData.push(headers);

      // Data Rows
      filteredOrders.forEach(order => {
        excelData.push([
          order.orderNumber || order.id.slice(-8).toUpperCase(),
          format(new Date(order.orderCreatedAt), 'dd/MM/yyyy hh:mm a'),
          order.customerName,
          order.customerPhone,
          `${getDisplayStatus(order)}${order.deliveredDate ? ` at ${format(new Date(order.deliveredDate), 'dd/MM/yyyy hh:mm a')}` : ''}`,
          order.reassignmentCount,
          order.agingDays,
          // format(new Date(order.lastReassignedAt), 'dd/MM/yyyy hh:mm a')
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(excelData);
      
      // Basic styling
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
          if (!ws[cell_ref]) continue;
          if (R === 4) { // Header row (index 4 because of spacers)
             ws[cell_ref].s = { font: { bold: true }, fill: { fgColor: { rgb: "E5E7EB" } } };
          }
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reassigned Orders");
      XLSX.writeFile(wb, `reassigned_report_${format(startDate, 'yyyy-MM-dd')}.xlsx`);
      setIsDownloadDialogOpen(false);
      toast.success('Excel Sheet Downloaded');
    } catch (err) {
      console.error('Error generating Excel:', err);
      toast.error('Failed to generate Excel Sheet');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Reassigned Orders Report</h1>
          <p className="text-gray-500 mt-1">Monitor orders that have been reassigned across routes and staff.</p>
        </div>
        <Button 
          onClick={() => setIsDownloadDialogOpen(true)} 
          disabled={filteredOrders.length === 0 || isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
        >
          <Download className="mr-2 h-4 w-4" /> Download Report
        </Button>
      </div>

      <Card className="border-none shadow-sm bg-white">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Date Range Selectors */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">From Date</label>
              <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal border-gray-200",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-blue-500" />
                    {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      setStartDate(date);
                      setIsStartDatePickerOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">To Date</label>
              <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal border-gray-200",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-blue-500" />
                    {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => {
                      setEndDate(date);
                      setIsEndDatePickerOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Order #, Customer..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardHeader className="bg-white border-b border-gray-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold flex items-center">
              <RefreshCcw className="mr-2 h-5 w-5 text-blue-500" />
              Reassigned History
            </CardTitle>
            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 px-3 py-1">
              {filteredOrders.length} Orders Found
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
              <p className="text-gray-500 font-medium">Generating reassigned orders report...</p>
            </div>
          ) : filteredOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="font-bold py-4">Order #</TableHead>
                    <TableHead className="font-bold py-4">Customer</TableHead>
                    <TableHead className="font-bold py-4">Current Status</TableHead>
                    <TableHead className="font-bold py-4 text-center">Count</TableHead>
                    <TableHead className="font-bold py-4 text-center">Aging</TableHead>
                    {/* <TableHead className="font-bold py-4">Date & Time</TableHead> */}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.map((order) => (
                    <TableRow key={order.id} className="hover:bg-blue-50/30 transition-colors">
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600 font-bold">#{order.orderNumber || order.id.slice(-8).toUpperCase()}</span>
                            {order.isQrPayment && (
                              <Badge variant="secondary" className="bg-purple-100 text-purple-700 border-purple-200 text-[8px] py-0 px-1 font-bold h-4">
                                QR
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 flex items-center mt-1">
                            <Clock className="h-3 w-3 mr-1" />
                            {format(new Date(order.orderCreatedAt), 'dd MMM yyyy')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">{order.customerName}</span>
                          <span className="text-xs text-gray-500">{order.customerPhone}</span>
                          <span className="text-[10px] text-gray-400 flex items-center mt-0.5">
                            <MapPin className="h-2.5 w-2.5 mr-1" />
                            {order.addressArea}, {order.addressPincode}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            order.deliveryStatus === 'DELIVERED' ? "bg-green-100 text-green-700 border-green-200" :
                            order.status === 'CANCELLED' ? "bg-red-100 text-red-700 border-red-200" :
                            getDisplayStatus(order) === 'Delivery in Progress' ? "bg-blue-100 text-blue-700 border-blue-200" :
                            "bg-amber-100 text-amber-700 border-amber-200"
                          )}
                        >
                          {getDisplayStatus(order)}
                        </Badge>
                        {order.deliveredDate && (
                          <div className="text-[10px] text-green-600 font-medium mt-1 leading-tight">
                            Delivered at:
                            <div className="font-bold">{format(new Date(order.deliveredDate), 'dd MMM yyyy')}</div>
                            <div className="uppercase">{format(new Date(order.deliveredDate), 'hh:mm a')}</div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
                          {order.reassignmentCount}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          "font-bold",
                          order.agingDays > 7 ? "text-red-600" : 
                          order.agingDays > 3 ? "text-amber-600" : 
                          "text-gray-700"
                        )}>
                          {order.agingDays}
                        </span>
                      </TableCell>
                      {/* <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-700 font-medium">{format(new Date(order.lastReassignedAt), 'dd MMM yyyy')}</span>
                          <span className="text-[10px] text-gray-400 uppercase">{format(new Date(order.lastReassignedAt), 'hh:mm a')}</span>
                        </div>
                      </TableCell> */}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center">
                <Package className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">No reassigned orders found in this period.</p>
            </div>
          )}

          {/* Pagination Controls */}
          {!isLoading && filteredOrders.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-end gap-x-6 gap-y-4 py-4 border-t px-6 bg-gray-50/50">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Items per page:</span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => {
                    setItemsPerPage(parseInt(value));
                  }}
                >
                  <SelectTrigger className="h-8 w-[70px] bg-white">
                    <SelectValue placeholder={itemsPerPage} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="text-sm text-gray-500">
                <span className="font-medium text-gray-900">
                  {Math.min(filteredOrders.length, (currentPage - 1) * itemsPerPage + 1)}-
                  {Math.min(filteredOrders.length, currentPage * itemsPerPage)}
                </span>
                {" "}of{" "}
                <span className="font-medium text-gray-900">{filteredOrders.length}</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-medium">
                  Page {currentPage} of {totalPages || 1}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Download Report</DialogTitle>
            <DialogDescription>
              Select your preferred format for the reassigned orders report.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="space-y-3">
              <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground px-1">Select Format</label>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={handleDownloadPDF}
                  variant="outline"
                  className="flex flex-col items-center gap-3 h-auto py-6 rounded-2xl border-2 hover:border-blue-500 hover:bg-blue-50 transition-all group"
                >
                  <FileText className="h-10 w-10 text-red-500 group-hover:scale-110 transition-transform" />
                  <div className="text-center">
                    <span className="font-bold block">PDF</span>
                    <span className="text-[10px] text-muted-foreground">Printable Doc</span>
                  </div>
                </Button>
                <Button
                  onClick={handleDownloadExcel}
                  variant="outline"
                  className="flex flex-col items-center gap-3 h-auto py-6 rounded-2xl border-2 hover:border-green-500 hover:bg-green-50 transition-all group"
                >
                  <FileDown className="h-10 w-10 text-green-600 group-hover:scale-110 transition-transform" />
                  <div className="text-center">
                    <span className="font-bold block">EXCEL</span>
                    <span className="text-[10px] text-muted-foreground">Spreadsheet</span>
                  </div>
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="sm:justify-center border-t pt-4">
            <Button variant="ghost" className="w-full text-muted-foreground hover:text-foreground" onClick={() => setIsDownloadDialogOpen(false)}>
              Close Window
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
