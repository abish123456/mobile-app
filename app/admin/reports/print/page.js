'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { format } from 'date-fns';
import { adminFetch } from '../../../../lib/admin-api';
import { Loader2, Printer, StopCircle } from 'lucide-react';
import { Button } from '../../../../components/ui/button';

export default function PrintReportPage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
            <PrintReportContent />
        </Suspense>
    );
}

function PrintReportContent() {
    const searchParams = useSearchParams();
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const deliveryBoyId = searchParams.get('deliveryBoyId');

    useEffect(() => {
        fetchReport();
    }, [startDate, endDate, deliveryBoyId]);

    const fetchReport = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (startDate) params.append('startDate', startDate);
            if (endDate) params.append('endDate', endDate);
            if (deliveryBoyId) params.append('deliveryBoyId', deliveryBoyId);
            params.append('includeDetails', 'true');

            const response = await adminFetch(`/api/admin/reports?${params.toString()}`);
            const data = await response.json();

            if (data.success) {
                setReportData(data);
            } else {
                setError(data.message || 'Failed to fetch report');
            }
        } catch (err) {
            console.error('Error fetching print report:', err);
            setError('Network error');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Generating Report...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-screen items-center justify-center text-red-600">
                <StopCircle className="mr-2 h-6 w-6" />
                {error}
            </div>
        );
    }

    if (!reportData) return null;

    const { orders, report } = reportData;
    const today = new Date();

    return (
        <div className="min-h-screen bg-white p-8 print:p-0">
            <style jsx global>{`
        @media print {
          @page { margin: 0; }
          body { 
            margin: 1.6cm; 
            print-color-adjust: exact; 
            -webkit-print-color-adjust: exact; 
          }
          .no-print { display: none !important; }
        }
      `}</style>

            {/* Actions (Not Printed) */}
            <div className="no-print mb-8 flex justify-end gap-4">
                <Button onClick={() => window.close()} variant="outline">Close</Button>
                <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Printer className="mr-2 h-4 w-4" />
                    Print / Download PDF
                </Button>
            </div>

            {/* Report Header */}
            <div className="mb-6 border-b pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="relative h-16 w-16 overflow-hidden ">
                            <Image
                                src="/shop/Sobals logo.jpg"
                                alt="Logo"
                                fill
                                sizes="100px"
                                className="object-contain p-1"
                            />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-700">Delivery Report</h1>
                            <p className="text-gray-400 text-sm">Generated on {format(today, 'PPP p')}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-sm font-medium text-gray-500">Report Period</p>
                        <p className="font-semibold text-gray-900">
                            {startDate ? format(new Date(startDate), 'PP') : 'Beginning'}
                            {' - '}
                            {endDate ? format(new Date(endDate), 'PP') : 'Present'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="mb-6 grid grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                <div>
                    <p className="text-gray-500">Total Orders</p>
                    <p className="font-bold text-lg">{report?.totalOrders || 0}</p>
                </div>
                <div>
                    <p className="text-gray-500">Delivered</p>
                    <p className="font-bold text-lg text-green-600">{report?.ordersDelivered || 0}</p>
                </div>
                <div>
                    <p className="text-gray-500">Pending</p>
                    <p className="font-bold text-lg text-yellow-600">{report?.ordersPending || 0}</p>
                </div>
                <div>
                    <p className="text-gray-500">Not Delivered</p>
                    <p className="font-bold text-lg text-red-600">{report?.ordersNotDelivered || 0}</p>
                </div>

                <div className="col-span-4 h-px bg-gray-200 my-2"></div>

                <div>
                    <p className="text-gray-500">Online Payments</p>
                    <p className="font-bold text-lg text-blue-600">₹{Math.round(Number(report?.onlinePaymentTotal || 0))}</p>
                </div>
                <div>
                    <p className="text-gray-500">COD Expected</p>
                    <p className="font-bold text-lg text-orange-600">₹{Math.round(Number(report?.codExpected || 0))}</p>
                </div>
                <div>
                    <p className="text-gray-500">COD Collected</p>
                    <p className="font-bold text-lg text-green-600">₹{Math.round(Number(report?.codCollected || 0))}</p>
                </div>
                <div>
                    <p className="text-gray-500">COD Pending</p>
                    <p className="font-bold text-lg text-red-600">₹{Math.round(Number(report?.codPending || 0))}</p>
                </div>
            </div>

            {/* Detailed Table */}
            <div className="overflow-hidden rounded-lg border border-gray-300">
                <table className="w-full text-center text-sm">
                    <thead className="bg-gray-50 text-black-400 font-bold border-b text-md">
                        <tr>
                            <th className="px-3 py-2">Order Details</th>
                            <th className="px-3 py-2">Customer</th>
                            <th className="px-3 py-2">Address</th>
                            <th className="px-3 py-2">Product Details</th>
                            <th className="px-3 py-2">Payment</th>
                            <th className="px-3 py-2">Delivery Staff</th>
                            <th className="px-3 py-2">Delivery Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {orders.map((order, index) => (
                            <tr key={order.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                                {/* Order Details: Date, Time, ID */}
                                <td className="px-3 py-2 align-top">
                                    <div className="font-medium text-gray-900">
                                        {order.orderCreatedAt ? format(new Date(order.orderCreatedAt), 'dd/MM/yy') : '-'}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {order.orderCreatedAt ? format(new Date(order.orderCreatedAt), 'hh:mm a') : ''}
                                    </div>
                                    <div className="text-xs font-mono text-gray-500 mt-1">
                                        #{order.id.slice(-6).toUpperCase()}
                                    </div>
                                </td>

                                {/* Customer: Name, Phone */}
                                <td className="px-3 py-2 align-top">
                                    <div className="font-medium text-gray-900">{order.customerName}</div>
                                    <div className="text-xs text-gray-500">{order.customerPhone}</div>
                                </td>

                                {/* Address: Line1, Area, Pincode */}
                                <td className="px-3 py-2 align-top max-w-[200px] text-xs text-gray-600">
                                    <div>{order.addressLine1}</div>
                                    {order.addressLine2 && <div>{order.addressLine2}</div>}
                                    <div>{order.addressArea}</div>
                                    <div>{order.addressCity} - {order.addressPincode}</div>
                                </td>

                                {/* Product Details: Name, Qty, Amount */}
                                <td className="px-3 py-2 align-top">
                                    <div className="font-medium text-gray-900">{order.productName}</div>
                                    <div className="text-xs text-gray-500 flex items-center justify-center gap-2 mt-0.5">
                                        <span>Qty: {order.quantity}</span>
                                        <span className="text-gray-300">|</span>
                                        <span className="font-medium text-gray-900">₹{Math.round(Number(order.amount || 0))}</span>
                                    </div>
                                </td>

                                {/* Payment Type */}
                                <td className="px-3 py-2 align-top text-xs text-gray-600">
                                    <div>{order.paymentInstrument || (order.paymentMethod === 'ONLINE' ? 'Online' : order.paymentMethod)}</div>
                                    {order.isQrPayment && <div className="text-[10px] text-purple-600 font-bold">QR PAID</div>}
                                </td>

                                {/* Delivery Boy */}
                                <td className="px-3 py-2 align-top text-xs text-gray-600">
                                    {order.deliveryBoyName || '-'}
                                </td>

                                {/* Status + Delivered Date */}
                                <td className="px-3 py-2 align-top">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mb-1
                    ${order.deliveryStatus === 'DELIVERED' ? 'bg-green-100 text-green-800' :
                                            order.deliveryStatus === 'NOT_DELIVERED' ? 'bg-red-100 text-red-800' :
                                                'bg-yellow-100 text-yellow-800'}`}>
                                        {order.deliveryStatus === 'PENDING' ? 'Delivery in Progress' : order.deliveryStatus}
                                    </span>
                                    {order.deliveryStatus === 'DELIVERED' && order.deliveredDate && (
                                        <div className="text-xs text-gray-500">
                                            {format(new Date(order.deliveredDate), 'PPP p')}
                                        </div>
                                    )}
                                    {order.deliveryStatus === 'NOT_DELIVERED' && order.notDeliveredReason && (
                                        <div className="text-xs text-red-500 italic max-w-[120px]">
                                            {order.notDeliveredReason}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {orders.length === 0 && (
                    <div className="p-8 text-center text-gray-500">No orders found for this period.</div>
                )}
            </div>
        </div>
    );
}
