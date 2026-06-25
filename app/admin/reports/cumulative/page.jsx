'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Label } from '../../../../components/ui/label';
import { Calendar } from '../../../../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../../../components/ui/popover';
import { Checkbox } from '../../../../components/ui/checkbox';
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
import { format, subMonths } from 'date-fns';
import {
  CalendarIcon,
  Loader2,
  Download,
  RotateCcw,
  FileDown,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../../lib/admin-api';
import XLSX from 'xlsx-js-style';

export default function CumulativeReportsPage() {
  const [startDate, setStartDate] = useState(subMonths(new Date(), 1));
  const [endDate, setEndDate] = useState(new Date());
  const [groupByRoute, setGroupByRoute] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState({ products: [], dateWiseReports: [], routeWiseReports: [] });
  const [error, setError] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const [adminPermissions, setAdminPermissions] = useState([]);

  useEffect(() => {
    try {
      const perms = localStorage.getItem('adminPermissions');
      if (perms) {
        setAdminPermissions(JSON.parse(perms));
      }
    } catch (e) {
      console.error('Failed to parse admin permissions', e);
    }
  }, []);

  const hasPermission = (perm) => {
    return adminPermissions.includes('SUPER_ADMIN') || adminPermissions.includes(perm);
  };

  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
      });
      const res = await adminFetch(`/api/admin/reports/cumulative?${params.toString()}`);
      const result = await res.json();
      if (result.success) {
        setData(result);
        setCurrentPage(1);
      } else {
        setError(result.message || 'Failed to fetch cumulative reports');
        toast.error(result.message || 'Failed to fetch cumulative reports');
      }
    } catch (err) {
      console.error('Error fetching cumulative reports:', err);
      setError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  const handleResetFilters = () => {
    setStartDate(subMonths(new Date(), 1));
    setEndDate(new Date());
    setGroupByRoute(false);
  };

  const reportData = groupByRoute ? data.routeWiseReports : data.dateWiseReports;
  const totalPages = Math.ceil(reportData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return reportData.slice(start, start + itemsPerPage);
  }, [reportData, currentPage, itemsPerPage]);

  const downloadExcel = () => {
    try {
      const products = data.products;

      // Prepare headers
      const headers = groupByRoute ? ['Route', 'Order Date'] : ['Order Date'];
      products.forEach(p => {
        headers.push(p.name, 'Amount');
      });
      headers.push('Total Amount');

      const excelData = [
        [groupByRoute ? 'Route wise cumulative order' : 'Date wise cumulative order'],
        [`From date: ${format(startDate, 'dd-MM-yyyy')}   To Date: ${format(endDate, 'dd-MM-yyyy')}`],
        [],
        headers
      ];

      // Prepare rows
      reportData.forEach(item => {
        const row = groupByRoute 
          ? [item.routeName, format(new Date(item.date), 'dd-MM-yyyy')]
          : [format(new Date(item.date), 'dd-MM-yyyy')];
        
        products.forEach(p => {
          const prodData = item.products[p.name] || { quantity: 0, amount: 0 };
          row.push(prodData.quantity || 0, prodData.amount || 0);
        });
        row.push(item.totalAmount || 0);
        excelData.push(row);
      });

      // Add Total row
      const totalRow = groupByRoute ? ['Total', ''] : ['Total'];
      products.forEach(p => {
        let totalQty = 0, totalAmt = 0;
        reportData.forEach(item => {
          const prodData = item.products[p.name] || { quantity: 0, amount: 0 };
          totalQty += prodData.quantity || 0;
          totalAmt += prodData.amount || 0;
        });
        totalRow.push(totalQty, totalAmt);
      });

      let grandTotal = 0;
      reportData.forEach(item => grandTotal += item.totalAmount || 0);
      totalRow.push(grandTotal);
      excelData.push(totalRow);

      const ws = XLSX.utils.aoa_to_sheet(excelData);

      // Styling
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_address = { c: C, r: R };
          const cell_ref = XLSX.utils.encode_cell(cell_address);
          if (!ws[cell_ref]) continue;

          ws[cell_ref].s = {
            border: {
              top: { style: "thin", color: { rgb: "000000" } },
              bottom: { style: "thin", color: { rgb: "000000" } },
              left: { style: "thin", color: { rgb: "000000" } },
              right: { style: "thin", color: { rgb: "000000" } }
            },
            alignment: { horizontal: "center", vertical: "center" }
          };

          if (R === 0) {
             ws[cell_ref].s.font = { bold: true, sz: 14 };
             ws[cell_ref].s.alignment = { horizontal: "center" };
             ws[cell_ref].s.fill = { fgColor: { rgb: "E0E0E0" } };
          }
          if (R === 1) {
             ws[cell_ref].s.font = { bold: true, sz: 11 };
             ws[cell_ref].s.alignment = { horizontal: "center" };
          }
          if (R === 3) {
            ws[cell_ref].s.font = { bold: true };
            ws[cell_ref].s.fill = { fgColor: { rgb: "F0F0F0" } };
          }
          if (R === excelData.length - 1) {
            ws[cell_ref].s.font = { bold: true };
          }
        }
      }

      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } }
      ];

      // Set column widths
      ws['!cols'] = headers.map((_, i) => ({ wch: i === 0 && groupByRoute ? 25 : 15 }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cumulative Report');
      const formattedStartDate = format(startDate, 'dd-MM-yyyy');
      const formattedEndDate = format(endDate, 'dd-MM-yyyy');
      const fileName = `${groupByRoute ? 'route_wise_report' : 'date_wise_report'} ( ${formattedStartDate} - ${formattedEndDate} ).xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Excel Downloaded');
    } catch (err) {
      console.error('Download error:', err);
      toast.error('Failed to download Excel');
    }
  };

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Cumulative Order Reports
          </h1>
          <p className="text-gray-500 mt-1">Aggregated order summaries across all products</p>
        </div>
        {!isLoading && reportData.length > 0 && hasPermission('export_cumulative_reports') && (
          <Button onClick={downloadExcel} className="bg-green-600 hover:bg-green-700 shadow-sm transition-all hover:scale-[1.02]">
            <FileDown className="h-4 w-4 mr-2" /> Download Excel
          </Button>
        )}
      </div>

      <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Start Date</Label>
              <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-11 border-gray-200", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
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
                    {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={(date) => { if (date) { setEndDate(date); setIsEndDatePickerOpen(false); } }} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Breakdown</Label>
              <div className="flex items-center space-x-2 h-11 px-3 border border-gray-200 rounded-md bg-white/50">
                <Checkbox 
                  id="groupByRoute" 
                  checked={groupByRoute} 
                  onCheckedChange={(checked) => {
                    setGroupByRoute(!!checked);
                    setCurrentPage(1);
                  }} 
                />
                <Label htmlFor="groupByRoute" className="text-sm font-medium leading-none cursor-pointer">
                  Route wise
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</Label>
              <Button onClick={handleResetFilters} variant="outline" className="h-11 w-full px-4 text-gray-500 hover:text-primary transition-colors border-gray-200">
                <RotateCcw className="h-4 w-4 mr-2" /> Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl shadow-sm border border-gray-100">
          <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
          <p className="text-gray-500 font-medium">Generating cumulative data...</p>
        </div>
      ) : (
        <section className="space-y-4">

          <div className="rounded-xl border border-gray-100 shadow-sm overflow-hidden bg-white w-full">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-50/80">
                  <TableRow>
                    {groupByRoute && <TableHead className="font-bold text-gray-900 sticky left-0 bg-gray-50 z-10 w-[200px] min-w-[200px]">Route</TableHead>}
                    <TableHead className={cn("font-bold text-gray-900 w-[120px] min-w-[120px]", groupByRoute ? "border-l" : "sticky left-0 bg-gray-50 z-10")}>Ordered Date</TableHead>
                    {data.products.map(p => (
                      <Fragment key={p.id}>
                        <TableHead className="text-center font-bold text-gray-900 border-l w-[120px] min-w-[120px]">{p.name}</TableHead>
                        <TableHead className="text-center font-bold text-gray-900 border-l w-[120px] min-w-[120px]">Amount</TableHead>
                      </Fragment>
                    ))}
                    <TableHead className="text-right font-bold text-gray-900 border-l w-[150px] min-w-[150px]">Total Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={data.products.length * 2 + (groupByRoute ? 3 : 2)} className="h-32 text-center text-gray-500">No orders found.</TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {paginatedData.map((report, idx) => (
                        <TableRow key={idx} className="hover:bg-gray-50/50 transition-colors">
                          {groupByRoute && <TableCell className="font-medium text-gray-900 sticky left-0 bg-white">{report.routeName}</TableCell>}
                          <TableCell className={cn("text-gray-600", groupByRoute ? "border-l" : "font-medium text-gray-900 sticky left-0 bg-white")}>
                            {format(new Date(report.date), 'dd-MM-yyyy')}
                          </TableCell>
                          {data.products.map(p => (
                            <Fragment key={p.id}>
                              <TableCell className="text-center border-l text-gray-600">{report.products[p.name]?.quantity || 0}</TableCell>
                              <TableCell className="text-center border-l text-gray-600">₹{(report.products[p.name]?.amount || 0).toLocaleString()}</TableCell>
                            </Fragment>
                          ))}
                          <TableCell className="text-right font-bold text-gray-900 border-l">₹{(report.totalAmount || 0).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-gray-50 font-bold">
                        <TableCell colSpan={groupByRoute ? 2 : 1} className="sticky left-0 bg-gray-50">Grand Total</TableCell>
                        {data.products.map(p => {
                          let totalQty = 0, totalAmt = 0;
                          reportData.forEach(r => { totalQty += r.products[p.name]?.quantity || 0; totalAmt += r.products[p.name]?.amount || 0; });
                          return (
                            <Fragment key={p.id}>
                              <TableCell className="text-center border-l">{totalQty}</TableCell>
                              <TableCell className="text-center border-l">₹{totalAmt.toLocaleString()}</TableCell>
                            </Fragment>
                          );
                        })}
                        <TableCell className="text-right text-gray-900 border-l">₹{reportData.reduce((sum, r) => sum + r.totalAmount, 0).toLocaleString()}</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {!isLoading && reportData.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-end gap-x-1 gap-y-4 mt-4 pt-4 border-t px-4 pb-4">
                {hasPermission('view_cumulative_reports_count') && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm whitespace-nowrap">
                      <b>{Math.min(reportData.length, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(reportData.length, currentPage * itemsPerPage)}</b> of <b>{reportData.length}</b>
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
                )}

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

                  {hasPermission('view_cumulative_reports_count') && (
                    <div className="text-sm">
                      Page {currentPage} of {totalPages || 1}
                    </div>
                  )}

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
          </div>
        </section>
      )}
    </div>
  );
}
