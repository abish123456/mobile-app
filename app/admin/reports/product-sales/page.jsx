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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Calendar } from '../../../../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../../../components/ui/popover';
import { Loader2, FileDown, CalendarIcon } from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { adminFetch } from '../../../../lib/admin-api';
import toast from 'react-hot-toast';

export default function ProductSalesReportPage() {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState(subMonths(new Date(), 1));
  const [endDate, setEndDate] = useState(new Date());
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState('ALL');

  useEffect(() => {
    fetchRoutes();
  }, []);

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate, selectedRoute]);

  const fetchRoutes = async () => {
    try {
      const response = await adminFetch('/api/admin/service-routes');
      const result = await response.json();
      if (result.success) {
        setRoutes(result.serviceRoutes || []);
      }
    } catch (err) {
      console.error('Error fetching routes:', err);
    }
  };

  const fetchReport = async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (startDate && endDate) {
        params.append('startDate', format(startDate, 'yyyy-MM-dd'));
        params.append('endDate', format(endDate, 'yyyy-MM-dd'));
      }
      params.append('routeId', selectedRoute);
      
      const url = `/api/admin/reports/product-sales?${params.toString()}`;

      const response = await adminFetch(url);
      const result = await response.json();
      
      if (result.success) {
        setData(result.data || []);
      } else {
        setError(result.message || 'Failed to fetch report');
        toast.error(result.message || 'Failed to fetch report');
      }
    } catch (err) {
      console.error('Error fetching report:', err);
      setError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setStartDate(subMonths(new Date(), 1));
    setEndDate(new Date());
    setSelectedRoute('ALL');
  };

  const handleDownloadExcel = () => {
    if (!data || data.length === 0) {
      toast.error('No data to export');
      return;
    }

    try {
      const headers = ['PRODUCT DETAILS', 'TAKEN', 'SALES', 'UNSOLD (FULL)', 'EMPTY CANS', 'DEPOSIT CANS'];

      const excelData = [
        ['Product Sales Report'],
        [`Date Range: ${startDate ? format(startDate, 'yyyy-MM-dd') : 'N/A'} to ${endDate ? format(endDate, 'yyyy-MM-dd') : 'N/A'}`],
        [`Generated on: ${format(new Date(), 'PPP p')}`],
        [],
        headers,
        ...data.map(item => [
          item.productName || 'N/A',
          item.taken || 0,
          item.sales || 0,
          item.unsoldReturn || 0,
          item.emptyReturn !== null ? item.emptyReturn : '-',
          item.newIssued !== null ? item.newIssued : '-'
        ])
      ];

      const ws = XLSX.utils.aoa_to_sheet(excelData);
      
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

      const colWidths = [
        { wch: 25 }, // Product Details
        { wch: 15 }, // Taken
        { wch: 15 }, // Sales
        { wch: 15 }, // Unsold Return
        { wch: 15 }, // Empty Cans
        { wch: 25 }, // Deposit Can
      ];
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Product Sales");
      XLSX.writeFile(wb, `Product_Sales_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      
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
          <h1 className="text-2xl font-bold text-gray-900">Product Sales Report</h1>
          <p className="text-gray-500">View taken, sales, and return quantities per product</p>
        </div>
        {!isLoading && data.length > 0 && (
          <Button onClick={handleDownloadExcel} className="bg-green-600 hover:bg-green-700 shadow-sm transition-all hover:scale-[1.02]">
            <FileDown className="h-4 w-4 mr-2" /> Download Excel
          </Button>
        )}
      </div>

      <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm mb-6">
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
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Route</Label>
              <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                <SelectTrigger className="w-full !h-11 border-gray-200">
                  <SelectValue placeholder="Select Route" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Routes</SelectItem>
                  {routes.map((route) => (
                    <SelectItem key={route.id} value={route.id}>
                      {route.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Button variant="outline" onClick={handleReset} className="w-full h-11 border-gray-200 hover:bg-gray-50 text-gray-600">
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div className="bg-red-50 text-red-500 p-4 rounded-md border border-red-200">
          {error}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Sales Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-[300px] min-w-[200px] pl-6 font-semibold">PRODUCT DETAILS</TableHead>
                    <TableHead className="w-[150px] min-w-[100px] font-semibold text-center">TAKEN</TableHead>
                    <TableHead className="w-[150px] min-w-[100px] font-semibold text-center">SALES</TableHead>
                    <TableHead className="w-[150px] min-w-[100px] font-semibold text-center">UNSOLD (FULL)</TableHead>
                    <TableHead className="w-[150px] min-w-[100px] font-semibold text-center">EMPTY CANS</TableHead>
                    <TableHead className="w-[150px] min-w-[100px] font-semibold text-center">DEPOSIT CANS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-gray-500">
                        No products found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((item, index) => (
                      <TableRow key={`${item.productId}-${index}`}>
                        <TableCell className="font-medium pl-6 text-gray-800 tracking-wide">
                          {item.productName || 'N/A'}
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {item.taken || 0}
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {item.sales || 0}
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {item.unsoldReturn || 0}
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {item.emptyReturn !== null ? item.emptyReturn : '-'}
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {item.newIssued !== null ? item.newIssued : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
