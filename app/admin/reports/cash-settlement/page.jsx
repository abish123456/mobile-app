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
  Briefcase,
  Printer
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

  // Helper to generate the Excel worksheet
  const getExcelSheet = () => {
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

    return ws;
  };

  // Export styled Excel sheet matching the reference image layout
  const downloadExcel = () => {
    try {
      const ws = getExcelSheet();
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

  const handlePrint = () => {
    try {
      const ws = getExcelSheet();
      const htmlString = XLSX.utils.sheet_to_html(ws, { id: "report-table", editable: false });
      
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      
      const iframeDoc = iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(`
        <html>
          <head>
            <title>SABOLS - Watercan Ordering System</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
              th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
              
              /* Layout Adjustments */
              tr:nth-child(1) td { border: none; font-size: 16px; font-weight: bold; }
              tr:nth-child(1) td:last-child { text-align: right; }
              tr:nth-child(2) td { border: none; height: 10px; }
              tr:nth-child(3) td { font-weight: bold; background-color: #f3f4f6; text-align: center; border: 2px solid #ccc; }
              tr:last-child td { font-weight: bold; border-top: 2px solid #ccc; border-bottom: 2px double #ccc; }
              
              /* Value Alignment */
              td:nth-child(3), td:nth-child(4), td:nth-child(5), td:nth-child(6), 
              td:nth-child(7), td:nth-child(8), td:nth-child(9), td:nth-child(10) {
                text-align: right;
              }
              
              @media print {
                @page { size: portrait; margin: 10mm; }
              }
            </style>
          </head>
          <body>
            ${htmlString}
          </body>
        </html>
      `);
      iframeDoc.close();
      
      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
    } catch (err) {
      console.error('Print error:', err);
      toast.error('Failed to generate print document');
    }
  };
  return (
    <div className="space-y-6 w-full pb-10">
      <Card className="border border-slate-200 shadow-sm bg-white">
        <CardHeader className="border-b flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-4 print:hidden">
          <CardTitle className="text-lg font-semibold text-slate-800 shrink-0">Cash Settlement</CardTitle>

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
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => { if (date) { setStartDate(date); setIsStartDatePickerOpen(false); } }}
                      initialFocus
                    />
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
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(date) => { if (date) { setEndDate(date); setIsEndDatePickerOpen(false); } }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
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

            {/* Print & Export buttons */}
            {!isLoading && reportData.length > 0 && hasPermission('export_cash_settlement_reports') && (
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  onClick={handlePrint}
                  variant="outline"
                  size="sm"
                  className="bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm h-9 text-xs gap-1.5"
                >
                  <Printer className="h-4 w-4" /> Print
                </Button>
                <Button
                  onClick={downloadExcel}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 shadow-sm text-white h-9 text-xs gap-1.5"
                >
                  <FileDown className="h-4 w-4" /> Export Excel
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 bg-white">
              <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
              <p className="text-gray-500 text-sm font-semibold">Generating cash settlement data...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 bg-white text-center">
              <Badge className="bg-red-50 text-red-700 border-red-200 text-sm font-bold mb-2">Error</Badge>
              <p className="text-gray-600 font-medium px-4 text-sm">{error}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-50 border-b border-gray-200">
                  <TableRow>
                    <TableHead className="font-bold text-gray-900 py-4 text-center w-[80px]">S.NO</TableHead>
                    <TableHead className="font-bold text-gray-900 py-4 pl-6 text-left">DESCRIPTION</TableHead>
                    <TableHead className="font-bold text-gray-900 py-4 text-right pr-6 w-[140px]">CASH SALES</TableHead>
                    <TableHead className="font-bold text-gray-900 py-4 text-right pr-6 w-[140px]">CASH DEPOSIT</TableHead>
                    <TableHead className="font-bold text-gray-900 py-4 text-right pr-6 w-[160px]">ONLINE PAYMENT</TableHead>
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
                        <TableCell className="text-right pr-6">₹{Math.round(grandTotals.cashSales).toLocaleString()}</TableCell>
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
          )}
        </CardContent>
      </Card>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          aside, [data-sidebar="sidebar"], header, footer {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            background: white !important;
          }
          body {
            background: white !important;
          }
          table {
            width: 100% !important;
            break-inside: auto;
          }
          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          thead {
            display: table-header-group;
          }
          .overflow-hidden, .overflow-x-auto {
            overflow: visible !important;
          }
        }
      `}</style>
    </div>
  );
}
