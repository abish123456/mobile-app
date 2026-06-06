'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Label } from '../../../../components/ui/label';
import { Calendar } from '../../../../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../../../components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui/table';
import { Badge } from '../../../../components/ui/badge';
import { Input } from '../../../../components/ui/input';
import { format, subMonths, isSameDay, subDays } from 'date-fns';
import {
  CalendarIcon,
  Loader2,
  RotateCcw,
  FileDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Package,
  TrendingUp,
  IndianRupee,
  AlertCircle,
  Clock,
  Coins
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../../lib/admin-api';
import XLSX from 'xlsx-js-style';

export default function RouteWiseDeliveryReportPage() {
  const [startDate, setStartDate] = useState(subDays(new Date(), 1));
  const [endDate, setEndDate] = useState(subDays(new Date(), 1));
  const [selectedRouteId, setSelectedRouteId] = useState('all');
  const [selectedDeliveryStatus, setSelectedDeliveryStatus] = useState('all');
  const [dateType, setDateType] = useState('deliveryDate'); // 'deliveryDate' or 'createdAt'

  const [isLoading, setIsLoading] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [error, setError] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  // Fetch report data
  const fetchData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        routeId: selectedRouteId,
        dateType: dateType,
      });
      const res = await adminFetch(`/api/admin/reports/route-wise?${params.toString()}`);
      const result = await res.json();
      if (result.success) {
        setRoutes(result.routes || []);
        setReportData(result.reportData || []);
        setCurrentPage(1);
      } else {
        setError(result.message || 'Failed to fetch report');
        toast.error(result.message || 'Failed to fetch report');
      }
    } catch (err) {
      console.error('Error fetching delivery status report:', err);
      setError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, selectedRouteId, dateType]);

  const handleResetFilters = () => {
    setStartDate(subDays(new Date(), 1));
    setEndDate(subDays(new Date(), 1));
    setSelectedRouteId('all');
    setSelectedDeliveryStatus('all');
    setDateType('deliveryDate');
  };

  // Filter local data based on additional dropdown status, payment, and search inputs
  const filteredData = useMemo(() => {
    return reportData.filter(item => {
      // 1. Delivery Status Filter
      if (selectedDeliveryStatus !== 'all') {
        if (selectedDeliveryStatus === 'DELIVERED' && item.deliveryClassification !== 'Delivered') return false;
        if (selectedDeliveryStatus === 'NOT_DELIVERED' && item.deliveryClassification !== 'Not Delivered') return false;
      }

      return true;
    });
  }, [reportData, selectedDeliveryStatus]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  // Overall metric totals for KPI cards
  const metrics = useMemo(() => {
    let totalAmount = 0;
    let totalItems = 0;
    let totalCod = 0;
    let totalOnline = 0;
    let totalQr = 0;
    let deliveredCount = 0;
    let notDeliveredCount = 0;

    filteredData.forEach(item => {
      totalAmount += item.amount || 0;
      totalItems += item.noOfItems || 0;
      totalCod += item.cod || 0;
      totalOnline += item.online || 0;
      totalQr += item.isQrPayment ? (item.amount || 0) : 0;

      if (item.deliveryStatus === 'DELIVERED') {
        deliveredCount++;
      } else {
        notDeliveredCount++;
      }
    });

    const successRate = filteredData.length > 0
      ? Math.round((deliveredCount / filteredData.length) * 100)
      : 0;

    return {
      totalAmount,
      totalItems,
      totalCod,
      totalOnline,
      totalQr,
      deliveredCount,
      notDeliveredCount,
      successRate
    };
  }, [filteredData]);

  // Download styled Excel report
  const downloadExcel = () => {
    try {
      const headers = [
        'Order Number', 
        'Customer Name', 
        'No. of Items', 
        'Total Amt (₹)', 
        'COD (₹)', 
        'Online (₹)', 
        'QR Payment (₹)',
        'Payment Type', 
        'Delivered / Not Delivered'
      ];

      const isSameDate = isSameDay(startDate, endDate);
      const dateLabel = isSameDate
        ? `Date: ${format(startDate, 'dd/MM/yyyy')}`
        : `Date Range: ${format(startDate, 'dd/MM/yyyy')} to ${format(endDate, 'dd/MM/yyyy')}`;

      const firstItem = filteredData[0];
      const routeText = selectedRouteId === 'all' 
        ? 'All Routes' 
        : (firstItem?.routeName || 'Unassigned');
      
      const staffText = selectedRouteId === 'all'
        ? 'All Staff'
        : (firstItem?.deliveryBoyName || 'Unassigned');

      const excelData = [
        ['Route-wise Delivery & Payment Status Report'],
        [
          dateLabel,
          '',
          '',
          '',
          `Generated: ${format(new Date(), 'dd/MM/yyyy hh:mm a')}`,
          '',
          '',
          '',
          ''
        ],
        [
          `Route Name: ${routeText}`,
          '',
          '',
          '',
          `Delivery Staff: ${staffText}`,
          '',
          '',
          '',
          ''
        ],
        [],
        headers
      ];

      filteredData.forEach(item => {
        const row = [
          item.orderNumber || '',
          item.customerName || '',
          item.noOfItems || 0,
          Math.round(item.amount || 0),
          Math.round(item.cod || 0),
          Math.round(item.online || 0),
          Math.round(item.isQrPayment ? (item.amount || 0) : 0),
          item.isQrPayment ? 'UPI (QR PAID)' : (item.paymentType || ''),
          item.deliveryClassification || 'Not Delivered'
        ];
        excelData.push(row);
      });

      // Add Grand Total Row
      const totalRow = [
        'Grand Total',
        '',
        metrics.totalItems,
        Math.round(metrics.totalAmount),
        Math.round(metrics.totalCod),
        Math.round(metrics.totalOnline),
        Math.round(metrics.totalQr),
        '',
        ''
      ];
      excelData.push(totalRow);

      const ws = XLSX.utils.aoa_to_sheet(excelData);

      // Styling parameters
      const range = XLSX.utils.decode_range(ws['!ref']);
      const headerRowIndex = 4;
      const totalRowIndex = excelData.length - 1;

      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_address = { c: C, r: R };
          const cell_ref = XLSX.utils.encode_cell(cell_address);
          if (!ws[cell_ref]) continue;

          // Base Styles (thin borders and default alignments)
          ws[cell_ref].s = {
            border: {
              top: { style: "thin", color: { rgb: "E5E7EB" } },
              bottom: { style: "thin", color: { rgb: "E5E7EB" } },
              left: { style: "thin", color: { rgb: "E5E7EB" } },
              right: { style: "thin", color: { rgb: "E5E7EB" } }
            },
            font: { sz: 10, name: "Segoe UI", color: { rgb: "374151" } },
            alignment: { vertical: "center", horizontal: "left" }
          };

          // Numbers align right
          if ([2, 3, 4, 5, 6].includes(C) && R >= headerRowIndex) {
            ws[cell_ref].s.alignment.horizontal = "right";
          }

          // Center statuses & IDs
          if ([0, 7, 8].includes(C) && R >= headerRowIndex) {
            ws[cell_ref].s.alignment.horizontal = "center";
          }

          // 1. Report Main Title
          if (R === 0) {
            ws[cell_ref].s.font = { bold: true, sz: 14, color: { rgb: "111827" } };
            ws[cell_ref].s.alignment = { horizontal: "center", vertical: "center" };
            ws[cell_ref].s.border = {};
          }

          // 2. Date info & Meta descriptions
          if (R === 1) {
            ws[cell_ref].s.font = { italic: true, sz: 9, color: { rgb: "4B5563" } };
            ws[cell_ref].s.border = {};
            if (C <= 3) {
              ws[cell_ref].s.alignment = { horizontal: "left", vertical: "center" };
            } else {
              ws[cell_ref].s.alignment = { horizontal: "right", vertical: "center" };
            }
          }

          // Route & Delivery Staff Common Row
          if (R === 2) {
            ws[cell_ref].s.font = { bold: true, sz: 9, color: { rgb: "374151" } };
            ws[cell_ref].s.border = {};
            if (C <= 3) {
              ws[cell_ref].s.alignment = { horizontal: "left", vertical: "center" };
            } else {
              ws[cell_ref].s.alignment = { horizontal: "right", vertical: "center" };
            }
          }

          // 3. Table Header
          if (R === headerRowIndex) {
            ws[cell_ref].s.font = { bold: true, sz: 10, color: { rgb: "111827" } };
            ws[cell_ref].s.alignment.horizontal = [2, 3, 4, 5, 6].includes(C) ? "right" : ([0, 7, 8].includes(C) ? "center" : "left");
            ws[cell_ref].s.border = {
              bottom: { style: "thin", color: { rgb: "9CA3AF" } },
              top: { style: "thin", color: { rgb: "E5E7EB" } },
              left: { style: "thin", color: { rgb: "E5E7EB" } },
              right: { style: "thin", color: { rgb: "E5E7EB" } }
            };
          }

          // 4. Color Code Delivery Status Classifications
          if (C === 8 && R > headerRowIndex && R < totalRowIndex) {
            ws[cell_ref].s.font = { sz: 10, color: { rgb: "374151" } };
          }

          // 5. Grand Total Row
          if (R === totalRowIndex) {
            ws[cell_ref].s.font = { bold: true, sz: 10, color: { rgb: "111827" } };
            ws[cell_ref].s.border = {
              top: { style: "thin", color: { rgb: "9CA3AF" } },
              bottom: { style: "thin", color: { rgb: "9CA3AF" } }
            };
          }
        }
      }

      // Merges for titles
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
        { s: { r: 1, c: 4 }, e: { r: 1, c: headers.length - 1 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
        { s: { r: 2, c: 4 }, e: { r: 2, c: headers.length - 1 } }
      ];

      // Auto-fit columns
      const colWidths = headers.map((h, colIdx) => {
        let maxLen = h.length;
        excelData.forEach((row, rowIdx) => {
          if (rowIdx > 3 && row[colIdx] !== undefined && row[colIdx] !== null) {
            const len = String(row[colIdx]).length;
            if (len > maxLen) maxLen = len;
          }
        });
        return { wch: Math.min(maxLen + 3, 50) };
      });
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Delivery Status');

      const fileName = `Route_Wise_Delivery_Report_${format(startDate, 'dd-MM-yyyy')}_to_${format(endDate, 'dd-MM-yyyy')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Excel Sheet Downloaded Successfully');
    } catch (err) {
      console.error('Download error:', err);
      toast.error('Failed to download Excel');
    }
  };

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-800">
            Route-wise Delivery & Payment Report
          </h1>
          <p className="text-gray-500 mt-1">Detailed delivery outcomes, items count, and cash vs online splits aggregated by route.</p>
        </div>
        {!isLoading && filteredData.length > 0 && (
          <Button
            onClick={downloadExcel}
            className="bg-green-600 hover:bg-green-700 shadow-md transition-all hover:scale-[1.02] text-white gap-2 h-11"
          >
            <FileDown className="h-5 w-5" /> Download Excel
          </Button>
        )}
      </div>
     

      {/* Interactive Filters Panel */}
      <Card className="border-none shadow-md bg-white/70 backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">

            <div className="space-y-2 col-span-1">
              <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Delivery Start Date</Label>
              <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-11 border-gray-200 bg-white shadow-sm", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => { if (date) { setStartDate(date); setIsStartDatePickerOpen(false); } }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2 col-span-1">
              <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Delivery End Date</Label>
              <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-11 border-gray-200 bg-white shadow-sm", !endDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => { if (date) { setEndDate(date); setIsEndDatePickerOpen(false); } }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2 col-span-1">
              <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Select Route</Label>
              <Select value={selectedRouteId} onValueChange={setSelectedRouteId}>
                <SelectTrigger className="w-full h-11 border-gray-200 bg-white shadow-sm">
                  <SelectValue placeholder="All Routes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Routes</SelectItem>
                  {routes.map(route => (
                    <SelectItem key={route.id} value={route.id}>{route.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 col-span-1">
              <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Delivery Outcomes</Label>
              <Select value={selectedDeliveryStatus} onValueChange={setSelectedDeliveryStatus}>
                <SelectTrigger className="w-full h-11 border-gray-200 bg-white shadow-sm">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Outcomes</SelectItem>
                  <SelectItem value="DELIVERED">Delivered</SelectItem>
                  <SelectItem value="NOT_DELIVERED">Not Delivered</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-1">
              <Button
                onClick={handleResetFilters}
                variant="outline"
                className="h-11 px-6 text-gray-500 hover:text-primary transition-colors border-gray-200 bg-white w-full"
              >
                <RotateCcw className="h-4 w-4 mr-2" /> Reset Filters
              </Button>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Main Table Segment */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl shadow-md border border-gray-100">
          <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
          <p className="text-gray-500 font-semibold">Aggregating delivery status metrics...</p>
        </div>
      ) : (
        <section className="space-y-4">
          <div className="rounded-xl border border-gray-100 shadow-md overflow-x-auto bg-white w-full">
            <Table className="min-w-[1150px]">
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="font-bold text-gray-900 py-4 pl-6 w-[140px]">Order Number</TableHead>
                  <TableHead className="font-bold text-gray-900 py-4 w-[220px]">Customer Name</TableHead>
                  <TableHead className="text-center font-bold text-gray-900 py-4 w-[110px]">No. of Items</TableHead>
                  <TableHead className="text-right font-bold text-gray-900 py-4 w-[110px]">Amt</TableHead>
                  <TableHead className="text-right font-bold text-gray-900 py-4 w-[110px]">COD</TableHead>
                  <TableHead className="text-right font-bold text-gray-900 py-4 w-[110px]">Online</TableHead>
                  <TableHead className="text-right font-bold text-gray-900 py-4 w-[130px]">QR Payment</TableHead>
                  <TableHead className="text-center font-bold text-gray-900 py-4 w-[140px]">COD/Online</TableHead>
                  <TableHead className="text-center font-bold text-gray-900 py-4 pr-6 w-[180px]">Delivered / Not Delivered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-36 text-center text-gray-500">
                      No matching records found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {paginatedData.map((item, idx) => (
                      <TableRow key={item.orderId || idx} className="hover:bg-gray-50/50 transition-colors">
                        <TableCell className="font-mono text-xs text-gray-500 pl-6 py-4">
                          {item.orderNumber}
                        </TableCell>
                        <TableCell className="font-medium text-gray-900">
                          <div className="flex flex-col">
                            <span>{item.customerName}</span>
                            <span className="text-xs text-muted-foreground font-normal">{item.customerPhone}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-bold text-gray-700">
                          {item.noOfItems}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-gray-900">
                          ₹{Math.round(item.amount)}
                        </TableCell>
                        <TableCell className="text-right text-gray-600 font-medium">
                          ₹{Math.round(item.cod)}
                        </TableCell>
                        <TableCell className="text-right text-gray-600 font-medium">
                          ₹{Math.round(item.online)}
                        </TableCell>
                        <TableCell className="text-right text-gray-600 font-semibold">
                          ₹{Math.round(item.isQrPayment ? item.amount : 0)}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.isQrPayment ? (
                            <div className="flex flex-col items-center gap-1 justify-center">
                              <Badge variant="outline" className="text-xs font-semibold border-gray-200 text-gray-700 bg-gray-50/30 px-2 py-0.5">
                                UPI
                              </Badge>
                              <Badge className="bg-purple-100 hover:bg-purple-100 text-purple-800 border-purple-200 text-[10px] font-extrabold px-2 py-0.5 tracking-wider">
                                QR PAID
                              </Badge>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs font-normal border-gray-300 px-2 py-0.5">
                              {item.paymentType}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center pr-6">
                          <Badge
                            className={cn(
                              "w-fit font-bold",
                              item.deliveryClassification === 'Delivered'
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                : "bg-rose-100 text-rose-800 border-rose-200"
                            )}
                          >
                            {item.deliveryClassification}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Table Totals Row */}
                    <TableRow className="bg-gray-50/70 font-bold border-t-2 border-gray-200">
                      <TableCell colSpan={2} className="text-right pl-6 py-4 text-gray-700">Grand Totals:</TableCell>
                      <TableCell className="text-center text-gray-900">{metrics.totalItems}</TableCell>
                      <TableCell className="text-right text-lg text-gray-700">₹{Math.round(metrics.totalAmount).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-gray-800">₹{Math.round(metrics.totalCod).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-gray-800">₹{Math.round(metrics.totalOnline).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-gray-700 font-bold">₹{Math.round(metrics.totalQr).toLocaleString()}</TableCell>
                      <TableCell colSpan={2} className="pr-6"></TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>

            {/* Pagination Segment */}
            {!isLoading && filteredData.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-end gap-x-1 gap-y-4 py-5 border-t border-gray-100 px-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 whitespace-nowrap">
                    Showing <b>{Math.min(filteredData.length, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(filteredData.length, currentPage * itemsPerPage)}</b> of <b>{filteredData.length}</b> orders
                  </span>
                  <Select
                    value={itemsPerPage.toString()}
                    onValueChange={(value) => {
                      setItemsPerPage(parseInt(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="h-9 w-auto border-none shadow-none bg-transparent hover:bg-gray-100 focus:ring-0 gap-1 px-2">
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
                    className="h-9 w-9 p-0 border-gray-200 bg-white"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>

                  <div className="text-sm text-gray-700">
                    Page <b>{currentPage}</b> of <b>{totalPages || 1}</b>
                  </div>

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 p-0 border-gray-200 bg-white"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
