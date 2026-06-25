'use client';

import { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Calendar } from '../../../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { Alert, AlertDescription } from '../../../components/ui/alert';
import { Label } from '../../../components/ui/label';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Badge } from '../../../components/ui/badge';
import { format, isSameDay, subMonths } from 'date-fns';
import {
  CalendarIcon,
  Loader2,
  AlertCircle,
  Package,
  CheckCircle2,
  Clock,
  XCircle,
  CreditCard,
  IndianRupee,
  TrendingUp,
  Download,
  Printer,
  RotateCcw,
  FileDown,
  FileText,
  ChevronLeft,
  ChevronRight,
  Users,
} from 'lucide-react';

import { cn } from '../../../lib/utils';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../lib/admin-api';

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(subMonths(new Date(), 1));
  const [endDate, setEndDate] = useState(new Date());
  const [selectedDeliveryBoyId, setSelectedDeliveryBoyId] = useState('all');
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [selectedServiceRouteId, setSelectedServiceRouteId] = useState('all');
  const [selectedPincode, setSelectedPincode] = useState('all');
  const [selectedDeliveryStatus, setSelectedDeliveryStatus] = useState('all');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('all');
  const [serviceRoutes, setServiceRoutes] = useState([]);
  const [pincodesMaster, setPincodesMaster] = useState([]);
  const [productsMaster, setProductsMaster] = useState([]);
  const [reportData, setReportData] = useState({ summary: null, orders: [], stockReport: null });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMaster, setIsLoadingMaster] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [reportType, setReportType] = useState('customer');
  const [dateType, setDateType] = useState('createdAt'); // 'createdAt' or 'deliveryDate'

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
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);

  useEffect(() => {
    fetchMasterData();
  }, []);

  const fetchMasterData = async () => {
    try {
      const [dbRes, srRes, pRes, ordersRes] = await Promise.all([
        adminFetch('/api/admin/delivery-boys'),
        adminFetch('/api/admin/service-routes'),
        adminFetch('/api/admin/products'),
        adminFetch('/api/admin/orders?limit=1') // Fetch orders to get used pincodes
      ]);

      const dbData = await dbRes.json();
      const srData = await srRes.json();
      const pData = await pRes.json();
      const ordersData = await ordersRes.json();

      if (dbData.success) setDeliveryBoys(dbData.deliveryBoys || []);
      if (srData.success) setServiceRoutes(srData.serviceRoutes || []);
      if (pData.success) setProductsMaster(pData.products || []);
      if (ordersData.success) {
        setPincodesMaster(ordersData.pincodes || []);
      }
    } catch (err) {
      console.error('Error fetching master data:', err);
      toast.error('Failed to load filter options');
    } finally {
      setIsLoadingMaster(false);
    }
  };

  const fetchReport = async () => {
    if (!startDate || !endDate) return;

    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        includeDetails: 'true',
        ...(selectedDeliveryBoyId && selectedDeliveryBoyId !== 'all' && { deliveryBoyId: selectedDeliveryBoyId }),
        ...(selectedServiceRouteId && selectedServiceRouteId !== 'all' && { serviceRouteId: selectedServiceRouteId }),
        ...(selectedPincode && selectedPincode !== 'all' && { pincode: selectedPincode }),
        ...(selectedDeliveryStatus && selectedDeliveryStatus !== 'all' && { deliveryStatus: selectedDeliveryStatus }),
        ...(selectedPaymentMethod && selectedPaymentMethod !== 'all' && { paymentMethod: selectedPaymentMethod }),
        dateType: dateType
      });

      const response = await adminFetch(`/api/admin/reports?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json();

      if (data.success) {
        setReportData({
          summary: data.report,
          orders: data.orders || [],
          stockReport: data.stockReport || null
        });
        window.dispatchEvent(new CustomEvent('admin-data-refreshed'));
      } else {
        setError(data.message || 'Failed to fetch report');
        toast.error(data.message || 'Failed to fetch report');
      }
    } catch (err) {
      console.error('Error fetching report:', err);
      const errorMsg = 'Network error. Please try again.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate, selectedDeliveryBoyId, selectedServiceRouteId, selectedPincode, selectedDeliveryStatus, selectedPaymentMethod, dateType]);

  const totalPages = Math.ceil((reportData.orders || []).length / itemsPerPage);
  const paginatedOrders = (reportData.orders || []).slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [startDate, endDate, selectedDeliveryBoyId, selectedServiceRouteId, selectedPincode, selectedDeliveryStatus, selectedPaymentMethod, dateType]);

  const handleResetFilters = () => {
    setStartDate(subMonths(new Date(), 1));
    setEndDate(new Date());
    setSelectedDeliveryBoyId('all');
    setSelectedServiceRouteId('all');
    setSelectedPincode('all');
    setSelectedDeliveryStatus('all');
    setSelectedPaymentMethod('all');
    setDateType('createdAt');
  };

  const isFilterActive = useMemo(() => {
    const defaultStartDate = subMonths(new Date(), 1);
    const defaultEndDate = new Date();

    const isDateChanged =
      (startDate && format(startDate, 'yyyy-MM-dd') !== format(defaultStartDate, 'yyyy-MM-dd')) ||
      (endDate && format(endDate, 'yyyy-MM-dd') !== format(defaultEndDate, 'yyyy-MM-dd'));

    return (
      selectedDeliveryBoyId !== 'all' ||
      selectedServiceRouteId !== 'all' ||
      selectedPincode !== 'all' ||
      selectedDeliveryStatus !== 'all' ||
      selectedPaymentMethod !== 'all' ||
      dateType !== 'createdAt' ||
      isDateChanged
    );
  }, [startDate, endDate, selectedDeliveryBoyId, selectedServiceRouteId, selectedPincode, selectedDeliveryStatus, selectedPaymentMethod, dateType]);



  // Helper to format status display in reports
  const formatReportStatus = (order) => {
    const status = order.deliveryStatus || order.status;
    if (!status) return '-';

    if (status === 'DELIVERED' || status === 'CANCELLED' || status === 'NOT_DELIVERED') {
      return status.split('_').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    }

    if (status === 'OUT_FOR_DELIVERY' || order.isRouteGenerated) {
      return 'Delivery in Progress';
    }

    if (order.isAssigned) {
      return 'Confirmed';
    }

    return 'Order Placed';
  };

  // Helper to load image for PDF
  const loadImage = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  // Helper to format payment display
  const getPaymentDisplay = (order) => {
    if (order.paymentMethod === 'COD') return 'COD';
    if (order.paymentInstrument) return order.paymentInstrument;
    if (order.paymentMethod === 'ONLINE') return 'Online';
    return '-';
  };

  const handleDownload = () => {
    if (reportType === 'customer') {
      // Existing behavior
    } else {
      // Items report behavior
    }
  };

  const handleDownloadItemsPDF = async () => {
    if (!startDate || !endDate || !reportData.orders) return;

    try {
      const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.width;
      const orders = reportData.orders;

      // 1. Header
      doc.setFontSize(18);
      doc.setTextColor(40, 40, 40);
      doc.text('Bill of Quantity', pageWidth / 2, 15, { align: 'center' });

      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      const itemsDateDisplay = isSameDay(startDate, endDate)
        ? format(startDate, 'PP')
        : `${format(startDate, 'PP')} - ${format(endDate, 'PP')}`;
      doc.text(`Date: ${itemsDateDisplay}`, 14, 22);
      doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, 14, 27);

      let currentY = 35;

      // 2. Overall Summary (Same as before but simplified)
      // if (reportData.stockReport) {
      //   doc.setFontSize(12);
      //   doc.setTextColor(0, 0, 0);
      //   doc.text('Overall Stock Requirement', 14, currentY);
      //   currentY += 4;

      //   const totalRows = reportData.stockReport.total.productBreakdown.map(p => [p.productName, p.totalQuantity]);
      //   autoTable(doc, {
      //     startY: currentY,
      //     head: [['Product Name', 'Total Quantity']],
      //     body: totalRows,
      //     theme: 'striped',
      //     headStyles: { fillColor: [37, 99, 235] },
      //     styles: { fontSize: 8 },
      //     margin: { left: 14 },
      //     tableWidth: 'wrap'
      //   });
      //   currentY = doc.lastAutoTable.finalY + 12;
      // }

      // 3. Granular Detailed Table (Sync with Excel)
      // Identify all unique products
      const allProductNames = new Set();
      orders.forEach(order => {
        if (order.items && order.items.length > 0) {
          order.items.forEach(item => allProductNames.add(item.productName));
        } else if (order.productName) {
          allProductNames.add(order.productName);
        }
      });

      const sortedProducts = Array.from(allProductNames).sort((a, b) => {
        const productA = productsMaster.find(p => p.name === a);
        const productB = productsMaster.find(p => p.name === b);
        if (productA && productB) return new Date(productA.createdAt) - new Date(productB.createdAt);
        return a.localeCompare(b);
      });

      // Grouping logic
      const groupedData = {};
      orders.forEach(order => {
        const dateStr = order.deliveryDate ? format(new Date(order.deliveryDate), 'dd/MM/yy') : 'Unscheduled';
        const routeName = order.routeName || 'Unassigned';
        const pincode = order.addressPincode || 'N/A';
        const staffName = order.deliveryBoyName || 'Unassigned';

        const key = `${pincode}|${dateStr}|${routeName}|${staffName}`;
        if (!groupedData[key]) {
          groupedData[key] = { pincode, date: dateStr, route: routeName, staff: staffName, products: {} };
          sortedProducts.forEach(p => groupedData[key].products[p] = 0);
        }

        if (order.items && order.items.length > 0) {
          order.items.forEach(item => { groupedData[key].products[item.productName] += item.quantity || 0; });
        } else {
          const prodName = order.productName || 'Water Can';
          if (groupedData[key].products[prodName] !== undefined) {
            groupedData[key].products[prodName] += order.quantity || 0;
          }
        }
      });

      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text('Detailed Loading Requirements', 14, currentY);
      currentY += 4;

      const tableHeaders = ["Pincode", ...sortedProducts, "Date", "Route", "Staff"];
      const tableRows = Object.values(groupedData).map(group => {
        const row = [group.pincode];
        sortedProducts.forEach(p => { row.push(group.products[p] || 0); });
        row.push(group.date, group.route, group.staff);
        return row;
      });

      autoTable(doc, {
        startY: currentY,
        head: [tableHeaders],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85], halign: 'center' },
        styles: { fontSize: 8, halign: 'center', cellPadding: 2 },
        columnStyles: {
          0: { halign: 'left' } // Pincode
        },
        margin: { left: 14, right: 14 }
      });

      doc.save(`Bill_of_Quantity_${format(startDate, 'dd-MM-yyyy')}.pdf`);
      setIsDownloadDialogOpen(false);
      toast.success('PDF Downloaded');
    } catch (err) {
      console.error('Error generating Items PDF:', err);
      toast.error('Failed to generate PDF');
    }
  };

  const handleDownloadItemsExcel = async () => {
    if (!startDate || !endDate || !reportData.orders) return;

    try {
      const orders = reportData.orders;

      // 1. Identify all unique products across these orders
      const allProductNames = new Set();
      orders.forEach(order => {
        if (order.items && order.items.length > 0) {
          order.items.forEach(item => allProductNames.add(item.productName));
        } else if (order.productName) {
          allProductNames.add(order.productName);
        }
      });

      // Sort products based on master list (oldest first)
      const sortedProducts = Array.from(allProductNames).sort((a, b) => {
        const productA = productsMaster.find(p => p.name === a);
        const productB = productsMaster.find(p => p.name === b);

        // If both found in master, sort by creation date
        if (productA && productB) {
          return new Date(productA.createdAt) - new Date(productB.createdAt);
        }

        // Fallback to alphabetical if not found or dates missing
        return a.localeCompare(b);
      });

      // 2. Group orders by Pincode, Date, Route, and Delivery Staff
      const groupedData = {};
      orders.forEach(order => {
        const dateStr = order.deliveryDate ? format(new Date(order.deliveryDate), 'dd/MM/yyyy') : 'Unscheduled';
        const routeName = order.routeName || 'Unassigned';
        const pincode = order.addressPincode || 'N/A';
        const staffName = order.deliveryBoyName || 'Unassigned';

        const key = `${pincode}|${dateStr}|${routeName}|${staffName}`;
        if (!groupedData[key]) {
          groupedData[key] = {
            pincode: pincode,
            date: dateStr,
            route: routeName,
            staff: staffName,
            products: {}
          };
          sortedProducts.forEach(p => groupedData[key].products[p] = 0);
        }

        if (order.items && order.items.length > 0) {
          order.items.forEach(item => {
            groupedData[key].products[item.productName] += item.quantity || 0;
          });
        } else {
          // Fallback to legacy structure if items array is missing
          const prodName = order.productName || 'Water Can';
          if (groupedData[key].products[prodName] !== undefined) {
            groupedData[key].products[prodName] += order.quantity || 0;
          }
        }
      });

      // 3. Build Excel Data Array
      const excelData = [];
      excelData.push(["Bill of Quantity"]);
      const excelItemsDateDisplay = isSameDay(startDate, endDate)
        ? format(startDate, 'dd/MM/yyyy')
        : `${format(startDate, 'dd/MM/yyyy')} to ${format(endDate, 'dd/MM/yyyy')}`;
      excelData.push(["Date:", excelItemsDateDisplay]);
      excelData.push(["Generated on:", format(new Date(), 'PPP p')]);
      excelData.push([]); // Empty row

      // Headers: Pincode, Products..., Date, Route Name, Delivery Staff
      const tableHeaders = ["Pincode", ...sortedProducts, "Date", "Route Name", "Delivery Staff"];
      excelData.push(tableHeaders);

      // Rows
      Object.values(groupedData).forEach(group => {
        const row = [group.pincode];
        // Add product quantities
        sortedProducts.forEach(p => {
          row.push(group.products[p] || 0);
        });
        // Add trailing columns
        row.push(group.date);
        row.push(group.route);
        row.push(group.staff);
        excelData.push(row);
      });

      const ws = XLSX.utils.aoa_to_sheet(excelData);

      // 4. Apply Styling
      const itemTitles = ["Bill of Quantity", "Date:", "Generated on:"];

      Object.keys(ws).forEach(cell => {
        if (cell[0] === '!') return;
        const cellData = ws[cell];
        const value = cellData.v;

        // Section Headings: Left & Bold
        if (itemTitles.includes(value)) {
          cellData.s = {
            alignment: { horizontal: 'left' },
            font: { bold: true, sz: 12 }
          };
        }

        // Table Headers: Center, Bold, Background
        if (tableHeaders.includes(value)) {
          cellData.s = {
            alignment: { horizontal: 'center', vertical: 'center' },
            font: { bold: true, sz: 10 },
            border: {
              bottom: { style: 'thin', color: { rgb: "D1D5DB" } },
              top: { style: 'thin', color: { rgb: "D1D5DB" } },
              left: { style: 'thin', color: { rgb: "D1D5DB" } },
              right: { style: 'thin', color: { rgb: "D1D5DB" } }
            },
            fill: { fgColor: { rgb: "F9FAFB" } }
          };
        }

        // Data Rows: Center align fixed columns, Center align product counts
        const rowNum = parseInt(cell.match(/\d+/)[0]);
        const headerRowIdx = excelData.indexOf(tableHeaders) + 1;
        if (rowNum > headerRowIdx) {
          cellData.s = {
            alignment: { horizontal: 'center', vertical: 'center' }
          };
        }
      });

      // Auto-fit columns
      const maxCols = excelData.reduce((max, row) => Math.max(max, row.length), 0);
      const colWidths = Array.from({ length: maxCols }).map((_, i) => {
        let maxLen = 0;
        excelData.forEach(row => {
          if (row[i] !== undefined && row[i] !== null) {
            const currentLen = String(row[i]).length;
            if (currentLen > maxLen) maxLen = currentLen;
          }
        });
        return { wch: Math.min(maxLen + 2, 60) };
      });
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Loading Sheet");
      XLSX.writeFile(wb, `Bill_of_Quantity_${format(startDate, 'dd-MM-yyyy')}.xlsx`);

      setIsDownloadDialogOpen(false);
      toast.success('Excel Sheet Downloaded');

    } catch (err) {
      console.error('Error generating Items Excel:', err);
      toast.error('Failed to generate Excel Sheet');
    }
  };

  const handleDownloadPDF = async () => {
    if (reportType === 'items') {
      return handleDownloadItemsPDF();
    }
    if (!startDate || !endDate) return;



    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;

      // Load Logo
      try {
        const logoImg = await loadImage('/shop/Sobals logo.jpg');
        doc.addImage(logoImg, 'JPEG', 14, 10, 20, 20);
      } catch (e) {
        console.warn('Logo could not be loaded', e);
      }

      const dateRange = isSameDay(startDate, endDate)
        ? format(startDate, 'PP')
        : `${format(startDate, 'PP')} - ${format(endDate, 'PP')}`;
      const deliveryBoyName = selectedDeliveryBoyId && selectedDeliveryBoyId !== 'all'
        ? deliveryBoys.find((db) => db.id === selectedDeliveryBoyId)?.name || 'All'
        : 'All';
      const serviceRouteName = selectedServiceRouteId && selectedServiceRouteId !== 'all'
        ? serviceRoutes.find((sr) => sr.id === selectedServiceRouteId)?.name || 'All'
        : 'All';
      const pincodeDisplay = selectedPincode === 'all' ? 'All' : selectedPincode;

      doc.setFontSize(22);
      doc.setTextColor(40, 40, 40);
      doc.text('Delivery Report', 45, 20);

      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, 45, 28);
      doc.text(`Date: ${dateRange}`, 45, 33);
      doc.text(`Delivery Staff: ${deliveryBoyName}`, 45, 38);
      doc.text(`Service Route: ${serviceRouteName}`, 45, 43);
      doc.text(`Pincode: ${pincodeDisplay}`, 45, 48);

      // Draw a line separator
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 50, pageWidth - 14, 50);

      // Summary Section - Styled Boxes
      let yPos = 60;
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text('Summary Overview', 14, yPos);

      // Summary Overview - Clean plain table layout
      const summaryBody = [
        ['Total Orders:', reportData.summary?.totalOrders || 0, 'Online Payment:', `Rs.${Math.round(Number(reportData.summary?.onlinePaymentTotal || 0))}`],
        ['Delivered:', reportData.summary?.ordersDelivered || 0, 'COD Expected:', `Rs.${Math.round(Number(reportData.summary?.codExpected || 0))}`],
        ['Pending:', reportData.summary?.ordersPending || 0, 'COD Collected:', `Rs.${Math.round(Number(reportData.summary?.codCollected || 0))}`],
        ['Not Delivered:', reportData.summary?.ordersNotDelivered || 0, 'COD Pending:', `Rs.${Math.round(Number(reportData.summary?.codPending || 0))}`]
      ];

      autoTable(doc, {
        startY: yPos + 5,
        body: summaryBody,
        theme: 'plain',
        styles: {
          fontSize: 10,
          cellPadding: 2,
          textColor: [40, 40, 40]
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: pageWidth * 0.25 },
          1: { cellWidth: pageWidth * 0.15 },
          2: { fontStyle: 'bold', cellWidth: pageWidth * 0.25 },
          3: { cellWidth: pageWidth * 0.15 }
        },
        margin: { left: 14 }
      });

      // Update yPos to after the summary table
      yPos = doc.lastAutoTable.finalY + 15;

      // Orders Table
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text('Detailed Orders', 14, yPos);

      const tableRows = reportData.orders.map(order => {
        let statusDisplay = formatReportStatus(order);
        if ((order.deliveryStatus === 'DELIVERED' || order.status === 'DELIVERED') && order.deliveredDate) {
          statusDisplay += `\n${format(new Date(order.deliveredDate), 'dd/MM/yy HH:mm')}`;
        }
        if (order.deliveryStatus === 'NOT_DELIVERED' && order.notDeliveredReason) {
          statusDisplay += `\nReason: ${order.notDeliveredReason}`;
        }

        // Build product details with itemized breakdown if available
        let productDetails = '';
        if (order.items && order.items.length > 0) {
          productDetails = order.items.map(item => `${item.quantity}x ${item.productName} (₹${item.price * item.quantity})`).join(', ');
        } else {
          productDetails = order.productName;
        }
        productDetails += `\nTotal: ${order.quantity} items | Rs.${order.amount}`;

        return [
          `#${order.orderNumber || (order.id ? order.id.slice(-8).toUpperCase() : '-')}\n${order.orderCreatedAt ? format(new Date(order.orderCreatedAt), 'dd/MM/yy') : '-'}\n${order.orderCreatedAt ? format(new Date(order.orderCreatedAt), 'HH:mm') : '-'}`,
          [order.customerName, order.customerPhone].filter(Boolean).join('\n'),
          [order.addressLine1, order.addressLine2, order.addressArea, order.addressCity, order.addressPincode].filter(Boolean).join(', '),
          `Rs.${Math.round(Number(order.amount))}`,
          order.isQrPayment ? `${getPaymentDisplay(order)} (QR)` : getPaymentDisplay(order),
          statusDisplay,
          `${order.deliveryBoyName || 'Unassigned'}\n(${order.routeName || '-'})`
        ];
      });

      autoTable(doc, {
        startY: yPos + 5,
        head: [['Order Info', 'Customer', 'Address', 'Amount', 'Payment Type', 'Status', 'Staff / Route']],
        body: tableRows,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 3,
          valign: 'middle',
          overflow: 'linebreak',
          lineColor: [200, 200, 200]
        },
        // Prevent rows from splitting across pages
        rowPageBreak: 'avoid',
        headStyles: {
          fillColor: [37, 99, 235], // Blue header
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 22 }, // Order Info
          1: { cellWidth: 28 }, // Customer
          2: { cellWidth: 40 }, // Address
          3: { cellWidth: 19, halign: 'center' }, // Amount
          4: { cellWidth: 18, halign: 'center' }, // Payment Type
          5: { cellWidth: 24, halign: 'center' }, // Status
          6: { cellWidth: 26, halign: 'center' }  // Del. Staff
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251] // Very light gray for alternate rows
        },
        didParseCell: function (data) {
          // Add custom styling for status column cells based on content
          if (data.section === 'body') {
            const order = reportData.orders[data.row.index];

            if (data.column.index === 5) { // Status column
              const status = data.cell.raw;
              if (typeof status === 'string' && status.startsWith('Delivered')) {
                data.cell._originalText = data.cell.text || [status];
                data.cell.text = ['', ''];
              } else if (status === 'Not Delivered' || status === 'Cancelled') {
                data.cell.styles.textColor = [220, 38, 38];
                data.cell.styles.fontStyle = 'bold';
              } else {
                data.cell.styles.textColor = [202, 138, 4];
              }
            }
          }
        },
        didDrawCell: function (data) {
          if (data.section === 'body') {
            // Status custom drawing (Index 5)
            if (data.column.index === 5) {
              if (data.cell._originalText && data.cell.raw.startsWith('Delivered')) {
                const doc = data.doc;
                const x = data.cell.x + data.cell.width / 2;
                const y = data.cell.y;
                const height = data.cell.height;

                // Calculate vertical center
                const centerY = y + height / 2;

                const textLines = data.cell._originalText;

                // Status (Green) - First line
                if (textLines.length > 0) {
                  doc.setFont(undefined, 'bold');
                  doc.setTextColor(22, 163, 74); // Green
                  doc.setFontSize(8);
                  doc.text(textLines[0], x, centerY - 2, { align: 'center', baseline: 'middle' });
                }

                // Date (Gray) - Second line
                if (textLines.length > 1) {
                  doc.setFont(undefined, 'normal');
                  doc.setTextColor(107, 114, 128); // Gray-500
                  doc.setFontSize(7); // Slightly smaller for date
                  doc.text(textLines[1], x, centerY + 3.5, { align: 'center', baseline: 'middle' });
                }
              }
            }
          }
        }
      });

      doc.save(`report_${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}.pdf`);
      setIsDownloadDialogOpen(false);
      toast.success('PDF Downloaded successfully');

    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error('Failed to generate PDF');
    }
  };

  const handleDownloadExcel = async () => {
    if (reportType === 'items') {
      return handleDownloadItemsExcel();
    }
    if (!startDate || !endDate) return;


    try {
      const deliveryBoyName = selectedDeliveryBoyId && selectedDeliveryBoyId !== 'all'
        ? deliveryBoys.find((db) => db.id === selectedDeliveryBoyId)?.name || 'All'
        : 'All';
      const serviceRouteName = selectedServiceRouteId && selectedServiceRouteId !== 'all'
        ? serviceRoutes.find((sr) => sr.id === selectedServiceRouteId)?.name || 'All'
        : 'All';

      const dateRange = isSameDay(startDate, endDate)
        ? format(startDate, 'yyyy-MM-dd')
        : `${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`;
      const orders = reportData.orders || [];

      // Prepare data for Excel
      const excelData = [];

      // Add Header Info
      excelData.push(["DELIVERY REPORT"]);
      excelData.push(["Date:", dateRange]);
      excelData.push(["Delivery Staff:", deliveryBoyName]);
      excelData.push(["Service Route:", serviceRouteName]);
      excelData.push(["Pincode:", selectedPincode === 'all' ? 'All' : selectedPincode]);
      excelData.push(["Generated on:", format(new Date(), 'PPP p')]);
      excelData.push([]); // Empty row

      // Summary Metrics
      excelData.push(["SUMMARY METRICS"]);
      excelData.push(["Total Orders", reportData.summary?.totalOrders || 0]);
      excelData.push(["Orders Delivered", reportData.summary?.ordersDelivered || 0]);
      excelData.push(["Orders Not Delivered", reportData.summary?.ordersNotDelivered || 0]);
      excelData.push(["Orders Pending", reportData.summary?.ordersPending || 0]);
      excelData.push(["Online Payments", `Rs. ${Math.round(Number(reportData.summary?.onlinePaymentTotal || 0))}`]);
      excelData.push(["COD Expected", `Rs. ${Math.round(Number(reportData.summary?.codExpected || 0))}`]);
      excelData.push(["COD Collected", `Rs. ${Math.round(Number(reportData.summary?.codCollected || 0))}`]);
      excelData.push(["COD Pending", `Rs. ${Math.round(Number(reportData.summary?.codPending || 0))}`]);
      excelData.push([]); // Empty row

      // Detailed Orders
      excelData.push(["DETAILED ORDERS"]);
      const headers = [
        'Order ID',
        'Order Date',
        'Order Time',
        'Delivery Date',
        'Customer Name',
        'Phone Number',
        'Address 1',
        'Address 2',
        'City',
        'Area',
        'Pincode',
        'Product Details',
        'Total Quantity',
        'Amt',
        'Payment Type',
        'Route Name',
        'Delivery Staff',
        'Delivered Date',
        'Delivered Time',
        'Status',
        'Not Delivered Reason'
      ];
      excelData.push(headers);

      orders.forEach(order => {
        const orderedDateStr = order.orderCreatedAt ? format(new Date(order.orderCreatedAt), 'dd/MM/yyyy') : '';
        const orderedTimeStr = order.orderCreatedAt ? format(new Date(order.orderCreatedAt), 'HH:mm:ss') : '';
        const requestedDeliveryDateStr = order.deliveryDate ? format(new Date(order.deliveryDate), 'dd/MM/yyyy') : '';

        // Extract delivered date and time if order is delivered
        let deliveredDateStr = '';
        let deliveredTimeStr = '';
        if (order.deliveredDate && (order.deliveryStatus === 'DELIVERED' || order.status === 'DELIVERED')) {
          deliveredDateStr = format(new Date(order.deliveredDate), 'dd/MM/yyyy');
          deliveredTimeStr = format(new Date(order.deliveredDate), 'HH:mm:ss');
        }

        // Build product details string
        let productDetailsContent = order.productName || 'Water Can';
        if (order.items && order.items.length > 0) {
          productDetailsContent = order.items.map(item => `${item.quantity}x ${item.productName} (₹${(item.price * item.quantity).toFixed(2)})`).join('; ');
        }

        excelData.push([
          order.orderNumber || (order.id ? order.id.slice(-8).toUpperCase() : ''),
          orderedDateStr,
          orderedTimeStr,
          requestedDeliveryDateStr,
          order.customerName || '',
          order.customerPhone || '',
          order.addressLine1 || '',
          order.addressLine2 || '',
          order.addressCity || '',
          order.addressArea || '',
          order.addressPincode || '',
          productDetailsContent,
          order.quantity || 0,
          Math.round(Number(order.amount || 0)),
          order.isQrPayment ? `${getPaymentDisplay(order)} (QR)` : getPaymentDisplay(order),
          order.routeName || '',
          order.deliveryBoyName || 'Unassigned',
          deliveredDateStr,
          deliveredTimeStr,
          formatReportStatus(order),
          order.notDeliveredReason || ''
        ]);
      });

      // Create Workbook and Worksheet
      const ws = XLSX.utils.aoa_to_sheet(excelData);

      // Apply styling to headers and titles
      Object.keys(ws).forEach(cell => {
        if (cell[0] === '!') return; // Skip meta-properties

        const cellData = ws[cell];
        const value = cellData.v;

        // Center headers
        if (headers.includes(value)) {
          cellData.s = {
            alignment: { horizontal: 'center', vertical: 'center' },
            font: { bold: true, sz: 10 },
            border: {
              bottom: { style: 'thin', color: { rgb: "D1D5DB" } },
              top: { style: 'thin', color: { rgb: "D1D5DB" } },
              left: { style: 'thin', color: { rgb: "D1D5DB" } },
              right: { style: 'thin', color: { rgb: "D1D5DB" } }
            },
            fill: { fgColor: { rgb: "F9FAFB" } }
          };
        }

        // Left align and bold category titles
        if (value === "DELIVERY REPORT" || value === "SUMMARY METRICS" || value === "DETAILED ORDERS" || value === "STOCK SUMMARY") {
          cellData.s = {
            alignment: { horizontal: 'left' },
            font: { bold: true, sz: 12 }
          };
        }
        // Left align summary metric values (first four)
        const summaryLabels = ["Total Orders", "Orders Delivered", "Orders Not Delivered", "Orders Pending"];
        if (summaryLabels.some(label => value === label)) {
          const rowNumSummary = cell.replace(/[A-Z]/g, '');
          const valueCell = 'B' + rowNumSummary;
          if (ws[valueCell]) {
            ws[valueCell].s = {
              ...(ws[valueCell].s || {}),
              alignment: { horizontal: 'left' }
            };
          }
        }

        // --- Detailed Orders Data Alignment ---
        const headerRowIndex = excelData.findIndex(r => r === headers);
        if (headerRowIndex !== -1) {
          const headerRowNum = headerRowIndex + 1;
          const colLetter = cell.match(/[A-Z]+/)[0];
          const rowNumCell = parseInt(cell.match(/\d+/)[0]);
          const colIdx = XLSX.utils.decode_col(colLetter);

          if (rowNumCell > headerRowNum) {
            // Default center alignment for data rows
            cellData.s = {
              ...(cellData.s || {}),
              alignment: { horizontal: 'center', vertical: 'center' }
            };

            // Left align specific columns: Customer (4), Address 1 (6), Address 2 (7), Product Details (11), Not Delivered Reason (20)
            if ([4, 6, 7, 11, 20].includes(colIdx)) {
              cellData.s.alignment.horizontal = 'left';
            }
          }
        }
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Report");

      // Auto-fit columns
      const maxCols = excelData.reduce((max, row) => Math.max(max, row.length), 0);
      const colWidths = Array.from({ length: maxCols }).map((_, i) => {
        let maxLen = 0;
        excelData.forEach(row => {
          if (row[i] !== undefined && row[i] !== null) {
            const currentLen = String(row[i]).length;
            if (currentLen > maxLen) maxLen = currentLen;
          }
        });
        return { wch: Math.min(maxLen + 2, 60) }; // Added small padding for better visibility in table
      });
      ws['!cols'] = colWidths;

      // Write and download
      XLSX.writeFile(wb, `report_${dateRange.replace(/\s+/g, '_')}.xlsx`);

      setIsDownloadDialogOpen(false);
      toast.success('Excel File Downloaded successfully');

    } catch (err) {
      console.error('Error downloading report:', err);
      toast.error('Failed to download report');
    }
  };

  if (isLoadingMaster) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-muted-foreground">View detailed delivery reports</p>
        </div>
        {hasPermission('export_general_reports') && (
          <Button
            onClick={() => setIsDownloadDialogOpen(true)}
            variant="outline"
            className="gap-2"
            disabled={isLoading || reportData.orders.length === 0}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle className="text-xl font-bold">Filters</CardTitle>
            <CardDescription>Select date range and delivery Staff</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetFilters}
            disabled={!isFilterActive}
            className="gap-2 text-foreground transition-colors disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Filters
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Filter By</label>
              <Select
                value={dateType}
                onValueChange={setDateType}
              >
                <SelectTrigger className="w-full border-2 border-primary/20 bg-background shadow-sm hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:border-primary/40 hover:text-black transition-all">
                  <SelectValue placeholder="Filter By" />
                </SelectTrigger>
                <SelectContent className="w-full">
                  <SelectItem value="createdAt">Order Date</SelectItem>
                  <SelectItem value="deliveryDate">Delivery Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      if (date) {
                        setStartDate(date);
                        setIsStartDatePickerOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => {
                      if (date) {
                        setEndDate(date);
                        setIsEndDatePickerOpen(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Service Route</label>
              <Select
                value={selectedServiceRouteId}
                onValueChange={setSelectedServiceRouteId}
              >
                <SelectTrigger className="w-full border-2 border-primary/20 bg-background shadow-sm hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:border-primary/40 hover:text-black transition-all">
                  <SelectValue placeholder="All Routes" />
                </SelectTrigger>
                <SelectContent className="w-full">
                  <SelectItem value="all">All Routes</SelectItem>
                  {serviceRoutes.map((route) => (
                    <SelectItem key={route.id} value={route.id}>
                      {route.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Delivery staff</label>
              <Select
                value={selectedDeliveryBoyId}
                onValueChange={setSelectedDeliveryBoyId}

              >
                <SelectTrigger className="w-full border-2 border-primary/20 bg-background shadow-sm hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:border-primary/40 hover:text-black transition-all">
                  <SelectValue placeholder="All Delivery staff" />
                </SelectTrigger>
                <SelectContent className="w-full">
                  <SelectItem value="all" >All Delivery staff</SelectItem>
                  {deliveryBoys
                    .filter((db) => db.active)
                    .map((db) => (
                      <SelectItem key={db.id} value={db.id}>
                        {db.name} ({db.phone})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Pincode</label>
              <Select
                value={selectedPincode}
                onValueChange={setSelectedPincode}
              >
                <SelectTrigger className="w-full border-2 border-primary/20 bg-background shadow-sm hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:border-primary/40 hover:text-black transition-all">
                  <SelectValue placeholder="All Pincodes" />
                </SelectTrigger>
                <SelectContent className="w-full">
                  <SelectItem value="all">All Pincodes</SelectItem>
                  {pincodesMaster.map((pin) => (
                    <SelectItem key={pin} value={pin}>
                      {pin}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Delivery Status</label>
              <Select
                value={selectedDeliveryStatus}
                onValueChange={setSelectedDeliveryStatus}
              >
                <SelectTrigger className="w-full border-2 border-primary/20 bg-background shadow-sm hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:border-primary/40 hover:text-black transition-all">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent className="w-full">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="ORDER_RECEIVED">Order Received</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                  <SelectItem value="DELIVERY_IN_PROGRESS">Delivery in Progress</SelectItem>
                  <SelectItem value="DELIVERED">Delivered</SelectItem>
                  <SelectItem value="NOT_DELIVERED">Not Delivered</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Payment Type</label>
              <Select
                value={selectedPaymentMethod}
                onValueChange={setSelectedPaymentMethod}
              >
                <SelectTrigger className="w-full border-2 border-primary/20 bg-background shadow-sm hover:bg-gradient-to-r hover:from-primary/10 hover:to-accent/10 hover:border-primary/40 hover:text-black transition-all">
                  <SelectValue placeholder="All Payments" />
                </SelectTrigger>
                <SelectContent className="w-full">
                  <SelectItem value="all">All Payments</SelectItem>
                  <SelectItem value="COD">Cash on Delivery (COD)</SelectItem>
                  <SelectItem value="ONLINE">Online Payment</SelectItem>
                  <SelectItem value="QR">QR Payment (COD QR)</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>
        </CardContent>
      </Card>
      {/* 
      {reportData.summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-blue-50/50">
            <CardHeader className="py-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reportData.summary.totalOrders}</div>
              <p className="text-xs text-muted-foreground mt-1">Across selected period</p>
            </CardContent>
          </Card>

          <Card className="bg-green-50/50">
            <CardHeader className="py-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">Delivered</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reportData.summary.ordersDelivered}</div>
              <p className="text-xs text-muted-foreground mt-1 text-green-600 font-medium">Successfully completed</p>
            </CardContent>
          </Card>

          <Card className="bg-orange-50/50">
            <CardHeader className="py-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reportData.summary.ordersPending}</div>
              <p className="text-xs text-muted-foreground mt-1 text-orange-600 font-medium">In progress or unassigned</p>
            </CardContent>
          </Card>

          <Card className="bg-red-50/50">
            <CardHeader className="py-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">Not Delivered</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reportData.summary.ordersNotDelivered}</div>
              <p className="text-xs text-muted-foreground mt-1 text-red-600 font-medium">Canceled or failed</p>
            </CardContent>
          </Card>

          <Card className="bg-indigo-50/50">
            <CardHeader className="py-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">Online Payments</CardTitle>
              <CreditCard className="h-4 w-4 text-indigo-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{reportData.summary.onlinePaymentTotal.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">Prepaid total</p>
            </CardContent>
          </Card>

          <Card className="bg-amber-50/50">
            <CardHeader className="py-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">COD Expected</CardTitle>
              <IndianRupee className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{reportData.summary.codExpected.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">Total cash potential</p>
            </CardContent>
          </Card>

          <Card className="bg-emerald-50/50">
            <CardHeader className="py-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">COD Collected</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{reportData.summary.codCollected.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1 text-emerald-600 font-medium">Cash in hand</p>
            </CardContent>
          </Card>

          <Card className="bg-rose-50/50">
            <CardHeader className="py-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium">COD Pending</CardTitle>
              <TrendingUp className="h-4 w-4 text-rose-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{reportData.summary.codPending.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1 text-rose-600 font-medium">Remaining to collect</p>
            </CardContent>
          </Card>
        </div>
      )} */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stock Summary Section (Loading Sheet) - Hidden as requested */}
      {false && !isLoading && reportData.stockReport && reportData.stockReport.total.productBreakdown.length > 0 && (
        <Card className="border-primary/20 bg-primary/5 shadow-md">
          <CardHeader className="py-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Items to Deliver (Stock Loading Sheet)
            </CardTitle>
            <CardDescription>
              Quantity required to fulfill orders in the selected date
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {reportData.stockReport.total.productBreakdown.map((item, idx) => (
                <div key={idx} className="bg-background p-4 rounded-xl border-2 border-primary/10 text-center shadow-sm hover:border-primary/30 transition-colors">
                  <div className="text-3xl font-black text-primary mb-1">{item.totalQuantity}</div>
                  <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider truncate" title={item.productName}>
                    {item.productName}
                  </div>
                </div>
              ))}
              <div className="bg-primary text-primary-foreground p-4 rounded-xl border-2 border-primary text-center shadow-lg transform hover:scale-105 transition-transform">
                <div className="text-3xl font-black mb-1">{reportData.stockReport.total.totalItems}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider">Total Items</div>
              </div>
            </div>

            {/* Breakdown summary if not filtering by staff/route */}
            {(selectedDeliveryBoyId === 'all' || selectedServiceRouteId === 'all') && (
              <div className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground italic">
                {selectedDeliveryBoyId === 'all' && (
                  <span>Includes data for <span className="font-semibold text-primary">{reportData.stockReport.byStaff.length}</span> individual delivery staff.</span>
                )}
                {selectedServiceRouteId === 'all' && (
                  <span>Includes data for <span className="font-semibold text-primary">{reportData.stockReport.byRoute.length}</span> specialized routes.</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {
        isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="rounded-md border bg-card ">
            <Table>
              <TableHeader >
                <TableRow className="bg-gray-50">
                  <TableHead className="ps-4">Order Info</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Product Details</TableHead>
                  <TableHead>Payment Type</TableHead>
                  <TableHead>Staff / Route</TableHead>
                  <TableHead className="text-center pe-4">Delivery Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      No orders found for the selected criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="ps-4 align-top">
                        <div className="flex flex-col text-sm">
                          <span className="font-semibold" title="Order #">
                            #{order.orderNumber || order.id?.slice(-8).toUpperCase() || '-'}
                          </span>
                          <span className="text-secondary-foreground text-xs" title="Ordered Date">
                            {order.orderCreatedAt ? format(new Date(order.orderCreatedAt), 'dd/MM/yy') : '-'}
                          </span>
                          <span className="text-muted-foreground text-xs" title="Ordered Time">
                            {order.orderCreatedAt ? format(new Date(order.orderCreatedAt), 'hh:mm a') : '-'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="align-top max-w-[150px] whitespace-normal break-words">
                        <div className="flex flex-col">
                          <span className="font-medium">{order.customerName}</span>
                          <span className="text-xs text-muted-foreground">{order.customerPhone}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] align-top whitespace-normal break-words">
                        <div className="flex flex-col text-xs text-muted-foreground">
                          {order.addressLine1 && <span>{order.addressLine1},</span>}
                          {order.addressLine2 && <span>{order.addressLine2},</span>}
                          {order.addressArea && <span>{order.addressArea}</span>}
                          {order.addressCity && <span>{order.addressCity} - {order.addressPincode}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="align-top max-w-[250px] whitespace-normal break-words">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col gap-1.5">
                            {order.items && order.items.length > 0 ? (
                              order.items.map((item, idx) => (
                                <div key={item.id || idx} className="text-[13px] font-semibold text-slate-800">
                                  {item.productName} : {item.quantity}
                                </div>
                              ))
                            ) : (
                              <div className="text-[13px] font-semibold text-slate-800">
                                {order.productName} : {order.quantity}
                              </div>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            Qty: <span className="font-semibold">{order.quantity}</span> | <span className="font-bold">₹{Math.round(Number(order.amount))}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline">{getPaymentDisplay(order)}</Badge>
                          {order.isQrPayment && (
                            <Badge variant="secondary" className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] font-bold py-0 h-5">
                              QR PAID
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top max-w-[180px] whitespace-normal break-words">
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{order.deliveryBoyName || 'Unassigned'}</span>
                          <span className="text-[10px] text-primary/70 font-semibold uppercase tracking-tight">{order.routeName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center align-top pe-4">
                        <div className="flex flex-col items-center gap-1">
                          <Badge
                            variant={order.deliveryStatus === 'DELIVERED' ? 'success' : (order.deliveryStatus === 'NOT_DELIVERED' || order.status === 'CANCELLED') ? 'destructive' : 'secondary'}
                            className="w-fit"
                          >
                            {/* Logic: 
                              1. If CANCELLED -> "Cancelled"
                              2. If PENDING (and Paid/COD) and NOT assigned -> "Order Received"
                              3. If Assigned AND Route NOT Generated -> "Confirmed"
                              4. If Assigned AND Route Generated -> "Delivery in Progress"
                              5. Else fallback
                           */}
                            {order.status === 'CANCELLED'
                              ? 'Cancelled'
                              : (order.status === 'PENDING' && (order.paymentStatus === 'SUCCESS' || order.paymentStatus === 'COD') && !order.isAssigned)
                                ? 'Order Received'
                                : (order.isAssigned && !order.isRouteGenerated && order.deliveryStatus !== 'DELIVERED' && order.deliveryStatus !== 'NOT_DELIVERED')
                                  ? 'Confirmed'
                                  : (order.isRouteGenerated && order.deliveryStatus !== 'DELIVERED' && order.deliveryStatus !== 'NOT_DELIVERED')
                                    ? 'Delivery in Progress'
                                    : order.deliveryStatus === 'DELIVERED' ? 'DELIVERED' :
                                      order.deliveryStatus === 'NOT_DELIVERED' ? 'NOT DELIVERED' :
                                        order.status.replace(/_/g, ' ')}
                          </Badge>
                          {order.deliveryStatus === 'DELIVERED' && order.deliveredDate && (
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(order.deliveredDate), 'MMM do, yyyy h:mm a')}
                            </span>
                          )}
                          {order.deliveryStatus === 'NOT_DELIVERED' && order.notDeliveredReason && (
                            <span className="text-[10px] text-red-500 font-medium bg-red-50 px-1.5 py-0.5 rounded border border-red-100 mt-1">
                              {order.notDeliveredReason}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Pagination Controls */}
            {!isLoading && (reportData.orders || []).length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-end gap-x-1 gap-y-4 mt-4 pt-4 border-t px-4 pb-4">
                {hasPermission('view_general_reports_count') && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm whitespace-nowrap">
                      <b>{Math.min(reportData.orders.length, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(reportData.orders.length, currentPage * itemsPerPage)}</b> of <b>{reportData.orders.length}</b>
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

                  {hasPermission('view_general_reports_count') && (
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
        )
      }

      <Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Download Report</DialogTitle>
            <DialogDescription>
              Select the type of report and your preferred format.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            <div className="space-y-3">
              <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground px-1">Choose Report Type</label>
              <div className="grid grid-cols-1 gap-2">
                <div
                  className={cn(
                    "relative flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all hover:bg-accent/50",
                    reportType === 'customer' ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-muted"
                  )}
                  onClick={() => setReportType('customer')}
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className={cn("p-2 rounded-lg", reportType === 'customer' ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-sm">Customer Report</span>
                      <span className="text-xs text-muted-foreground italic">Detailed orders, customer info & payments</span>
                    </div>
                    {reportType === 'customer' && <div className="absolute right-4"><CheckCircle2 className="h-5 w-5 text-primary" /></div>}
                  </div>
                </div>

                <div
                  className={cn(
                    "relative flex items-center p-4 rounded-xl border-2 cursor-pointer transition-all hover:bg-accent/50",
                    reportType === 'items' ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-muted"
                  )}
                  onClick={() => setReportType('items')}
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className={cn("p-2 rounded-lg", reportType === 'items' ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                      <Package className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-sm">Bill of Quantity</span>
                      <span className="text-xs text-muted-foreground italic">Product totals for stock preparation</span>
                    </div>
                    {reportType === 'items' && <div className="absolute right-4"><CheckCircle2 className="h-5 w-5 text-primary" /></div>}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground px-1">Select Format</label>
              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={handleDownloadPDF}
                  variant="outline"
                  className="flex flex-col items-center gap-3 h-auto py-6 rounded-2xl border-2 hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <FileText className="h-10 w-10 text-red-500" />
                  <div className="text-center">
                    <span className="font-bold block">PDF</span>
                    <span className="text-[10px] text-muted-foreground">Printable Doc</span>
                  </div>
                </Button>
                <Button
                  onClick={handleDownloadExcel}
                  variant="outline"
                  className="flex flex-col items-center gap-3 h-auto py-6 rounded-2xl border-2 hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <FileDown className="h-10 w-10 text-green-600" />
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



    </div >
  );
}

