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
import { format, subDays, isSameDay } from 'date-fns';
import {
  CalendarIcon,
  Loader2,
  RotateCcw,
  FileDown,
  Coins,
  CreditCard,
  TrendingUp,
  IndianRupee,
  ShieldCheck,
  Briefcase
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../../lib/admin-api';
import XLSX from 'xlsx-js-style';

export default function CashSettlementReportPage() {
  const [startDate, setStartDate] = useState(subDays(new Date(), 1));
  const [endDate, setEndDate] = useState(subDays(new Date(), 1));

  const [isLoading, setIsLoading] = useState(false);
  const [reportData, setReportData] = useState([]);
  const [error, setError] = useState('');

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
      });
      const res = await adminFetch(`/api/admin/reports/cash-settlement?${params.toString()}`);
      const result = await res.json();
      if (result.success) {
        setReportData(result.settlementData || []);
      } else {
        setError(result.message || 'Failed to fetch settlement report');
        toast.error(result.message || 'Failed to fetch settlement report');
      }
    } catch (err) {
      console.error('Error fetching cash settlement report:', err);
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
    setStartDate(subDays(new Date(), 1));
    setEndDate(subDays(new Date(), 1));
  };

  // Grand totals calculation for the bottom row
  const grandTotals = useMemo(() => {
    let totalSales = 0;
    let cashSales = 0;
    let cashDeposit = 0;
    let officeGpay = 0;
    let officeGpayDeposit = 0;
    let qrPayment = 0;
    let qrDeposit = 0;
    let cashInHand = 0;

    reportData.forEach(item => {
      totalSales += item.totalSales || 0;
      cashSales += item.cashSales || 0;
      cashDeposit += item.cashDeposit || 0;
      officeGpay += item.officeGpay || 0;
      officeGpayDeposit += item.officeGpayDeposit || 0;
      qrPayment += item.qrPayment || 0;
      qrDeposit += item.qrDeposit || 0;
      cashInHand += item.cashInHand || 0;
    });

    return {
      totalSales,
      cashSales,
      cashDeposit,
      officeGpay,
      officeGpayDeposit,
      qrPayment,
      qrDeposit,
      cashInHand,
    };
  }, [reportData]);

  // Export styled Excel sheet matching the reference image layout
  const downloadExcel = () => {
    try {
      const headers = [
        'S.NO',
        'DESCRIPTION',
        'CASH SALES',
        'CASH DEPOSIT',
        'ONLINE PAYMENT',
        'ONLINE DEPOSIT',
        'QR PAYMENT',
        'QR DEPOSIT',
        'CASH IN HAND',
        'TOTAL SALES'
      ];

      const isSameDate = isSameDay(startDate, endDate);
      const dateLabel = isSameDate
        ? `DATE : ${format(startDate, 'dd.MM.yyyy')}`
        : `DATE RANGE : ${format(startDate, 'dd.MM.yyyy')} - ${format(endDate, 'dd.MM.yyyy')}`;

      // Rows for Excel
      const excelData = [
        ['SABOLS FOOD INDIA PVT LTD', '', '', '', '', dateLabel, '', '', '', ''],
        [], // spacing
        headers
      ];

      // Add route rows
      reportData.forEach((item, index) => {
        const row = [
          index + 1,
          item.routeName || 'Unassigned',
          Math.round(item.cashSales),
          Math.round(item.cashDeposit || 0),
          Math.round(item.officeGpay),
          Math.round(item.officeGpayDeposit || 0),
          Math.round(item.qrPayment),
          Math.round(item.qrDeposit || 0),
          Math.round(item.cashInHand),
          Math.round(item.totalSales)
        ];
        excelData.push(row);
      });

      // Add Grand Total Row
      const totalRow = [
        '',
        'TOTAL',
        Math.round(grandTotals.cashSales),
        Math.round(grandTotals.cashDeposit),
        Math.round(grandTotals.officeGpay),
        Math.round(grandTotals.officeGpayDeposit),
        Math.round(grandTotals.qrPayment),
        Math.round(grandTotals.qrDeposit),
        Math.round(grandTotals.cashInHand),
        Math.round(grandTotals.totalSales)
      ];
      excelData.push(totalRow);

      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const range = XLSX.utils.decode_range(ws['!ref']);
      const headerRowIndex = 2;
      const totalRowIndex = excelData.length - 1;

      // Styling loop
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell_address = { c: C, r: R };
          const cell_ref = XLSX.utils.encode_cell(cell_address);
          if (!ws[cell_ref]) continue;

          // Default styling: Segoe UI, thin borders, centered/left alignments
          ws[cell_ref].s = {
            border: {
              top: { style: 'thin', color: { rgb: 'D1D5DB' } },
              bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
              left: { style: 'thin', color: { rgb: 'D1D5DB' } },
              right: { style: 'thin', color: { rgb: 'D1D5DB' } }
            },
            font: { sz: 10, name: 'Segoe UI', color: { rgb: '111827' } },
            alignment: { vertical: 'center', horizontal: 'center' }
          };

          // Numbers align right or center depending on style
          if ([2, 3, 4, 5, 6, 7, 8, 9].includes(C) && R >= headerRowIndex) {
            ws[cell_ref].s.alignment.horizontal = 'right';
            if (R > headerRowIndex) {
              ws[cell_ref].z = '₹#,##0';
            }
          }

          // Description aligns left
          if (C === 1 && R >= headerRowIndex) {
            ws[cell_ref].s.alignment.horizontal = 'left';
          }

          // 1. Report Title Row styling (Row 0)
          if (R === 0) {
            ws[cell_ref].s.font = { bold: true, sz: 12, name: 'Segoe UI', color: { rgb: '000000' } };
            ws[cell_ref].s.border = {};
            if (C === 0) {
              ws[cell_ref].s.alignment = { horizontal: 'left', vertical: 'center' };
            } else if (C === 5) {
              ws[cell_ref].s.alignment = { horizontal: 'right', vertical: 'center' };
            }
          }

          // 2. Spacing Row (Row 1)
          if (R === 1) {
            ws[cell_ref].s.border = {};
          }

          // 3. Table Header styling (Row 2)
          if (R === headerRowIndex) {
            ws[cell_ref].s.font = { bold: true, sz: 10, name: 'Segoe UI', color: { rgb: '000000' } };
            ws[cell_ref].s.fill = { fgColor: { rgb: 'E5E7EB' } }; // Light grey background
            ws[cell_ref].s.border = {
              top: { style: 'medium', color: { rgb: '000000' } },
              bottom: { style: 'medium', color: { rgb: '000000' } },
              left: { style: 'thin', color: { rgb: 'D1D5DB' } },
              right: { style: 'thin', color: { rgb: 'D1D5DB' } }
            };
          }

          // 4. Grand Total Row styling
          if (R === totalRowIndex) {
            ws[cell_ref].s.font = { bold: true, sz: 11, name: 'Segoe UI', color: { rgb: '000000' } };
            ws[cell_ref].s.border = {
              top: { style: 'medium', color: { rgb: '000000' } },
              bottom: { style: 'double', color: { rgb: '000000' } },
              left: { style: 'thin', color: { rgb: 'D1D5DB' } },
              right: { style: 'thin', color: { rgb: 'D1D5DB' } }
            };
          }
        }
      }

      // Merge header columns for SABOLS title and Date label
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
        { s: { r: 0, c: 5 }, e: { r: 0, c: 9 } }
      ];

      // Auto-fit columns
      const colWidths = headers.map((h, colIdx) => {
        let maxLen = h.length;
        excelData.forEach((row, rowIdx) => {
          if (rowIdx > 1 && row[colIdx] !== undefined && row[colIdx] !== null) {
            const len = String(row[colIdx]).length;
            if (len > maxLen) maxLen = len;
          }
        });
        return { wch: Math.max(maxLen + 4, 12) };
      });
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cash Settlement');

      const fileName = `Daily_Cash_Settlement_${format(startDate, 'dd-MM-yyyy')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Excel Report Exported Successfully');
    } catch (err) {
      console.error('Download error:', err);
      toast.error('Failed to export Excel report');
    }
  };

  return (
    <div className="space-y-6 w-full pb-10">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            Daily Cash Settlement Report
          </h1>
          <p className="text-gray-500 mt-1">Reconcile route collections, can deposits, online sales, and net cash-in-hand figures.</p>
        </div>
        {!isLoading && reportData.length > 0 && (
          <Button
            onClick={downloadExcel}
            className="bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all hover:scale-[1.02] text-white gap-2 h-11 px-5"
          >
            <FileDown className="h-5 w-5" /> Export Excel
          </Button>
        )}
      </div>
    
      {/* Date Filtering Panel */}
      <Card className="border-none shadow-sm bg-white/80 backdrop-blur-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Delivered Start Date</Label>
              <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal h-11 border-gray-200 bg-white shadow-sm">
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

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-gray-500">Delivered End Date</Label>
              <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal h-11 border-gray-200 bg-white shadow-sm">
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

            <div className="flex gap-2">
              <Button
                onClick={handleResetFilters}
                variant="outline"
                className="h-11 px-6 text-gray-500 hover:text-primary transition-colors border-gray-200 bg-white w-full"
              >
                <RotateCcw className="h-4 w-4 mr-2" /> Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Aggregations Table */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl shadow-sm border border-gray-100">
          <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
          <p className="text-gray-500 font-semibold">Generating cash settlement data...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl shadow-sm border border-red-100 text-center">
          <Badge className="bg-red-50 text-red-700 border-red-200 text-md font-bold mb-2">Error</Badge>
          <p className="text-gray-600 font-medium px-4">{error}</p>
        </div>
      ) : (
        <section className="space-y-4">
          <div className="rounded-xl border border-gray-100 shadow-sm overflow-hidden bg-white w-full">
            <Table>
              <TableHeader className="bg-gray-50 border-b border-gray-200">
                <TableRow>
                  <TableHead className="font-bold text-gray-900 py-4 text-center w-[80px]">S.NO</TableHead>
                  <TableHead className="font-bold text-gray-900 py-4 pl-6 text-left">DESCRIPTION</TableHead>
                  <TableHead className="font-bold text-gray-900 py-4 text-right pr-6 w-[140px]">CASH SALES</TableHead>
                  <TableHead className="font-bold text-gray-900 py-4 text-right pr-6 w-[140px]">CASH DEPOSIT</TableHead>
                  <TableHead className="font-bold text-gray-900 py-4 text-right pr-6 w-[160px]">ONLINE PAYMENT </TableHead>
                  <TableHead className="font-bold text-gray-900 py-4 text-right pr-6 w-[150px]">ONLINE DEPOSIT</TableHead>
                  <TableHead className="font-bold text-gray-900 py-4 text-right pr-6 w-[160px]">QR PAYMENT</TableHead>
                  <TableHead className="font-bold text-gray-900 py-4 text-right pr-6 w-[140px]">QR DEPOSIT</TableHead>
                  <TableHead className="font-bold text-gray-900 py-4 text-right pr-6 w-[160px]">CASH IN HAND</TableHead>
                  <TableHead className="font-bold text-gray-900 py-4 text-right pr-6 w-[140px]">TOTAL SALES</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-36 text-center text-gray-500 font-medium">
                      No records found for the selected dates.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {reportData.map((item, idx) => (
                      <TableRow key={item.routeId || idx} className="hover:bg-gray-50/50 transition-colors border-b border-gray-100">
                        <TableCell className="text-center font-semibold text-gray-400 py-4">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-bold text-gray-800 pl-6 text-left">
                          {item.routeName}
                        </TableCell>
                        <TableCell className="text-right font-bold text-gray-800 pr-6">
                          ₹{Math.round(item.cashSales).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-gray-600 font-bold pr-6">
                          ₹{Math.round(item.cashDeposit || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-gray-600 font-bold pr-6">
                          ₹{Math.round(item.officeGpay).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-gray-600 font-bold pr-6">
                          ₹{Math.round(item.officeGpayDeposit || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-gray-600 font-bold pr-6">
                          ₹{Math.round(item.qrPayment).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-gray-600 font-bold pr-6">
                          ₹{Math.round(item.qrDeposit || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-extrabold text-gray-800 pr-6 bg-emerald-50/10">
                          ₹{Math.round(item.cashInHand).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-extrabold text-gray-900 pr-6">
                          ₹{Math.round(item.totalSales).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}

                    {/* Table Grand Totals Row */}
                    <TableRow className="bg-gray-100/70 border-t-2 border-t-gray-300 border-b-4 border-b-double border-b-gray-400 font-extrabold text-gray-900 text-sm">
                      <TableCell className="text-center"></TableCell>
                      <TableCell className="text-left font-extrabold pl-6 py-4 tracking-wider">TOTAL</TableCell>
                      <TableCell className="text-right pr-6 ">₹{Math.round(grandTotals.cashSales).toLocaleString()}</TableCell>
                      <TableCell className="text-right pr-6">₹{Math.round(grandTotals.cashDeposit).toLocaleString()}</TableCell>
                      <TableCell className="text-right pr-6">₹{Math.round(grandTotals.officeGpay).toLocaleString()}</TableCell>
                      <TableCell className="text-right pr-6">₹{Math.round(grandTotals.officeGpayDeposit).toLocaleString()}</TableCell>
                      <TableCell className="text-right pr-6">₹{Math.round(grandTotals.qrPayment).toLocaleString()}</TableCell>
                      <TableCell className="text-right pr-6">₹{Math.round(grandTotals.qrDeposit).toLocaleString()}</TableCell>
                      <TableCell className="text-right pr-6 text-emerald-950 bg-emerald-50/20 font-black">₹{Math.round(grandTotals.cashInHand).toLocaleString()}</TableCell>
                      <TableCell className="text-right pr-6 text-gray-950">₹{Math.round(grandTotals.totalSales).toLocaleString()}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
