'use client';

import { useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../../../components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../../components/ui/dialog';
import { Loader2, Search, CheckCircle2, XCircle, Info, AlertTriangle, UserX, RefreshCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { DatePicker } from '../../../components/ui/date-picker';
import { format } from 'date-fns';

export default function DepositRefundsPage() {
    const router = useRouter();
    const [requests, setRequests] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showApproveDialog, setShowApproveDialog] = useState(false);
    const [showRejectDialog, setShowRejectDialog] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [transactionId, setTransactionId] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterDate, setFilterDate] = useState(null);

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

    const fetchRequests = async () => {
        setIsLoading(true);
        try {
            const token = localStorage.getItem('adminToken');
            if (!token) {
                router.push('/admin/login');
                return;
            }

            const queryParams = new URLSearchParams();
            if (searchQuery) queryParams.append('search', searchQuery);
            if (filterDate) queryParams.append('date', format(filterDate, 'yyyy-MM-dd'));

            const res = await fetch(`/shop/api/admin/deposit-refunds?${queryParams.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
            const data = await res.json();
            if (data.success) {
                setRequests(data.requests);
            }
        } catch (error) {
            console.error('Error fetching requests:', error);
            toast.error('Failed to fetch requests');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchRequests();
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery, filterDate]);

    // Handlers mapped below

    // Handlers mapped below

    const handleApproveClick = (request) => {
        setSelectedRequest(request);
        setTransactionId('');
        setShowApproveDialog(true);
    };

    const handleRejectClick = (request) => {
        setSelectedRequest(request);
        setShowRejectDialog(true);
    };

    const confirmApprove = async () => {
        if (!selectedRequest) return;

        // Determine if it's a full refund (all cans returned)
        // Check both exact match or if customer has 0 cans left after this (logic: current <= requested)
        // But cansInHand is the CURRENT holding. 
        // We compare request.quantity with customerCansInHand
        const isFullRefund = (selectedRequest.customerCansInHand !== undefined && selectedRequest.quantity >= selectedRequest.customerCansInHand);

        // dynamic endpoint based on refund type
        const endpoint = isFullRefund
            ? `/shop/api/admin/deposit-refund/[id]/full-refund-deactivate`
            : `/shop/api/admin/deposit-refund/[id]/approve`;

        setIsProcessing(true);
        try {
            const token = localStorage.getItem('adminToken');
            const res = await fetch(endpoint.replace('[id]', selectedRequest.id), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    transactionId,
                }),
            });

            const data = await res.json();
            if (data.success) {
                toast.success(isFullRefund ? 'User refunded and deactivated successfully' : 'Refund approved successfully');
                setShowApproveDialog(false);
                fetchRequests();
            } else {
                toast.error(data.message || 'Failed to process refund');
            }
        } catch (error) {
            console.error('Error processing refund:', error);
            toast.error('Network error');
        } finally {
            setIsProcessing(false);
        }
    };

    const confirmReject = async () => {
        if (!selectedRequest) return;

        setIsProcessing(true);
        try {
            const token = localStorage.getItem('adminToken');
            const res = await fetch(`/shop/api/admin/deposit-refund/${selectedRequest.id}/reject`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            });

            const data = await res.json();
            if (data.success) {
                toast.success('Refund request rejected successfully');
                setShowRejectDialog(false);
                fetchRequests();
            } else {
                toast.error(data.message || 'Failed to reject request');
            }
        } catch (error) {
            console.error('Error rejecting request:', error);
            toast.error('Network error');
        } finally {
            setIsProcessing(false);
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'PAID':
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Paid
                    </span>
                );
            case 'REQUESTED':
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <Info className="w-3 h-3 mr-1" />
                        Requested
                    </span>
                );
            case 'REJECTED':
                return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <XCircle className="w-3 h-3 mr-1" />
                        Rejected
                    </span>
                );
            default:
                return status;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-800">Deposit Refund Requests</h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage and process customer deposit refund requests</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search name or mobile..."
                            className="pl-9 h-10 border-slate-200 focus-visible:ring-primary shadow-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <XCircle className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <DatePicker 
                            date={filterDate}
                            setDate={setFilterDate}
                            placeholder="Filter by Date"
                            className="w-[180px]"
                        />
                        <Button 
                            variant="outline" 
                            className="h-10 border-slate-200 shadow-sm flex items-center gap-2" 
                            onClick={() => {
                                if (searchQuery === '' && filterDate === null) {
                                    fetchRequests();
                                } else {
                                    setSearchQuery('');
                                    setFilterDate(null);
                                }
                            }}
                            disabled={isLoading}
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <RefreshCcw className="h-4 w-4 text-slate-600" />}
                            <span className="text-sm font-medium">Reset</span>
                        </Button>
                    </div>
                </div>
            </div>

            <Card className="shadow-sm border border-slate-200/60 bg-white overflow-hidden">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-50/50">
                                <TableRow className="border-b border-slate-100">
                                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 py-4 pl-6">Date</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 py-4">Customer</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 py-4">Quantity</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 py-4">Amount</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 py-4">Cans Collected</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 py-4">Payment Details</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 py-4">Status</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 py-4">Transaction ID</TableHead>
                                    <TableHead className="text-[11px] font-bold uppercase tracking-wider text-slate-500 py-4 text-center pr-6">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-32 text-center">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                                <p className="text-sm text-slate-500 font-medium">Loading requests...</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : requests.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-32 text-center">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <Info className="h-8 w-8 text-slate-300" />
                                                <p className="text-slate-500 font-medium">No refund requests found.</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    requests.map((request) => (
                                        <TableRow key={request.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0">
                                            <TableCell className="py-4 pl-6">
                                                {request.createdAtIST ? (
                                                    <>
                                                        {request.createdAtIST.split(',')[0]}
                                                        <br />
                                                        <span className="text-xs text-muted-foreground">
                                                            {request.createdAtIST.split(',')[1]}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        {formatInTimeZone(new Date(request.createdAt), 'Asia/Kolkata', 'MMM dd, yyyy')}
                                                        <br />
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatInTimeZone(new Date(request.createdAt), 'Asia/Kolkata', 'hh:mm:ss a')}
                                                        </span>
                                                    </>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium">{request.customerName}</div>
                                                <div className="text-xs text-muted-foreground">{request.customerId ? `ID: ${request.customerId.slice(-8).toUpperCase()}` : ''}</div>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {request.quantity ? (
                                                    <span>{request.quantity} cans</span>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs italic">
                                                        (~{Math.round(request.amount / 150)} cans)
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="font-bold text-base">₹{request.amount}</TableCell>
                                            <TableCell>
                                                {request.collected ? (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                                        Yes
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                                                        No
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="max-w-[200px]">
                                                <div className="text-sm">
                                                    {request.upiId ? (
                                                        <div>
                                                            <span className="font-semibold text-xs text-muted-foreground">UPI: </span>
                                                            {request.upiId}
                                                        </div>
                                                    ) : request.bankName === 'CASH' ? (
                                                        <div className="flex items-center gap-1.5 py-1 px-2 bg-blue-50 text-blue-700 rounded-md border border-blue-100 w-fit">
                                                            <span className="font-bold text-xs uppercase tracking-wider">COD</span>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-0.5">
                                                            {request.accountNumber && (
                                                                <div>
                                                                    <span className="font-semibold text-xs text-muted-foreground">Acc: </span>
                                                                    {request.accountNumber}
                                                                </div>
                                                            )}
                                                            {request.ifscCode && (
                                                                <div>
                                                                    <span className="font-semibold text-xs text-muted-foreground">IFSC: </span>
                                                                    {request.ifscCode}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>{getStatusBadge(request.status)}</TableCell>
                                            <TableCell className="font-mono text-xs">{request.transactionId || '-'}</TableCell>
                                            <TableCell className="text-center pr-6">
                                                {request.status === 'REQUESTED' ? (
                                                    <div className="flex gap-2 justify-center">
                                                        {hasPermission('approve_refunds') && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleApproveClick(request)}
                                                                className="bg-primary hover:bg-primary/90"
                                                            >
                                                                Approve
                                                            </Button>
                                                        )}
                                                        {hasPermission('reject_refunds') && (
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                onClick={() => handleRejectClick(request)}
                                                            >
                                                                Reject
                                                            </Button>
                                                        )}
                                                        {!hasPermission('approve_refunds') && !hasPermission('reject_refunds') && (
                                                            <span className="text-xs text-muted-foreground">-</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                                                        {request.status === 'PAID' ? (
                                                            <span className="text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                                                                <CheckCircle2 className="w-3 h-3" />
                                                                Processed
                                                            </span>
                                                        ) : (
                                                            <span className="text-rose-600 flex items-center gap-1 bg-rose-50 px-2 py-1 rounded-md border border-rose-100">
                                                                <XCircle className="w-3 h-3" />
                                                                Rejected
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Approve Dialog (Smart - Handles both Partial and Full Refund/Deactivate) */}
            <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Refund Payment</DialogTitle>
                        {/* <DialogDescription>
                            Mark this request as PAID. This will deduct ₹{selectedRequest?.amount} from the customer&apos;s wallet balance and reduce their held cans count.
                        </DialogDescription> */}
                    </DialogHeader>

                    {selectedRequest && (
                        <div className="space-y-4 py-2">
                            <div className="p-3 bg-muted rounded-md space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Customer:</span>
                                    <span className="font-medium">{selectedRequest?.customerName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Refund Amount:</span>
                                    <span className="font-bold text-base">₹{selectedRequest?.amount}</span>
                                </div>
                                <div className="flex justify-between border-t pt-2 mt-2">
                                    <span className="text-muted-foreground">Cans Returned / In Hand:</span>
                                    <span className="font-medium">
                                        {selectedRequest?.quantity} / {selectedRequest?.customerCansInHand}
                                    </span>
                                </div>
                                {selectedRequest?.bankName === 'CASH' && (
                                    <div className="flex justify-between border-t pt-2 mt-2">
                                        <span className="text-muted-foreground">Refund Method:</span>
                                        <span className="font-bold text-blue-700">CASH / COD</span>
                                    </div>
                                )}
                            </div>

                            {/* Full Refund Warning */}
                            {selectedRequest?.customerCansInHand !== undefined && selectedRequest.quantity >= selectedRequest.customerCansInHand && (
                                <div className="p-3 bg-red-50 border border-red-100 rounded-md text-sm text-red-600 flex items-start">
                                    <AlertTriangle className="w-5 h-5 mr-2 shrink-0" />
                                    <div>
                                        <p className="font-bold mb-1">Full Refund Detected</p>
                                        <p>Proceeding will <strong>DEACTIVATE</strong> this user account immediately.</p>
                                    </div>
                                </div>
                            )}

                            {selectedRequest?.bankName !== 'CASH' && (
                                <div className="space-y-2">
                                    <Label>Transaction ID (Optional)</Label>
                                    <Input
                                        placeholder="Enter bank transaction ID"
                                        value={transactionId}
                                        onChange={(e) => setTransactionId(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Record the reference ID for the payment made to the user.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowApproveDialog(false)} disabled={isProcessing}>
                            Cancel
                        </Button>
                        <Button
                            onClick={confirmApprove}
                            disabled={isProcessing}
                            className={
                                (selectedRequest?.quantity >= selectedRequest?.customerCansInHand)
                                    ? "bg-red-600 hover:bg-red-700"
                                    : "bg-green-600 hover:bg-green-700"
                            }
                        >
                            {isProcessing ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                (selectedRequest?.quantity >= selectedRequest?.customerCansInHand)
                                    ? <UserX className="h-4 w-4 mr-2" />
                                    : <CheckCircle2 className="h-4 w-4 mr-2" />
                            )}
                            {(selectedRequest?.quantity >= selectedRequest?.customerCansInHand)
                                ? 'Confirm Paid & Deactivate'
                                : 'Confirm Paid'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Dialog */}
            <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reject Refund Request</DialogTitle>
                    </DialogHeader>

                    {selectedRequest && (
                        <div className="space-y-4 py-2">
                            <p className="text-sm text-muted-foreground">
                                Are you sure you want to reject the refund request for <strong>{selectedRequest.customerName}</strong>?
                            </p>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowRejectDialog(false)} disabled={isProcessing}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmReject}
                            disabled={isProcessing}
                        >
                            {isProcessing ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <XCircle className="h-4 w-4 mr-2" />
                            )}
                            Confirm Rejection
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>


        </div>
    );
}
