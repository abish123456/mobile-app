'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { Users, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminFetch } from '../../../lib/admin-api';

export default function DeliveryBoysPage() {
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    fetchDeliveryBoys();
  }, []);

  const fetchDeliveryBoys = async () => {
    setIsLoading(true);
    try {
      const response = await adminFetch('/api/admin/delivery-boys');
      const data = await response.json();
      if (data.success) {
        setDeliveryBoys(data.deliveryBoys || []);
        window.dispatchEvent(new CustomEvent('admin-data-refreshed'));
      } else {
        toast.error(data.message || 'Failed to fetch delivery staff');
      }
    } catch (err) {
      console.error('Error fetching delivery staff:', err);
      toast.error('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.ceil(deliveryBoys.length / itemsPerPage);
  const paginatedDeliveryBoys = deliveryBoys.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-4">
      <Card className="border-2 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="space-y-1">
            <CardTitle>Delivery Staff List</CardTitle>
            <CardDescription>
              {deliveryBoys.length} delivery staff{deliveryBoys.length !== 1 ? 's' : ''} total
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {(isLoading && deliveryBoys.length === 0) ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : deliveryBoys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No delivery staff</h3>
              <p className="text-muted-foreground mb-4">
                No delivery staff registered in the system.
              </p>
            </div>
          ) : (
            <div className={`rounded-md border transition-opacity ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead>Emp ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Assigned Routes</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDeliveryBoys.map((deliveryBoy) => (
                    <TableRow key={deliveryBoy.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-semibold text-slate-800 text-xs">
                        {deliveryBoy.employeeCode || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">{deliveryBoy.name}</TableCell>
                      <TableCell className="text-xs text-slate-700">{deliveryBoy.phone || <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="text-xs text-slate-700">{deliveryBoy.email || <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="text-xs text-slate-500 max-w-[200px] truncate" title={deliveryBoy.address}>
                        {deliveryBoy.address || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-600">
                        {deliveryBoy.assignedRouteNames || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          deliveryBoy.onLeave 
                            ? 'bg-amber-100 text-amber-800' 
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {deliveryBoy.onLeave ? 'On Leave' : 'On Duty'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination Controls */}
          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
              <span className="text-sm text-muted-foreground mr-2">
                Showing {Math.min(deliveryBoys.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(deliveryBoys.length, currentPage * itemsPerPage)} of {deliveryBoys.length}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-medium">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card >
    </div >
  );
}
