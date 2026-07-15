'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
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
import { format, subMonths } from 'date-fns';
import {
  CalendarIcon,
  Loader2,
  RotateCcw,
  FileDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../../lib/admin-api';
import XLSX from 'xlsx-js-style';

export default function CODCollectionReportsPage() {
  const [startDate, setStartDate] = useState(subMonths(new Date(), 1));
  const [endDate, setEndDate] = useState(new Date());
  const [selectedRouteId, setSelectedRouteId] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [reportData, setReportData] = useState([]);
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
        routeId: selectedRouteId,
      });
      const res = await adminFetch(`/api/admin/reports/cod-collection?${params.toString()}`);
      const result = await res.json();
      if (result.success) {
        setRoutes(result.routes || []);
        setReportData(result.reportData);
        setCurrentPage(1);
      } else {
        setError(result.message || 'Failed to fetch report');
        toast.error(result.message || 'Failed to fetch report');
      }
    } catch (err) {
      console.error('Error fetching COD collection report:', err);
      setError('Network error. Please try again.');
      toast.error('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate, selectedRouteId]);

  const handleResetFilters = () => {
    setStartDate(subMonths(new Date(), 1));
    setEndDate(new Date());
    setSelectedRouteId('all');
  };

  const totalPages = Math.ceil(reportData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return reportData.slice(start, start + itemsPerPage);
  }, [reportData, currentPage, itemsPerPage]);

  const downloadExcel = () => {
    try {
      const headers = ['Delivered Date', 'Route', 'COD Collected Amount'];

      const excelData = [
        ['Route-wise COD Collection Report'],
        [`From date: ${format(startDate, 'dd-MM-yyyy')}   To Date: ${format(endDate, 'dd-MM-yyyy')}`],
        [],
        headers
      ];

      reportData.forEach(item => {
        const row = [
          format(new Date(item.date), 'dd-MM-yyyy'),
          item.routeName,
          item.collectedAmount || 0
        ];
        excelData.push(row);
      });

      // Add Total row
      let totalAmt = 0;
      reportData.forEach(item => {
        totalAmt += item.collectedAmount || 0;
      });

      const totalRow = ['Grand Total', '', totalAmt];
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
      ws['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 20 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'COD Collection');

      const formattedStartDate = format(startDate, 'dd-MM-yyyy');
      const formattedEndDate = format(endDate, 'dd-MM-yyyy');
      const fileName = `COD_Collection_Report(${formattedStartDate}_to_${formattedEndDate}).xlsx`;

      XLSX.writeFile(wb, fileName);
      toast.success('Excel Downloaded');
    } catch (err) {
      console.error('Download error:', err);
      toast.error('Failed to download Excel');
    }
  };

  return (
    <div className="space-y-6 w-full pb-10">
      <Card className="border border-slate-200 shadow-sm bg-white">
        <CardHeader className="border-b flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-4 print:hidden">
          <CardTitle className="text-lg font-semibold text-slate-800 shrink-0">COD Collection</CardTitle>

          {/* Filters & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto justify-end">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Start Date */}
              <div className="relative w-full sm:w-44">
                <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full h-9 justify-start text-left font-normal bg-white text-xs border-gray-200 shadow-sm", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{startDate ? format(startDate, "dd-MM-yyyy") : <span>Start Date</span>}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={(date) => { if (date) { setStartDate(date); setIsStartDatePickerOpen(false); } }} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              {/* End Date */}
              <div className="relative w-full sm:w-44">
                <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full h-9 justify-start text-left font-normal bg-white text-xs border-gray-200 shadow-sm", !endDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{endDate ? format(endDate, "dd-MM-yyyy") : <span>End Date</span>}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={endDate} onSelect={(date) => { if (date) { setEndDate(date); setIsEndDatePickerOpen(false); } }} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Route */}
              <div className="relative w-full sm:w-44">
                <Select value={selectedRouteId} onValueChange={setSelectedRouteId}>
                  <SelectTrigger className="w-full text-xs h-9 bg-white border-slate-200 shadow-sm">
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
            </div>

            {/* Reset Filters */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:text-red-700 text-xs h-9 shrink-0 px-3"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>

            {/* Export button */}
            {!isLoading && reportData.length > 0 && hasPermission('export_cod_collection_reports') && (
              <Button
                onClick={downloadExcel}
                size="sm"
                className="bg-green-600 hover:bg-green-700 shadow-sm text-white h-9 text-xs gap-1.5 shrink-0"
              >
                <FileDown className="h-4 w-4" /> Download Excel
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white">
              <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
              <p className="text-gray-500 text-sm font-medium">Calculating report data...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
              <TableHeader className="bg-gray-50/80">
                <TableRow>
                  <TableHead className="text-center font-bold text-gray-900 w-[150px] min-w-[150px]">Delivered Date</TableHead>
                  <TableHead className="text-center font-bold text-gray-900 border-l w-[250px] min-w-[250px]">Route</TableHead>
                  <TableHead className="text-right font-bold text-gray-900 border-l w-[200px] min-w-[200px]">COD Collected Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-32 text-center text-gray-500">No collected COD found.</TableCell>
                  </TableRow>
                ) : (
                  <>
                    {paginatedData.map((item, idx) => (
                      <TableRow key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <TableCell className="text-center text-gray-600 font-medium">
                          {format(new Date(item.date), 'dd-MM-yyyy')}
                        </TableCell>
                        <TableCell className="text-center text-gray-900 border-l">{item.routeName}</TableCell>
                        <TableCell className="text-right font-bold border-l">
                          ₹{(item.collectedAmount || 0).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-gray-50 font-bold">
                      <TableCell colSpan={2} className="text-right border-r">Grand Total Collected:</TableCell>
                      <TableCell className="text-right text-lg">
                        ₹{reportData.reduce((sum, item) => sum + (item.collectedAmount || 0), 0).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>

            {/* Pagination Controls */}
            {!isLoading && reportData.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-end gap-x-1 gap-y-4 mt-4 pt-4 border-t px-4 pb-4">
                {hasPermission('view_cod_collection_reports_count') && (
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

                  {hasPermission('view_cod_collection_reports_count') && (
                    <div className="text-sm">
                      Page {currentPage} of {totalPages || 1}
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 p-0 border-gray-200"
                    onClick={() => setCurrentPage(prev => Math.max(totalPages, prev + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
