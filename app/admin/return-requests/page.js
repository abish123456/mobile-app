'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table';
import toast from 'react-hot-toast';
import { Loader2, CheckCircle } from 'lucide-react';

export default function ReturnRequestsPage() {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deliveryBoys, setDeliveryBoys] = useState([]);
    const [selectedRequest, setSelectedRequest] = useState(null); // For assignment
    const [selectedPartner, setSelectedPartner] = useState('');
    const [isAssigning, setIsAssigning] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('adminToken');
            const [reqRes, dbRes] = await Promise.all([
                fetch('/shop/api/admin/return-requests', { headers: { Authorization: `Bearer ${token}` } }),
                fetch('/shop/api/admin/delivery-boys', { headers: { Authorization: `Bearer ${token}` } })
            ]);

            const reqData = await reqRes.json();
            const dbData = await dbRes.json();

            if (reqData.success) setRequests(reqData.requests);
            if (dbData.success) setDeliveryBoys(dbData.deliveryBoys);
        } catch (e) {
            toast.error("Failed to load data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleAssign = async () => {
        if (!selectedRequest || !selectedPartner) return;
        setIsAssigning(true);
        try {
            const token = localStorage.getItem('adminToken');
            const res = await fetch(`/shop/api/admin/return-requests/${selectedRequest.id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ deliveryPartnerId: selectedPartner })
            });
            if (res.ok) {
                toast.success("Assigned successfully");
                setSelectedRequest(null);
                setSelectedPartner('');
                fetchData();
            } else {
                toast.error("Failed to assign");
            }
        } catch (e) {
            toast.error("Error assigning");
        } finally {
            setIsAssigning(false);
        }
    };

    const handleRefund = async (requestId) => {
        if (!confirm("Are you sure you want to mark this as paid? This will deduct the amount from the customer's wallet.")) return;

        // Optimistic UI update or loading state could be added here
        try {
            const token = localStorage.getItem('adminToken');
            const res = await fetch(`/shop/api/admin/return-requests/${requestId}/refund`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
            });
            const data = await res.json();

            if (res.ok) {
                toast.success("Refund marked as paid");
                fetchData();
            } else {
                toast.error(data.message || "Failed to mark paid");
            }
        } catch (e) {
            toast.error("Network error");
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Return Can Requests</h1>

            <Card>
                <CardHeader><CardTitle>Requests</CardTitle></CardHeader>
                <CardContent>
                    {loading ? <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div> : requests.length === 0 ? <p className="text-center py-4 text-muted-foreground">No return requests found.</p> : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Quantity</TableHead>
                                    <TableHead>Refund</TableHead>
                                    <TableHead>Bank Details</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Money Received</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.map(r => (
                                    <TableRow key={r.id}>
                                        <TableCell>{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                                        <TableCell>
                                            <div className="font-medium">{r.customerName}</div>
                                            <div className="text-xs text-muted-foreground">{r.customerPhone}</div>
                                        </TableCell>
                                        <TableCell>{r.quantity}</TableCell>
                                        <TableCell>₹{r.refundAmount}</TableCell>
                                        <TableCell className="max-w-[200px] text-xs break-words">
                                            {r.refundMethod === 'COD' ? (
                                                <div className="font-semibold text-blue-600">Cash Payment</div>
                                            ) : r.upiId ? (
                                                <div><span className="font-semibold">UPI:</span> {r.upiId}</div>
                                            ) : (
                                                <div>
                                                    <div><span className="font-semibold">Acc:</span> {r.accountNumber}</div>
                                                    <div><span className="font-semibold">IFSC:</span> {r.ifscCode}</div>
                                                    <div><span className="font-semibold">Bank:</span> {r.bankName}</div>
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={r.status === 'REQUESTED' ? 'outline' : r.status === 'ASSIGNED' ? 'secondary' : 'default'}>
                                                {r.status}
                                            </Badge>
                                            {r.status !== 'REQUESTED' && r.deliveryPartnerName && (
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    Assignee: {r.deliveryPartnerName}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {r.status === 'REQUESTED' && (
                                                <Button size="sm" onClick={() => setSelectedRequest(r)}>
                                                    Approve & Assign
                                                </Button>
                                            )}
                                            {r.status === 'COLLECTED' && (
                                                <span className="text-green-600 flex gap-1 items-center"><CheckCircle className="w-4 h-4" /> Collected</span>
                                            )}
                                            {r.status === 'REFUNDED' && (
                                                <span className="text-blue-600 flex gap-1 items-center"><CheckCircle className="w-4 h-4" /> Refunded</span>
                                            )}
                                            {r.status === 'ASSIGNED' && (
                                                <span className="text-muted-foreground text-xs">Waiting for collection</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {(r.refundMethod === 'COD' && r.status === 'REFUNDED') ? (
                                                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Yes (Cash)</Badge>
                                            ) : r.status === 'REFUNDED' ? (
                                                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Yes</Badge>
                                            ) : (r.status === 'COLLECTED') ? (
                                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleRefund(r.id)}>
                                                    Mark Paid
                                                </Button>
                                            ) : (
                                                <Badge variant="outline" className="text-gray-500 bg-gray-50">No</Badge>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Assign Delivery Partner</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <p className="text-sm text-muted-foreground">Assign a delivery partner to collect {selectedRequest?.quantity} cans from {selectedRequest?.customerName} at {selectedRequest?.customerPhone}.</p>
                        <Select value={selectedPartner} onValueChange={setSelectedPartner}>
                            <SelectTrigger><SelectValue placeholder="Select Partner" /></SelectTrigger>
                            <SelectContent>
                                {deliveryBoys.map(db => (
                                    <SelectItem key={db.id} value={db.id}>{db.name} ({db.phone})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedRequest(null)}>Cancel</Button>
                        <Button onClick={handleAssign} disabled={isAssigning || !selectedPartner}>
                            {isAssigning ? 'Assigning...' : 'Confirm Assignment'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
