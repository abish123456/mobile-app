'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import { adminFetch } from '../../../lib/admin-api';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Textarea } from '../../../components/ui/textarea';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import toast from 'react-hot-toast';
import { Loader2, CheckCircle2, XCircle, RefreshCcw } from 'lucide-react';

function StatusBadge({ status }) {
  const s = (status || '').toUpperCase();
  if (s === 'APPROVED') return <Badge className="bg-green-600 hover:bg-green-600">APPROVED</Badge>;
  if (s === 'REJECTED') return <Badge className="bg-red-600 hover:bg-red-600">REJECTED</Badge>;
  return <Badge className="bg-amber-600 hover:bg-amber-600">PENDING</Badge>;
}

export default function DepositVerificationsPage() {
  const [activeTab, setActiveTab] = useState('PENDING');
  const [isLoading, setIsLoading] = useState(false);
  const [requests, setRequests] = useState([]);
  const [noteById, setNoteById] = useState({});
  const [quantityById, setQuantityById] = useState({});
  const [actionLoadingId, setActionLoadingId] = useState(null); // format: "id-action"

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const res = await adminFetch(`/api/admin/deposit-verifications?status=${activeTab}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load requests');
      setRequests(data.requests || []);
      window.dispatchEvent(new CustomEvent('admin-data-refreshed'));
    } catch (e) {
      console.error(e);
      toast.error(e?.message || 'Failed to load requests');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const grouped = useMemo(() => requests, [requests]);

  const handleAction = async (id, action) => {
    setActionLoadingId(`${id}-${action}`);
    try {
      const payload = {
        action,
        adminNote: noteById[id] || null
      };

      // Include modifiedQuantity if it's different from original or if it was explicitly set
      if (action === 'APPROVE' && quantityById[id] !== undefined) {
        payload.modifiedQuantity = quantityById[id];
      }

      const res = await adminFetch(`/api/admin/deposit-verifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Action failed');
      toast.success(action === 'APPROVE' ? 'Approved' : 'Rejected');
      await fetchRequests();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || 'Action failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Deposit Verification Requests</h1>
          <p className="text-muted-foreground">Approve requests so customers can order using their existing cans.</p>
        </div>
        <Button variant="outline" onClick={fetchRequests} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="PENDING">Pending</TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4 mt-4">
          {isLoading ? (
            <Card>
              <CardContent className="py-10 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : grouped.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No {activeTab.toLowerCase()} requests.
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-md bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Requested On</TableHead>
                    <TableHead>Status</TableHead>
                    {activeTab === 'APPROVED' && <TableHead>Description</TableHead>}
                    {activeTab === 'PENDING' && <TableHead className="text-center">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grouped.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.customerName || 'Customer'}</div>
                        <div className="text-xs text-muted-foreground">{r.customerPhone}</div>
                      </TableCell>
                      <TableCell>{r.productName || r.productId}</TableCell>
                      <TableCell>
                        <div className="w-[100px]">
                          {r.status === 'PENDING' ? (
                            <div className="flex flex-col gap-1">
                              <Input
                                type="number"
                                min="1"
                                value={quantityById[r.id] !== undefined ? quantityById[r.id] : r.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  setQuantityById((prev) => ({ ...prev, [r.id]: isNaN(val) ? 1 : val }));
                                }}
                                className="h-8"
                              />
                              {quantityById[r.id] !== undefined && quantityById[r.id] !== r.quantity && (
                                <span className="text-[10px] text-amber-600">
                                  Original: {r.quantity}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="font-medium">{r.quantity}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          ₹{((quantityById[r.id] !== undefined ? quantityById[r.id] : r.quantity) * (r.depositAmount || 0)).toLocaleString()}
                        </div>
                        {/* {r.depositAmount > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            (Rate: ₹{r.depositAmount})
                          </div>
                        )} */}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {r.createdAtIST ? (
                          <>
                            {r.createdAtIST.split(', ')[0]}
                            <br />
                            {r.createdAtIST.split(', ')[1]}
                          </>
                        ) : r.createdAt ? (
                          <>
                            {formatInTimeZone(new Date(r.createdAt), 'Asia/Kolkata', 'MMM dd, yyyy')}
                            <br />
                            {formatInTimeZone(new Date(r.createdAt), 'Asia/Kolkata', 'hh:mm:ss a')}
                          </>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      {activeTab === 'APPROVED' && (
                        <TableCell>
                          <div className="max-w-[200px]">
                            <span className="text-sm text-muted-foreground">{r.adminNote || '-'}</span>
                          </div>
                        </TableCell>
                      )}
                      {activeTab === 'PENDING' && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleAction(r.id, 'APPROVE')}
                              disabled={actionLoadingId === `${r.id}-APPROVE` || actionLoadingId?.startsWith(`${r.id}-`)}
                              className="bg-green-600 hover:bg-green-700 h-8 font-bold"
                            >
                              {actionLoadingId === `${r.id}-APPROVE` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleAction(r.id, 'REJECT')}
                              disabled={actionLoadingId === `${r.id}-REJECT` || actionLoadingId?.startsWith(`${r.id}-`)}
                              className="h-8 font-bold"
                            >
                              {actionLoadingId === `${r.id}-REJECT` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <XCircle className="h-3 w-3 mr-1" />
                              )}
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

