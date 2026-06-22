"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Phone,
  MapPin,
  Navigation,
  CheckCircle2,
  XCircle,
  Clock,
  Package,
  Loader2,
  AlertCircle,
  RefreshCcw,
  Plus,
  IndianRupee,
  ClipboardList,
  ExternalLink,
  Reply,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import toast from 'react-hot-toast';

export default function DeliveryRoutePage() {
  const { date, token } = useParams();
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [isUpdating, setIsUpdating] = useState(null);

  // For regular delivery status update
  const [showStatusSelectionDialog, setShowStatusSelectionDialog] = useState(false);
  const [selectedOrderForStatus, setSelectedOrderForStatus] = useState(null);

  // For adding quantity
  const [showAddQuantityDialog, setShowAddQuantityDialog] = useState(false);
  const [selectedOrderForAdd, setSelectedOrderForAdd] = useState(null);
  const [additionalQuantity, setAdditionalQuantity] = useState("");
  const [additionalAmount, setAdditionalAmount] = useState(0);
  const [additionalSubtotal, setAdditionalSubtotal] = useState(0);
  const [additionalGst, setAdditionalGst] = useState(0);
  const [isAddingQuantity, setIsAddingQuantity] = useState(false);
  const [paymentType, setPaymentType] = useState('ONLINE');
  const [paymentLinkData, setPaymentLinkData] = useState(null);
  const [isPollingPayment, setIsPollingPayment] = useState(false);
  const [codPaymentLinkData, setCodPaymentLinkData] = useState(null);
  const [isGeneratingQR, setIsGeneratingQR] = useState(false);

  // For NOT_DELIVERED reason
  const [showNotDeliveredDialog, setShowNotDeliveredDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [notDeliveredReason, setNotDeliveredReason] = useState("");
  const [notDeliveredDetails, setNotDeliveredDetails] = useState("");


  // For Collection Confirmation
  const [showReturnConfirmDialog, setShowReturnConfirmDialog] = useState(false);
  const [returnRequestToConfirm, setReturnRequestToConfirm] = useState(null);
  const [confirmingReturnId, setConfirmingReturnId] = useState(null);

  // For COD Confirmation
  const [showCODConfirmDialog, setShowCODConfirmDialog] = useState(false);
  const [orderForCOD, setOrderForCOD] = useState(null);

  // For Delivery Confirmation after Paid
  const [showDeliveryAfterPaidDialog, setShowDeliveryAfterPaidDialog] = useState(false);
  const [pendingDeliveryOrder, setPendingDeliveryOrder] = useState(null);

  // For Phone/Call display
  const [phoneDialog, setPhoneDialog] = useState({ open: false, number: '', name: '' });

  // Route Submission State and Action
  const [isSubmittingRoute, setIsSubmittingRoute] = useState(false);
  const [showSubmitConfirmDialog, setShowSubmitConfirmDialog] = useState(false);
  const [pendingOrdersToDisplay, setPendingOrdersToDisplay] = useState([]);
  const [showPendingAlertDialog, setShowPendingAlertDialog] = useState(false);

  const handlePreSubmitCheck = () => {
    if (!route || !route.orders) return;

    // Frontend Check: Ensure all non-cancelled orders are DELIVERED or NOT_DELIVERED
    const pendingOrders = route.orders.filter(
      (o) => o.deliveryStatus === "PENDING" && o.status !== "CANCELLED"
    );
    if (pendingOrders.length > 0) {
      setPendingOrdersToDisplay(pendingOrders);
      setShowPendingAlertDialog(true);
      return;
    }

    setShowSubmitConfirmDialog(true);
  };

  const handleSubmitRoute = async () => {
    if (!route || !route.orders) return;

    try {
      setIsSubmittingRoute(true);
      const res = await fetch(`/shop/api/route/${date}/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Route submitted successfully!");
        fetchRouteDetails(true);
      } else {
        toast.error(data.message || "Failed to submit route");
      }
    } catch (err) {
      toast.error("Failed to submit route");
    } finally {
      setIsSubmittingRoute(false);
    }
  };

  const fetchRouteDetails = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const res = await fetch(`/shop/api/route/${date}/${token}`);
      const data = await res.json();

      if (data.success) {
        setRoute(prevRoute => {
          if (!prevRoute || !prevRoute.orders) return data.route;

          // Stable sort: ensure orders remain in the exact same sequence as first loaded
          const oldOrderIds = prevRoute.orders.map(o => o.id);
          const newOrdersMap = new Map(data.route.orders.map(o => [o.id, o]));
          const sortedNewOrders = [];

          oldOrderIds.forEach(id => {
            if (newOrdersMap.has(id)) {
              sortedNewOrders.push(newOrdersMap.get(id));
              newOrdersMap.delete(id);
            }
          });

          newOrdersMap.forEach(order => {
            sortedNewOrders.push(order);
          });

          return {
            ...data.route,
            orders: sortedNewOrders
          };
        });
        setError(null);
      } else {
        setError(data.message);
      }
    } catch (err) {
      if (!isSilent) setError("Failed to load route details");
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchRouteDetails();
  }, [date, token]);

  // Persistent Delivery Confirmation Logic
  useEffect(() => {
    if (route?.orders && !pendingDeliveryOrder) {
      // Find orders that are COD Paid but not yet marked Delivered/Not-Delivered
      const limboOrder = route.orders.find(o => 
        (o.paymentMethod === 'COD' || o.isQrPayment) && 
        o.paymentStatus === 'SUCCESS' && 
        o.deliveryStatus === 'PENDING' &&
        o.status !== 'CANCELLED'
      );

      if (limboOrder) {
        setPendingDeliveryOrder(limboOrder);
        setShowDeliveryAfterPaidDialog(true);
      }
    }
  }, [route, pendingDeliveryOrder]);

  const openInMaps = (address) => {
    let query;
    if (address.latitude && address.longitude) {
      query = `${address.latitude},${address.longitude}`;
    } else {
      query = encodeURIComponent(
        `${address.line1}, ${address.area || ""}, ${address.city}, ${address.pincode}`
      );
    }
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, "_blank");
  };

  const handleCallClick = (target) => {
    const phone = target.address?.contactPhone || target.customer?.phone;
    const name = target.customer?.name || target.address?.contactName || 'Customer';
    
    if (!phone) {
      toast.error("Phone number not available");
      return;
    }
    
    setPhoneDialog({ open: true, number: phone, name });
  };

  const updateDeliveryStatus = async (orderId, routeOrderId, status, reason = null) => {
    try {
      setIsUpdating(`${orderId}:${status}`);
      const res = await fetch("/shop/api/route-orders/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeOrderId,
          deliveryStatus: status,
          notDeliveredReason: reason,
          token,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Order marked as ${status.replace("_", " ")}`);
        await fetchRouteDetails(true);
      } else {
        toast.error(data.message || "Failed to update status");
      }
    } catch (err) {
      toast.error("Failed to update status");
    } finally {
      setIsUpdating(null);
    }
  };

  const handleStatusClick = (order) => {
    setSelectedOrderForStatus(order);
    setShowStatusSelectionDialog(true);
  };

  const handleConfirmDeliveryStatus = (status, actualReturns = {}) => {
    if (status === 'DELIVERED') {
      updateDeliveryStatus(selectedOrderForStatus.id, selectedOrderForStatus.routeOrderId, status);
    } else {
      setSelectedOrder(selectedOrderForStatus);
      setShowNotDeliveredDialog(true);
    }
    setShowStatusSelectionDialog(false);
  };

  const handleNotDelivered = (order) => {
    setSelectedOrder(order);
    setShowNotDeliveredDialog(true);
  };

  const handleSubmitNotDelivered = () => {
    if (!notDeliveredReason) {
      toast.error("Please select a reason");
      return;
    }
    const finalReason = notDeliveredReason === "Other" ? notDeliveredDetails : notDeliveredReason;
    updateDeliveryStatus(selectedOrder.id, selectedOrder.routeOrderId, "NOT_DELIVERED", finalReason);
    setShowNotDeliveredDialog(false);
    setNotDeliveredReason("");
    setNotDeliveredDetails("");
  };

  const handleConfirmReturn = async (returnId) => {
    try {
      setConfirmingReturnId(returnId);
      const res = await fetch(`/shop/api/delivery/can-returns/${returnId}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${route.deliveryBoy.phone}`
        },
        body: JSON.stringify({
          token,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Return collection confirmed");
        fetchRouteDetails(true);
      } else {
        toast.error(data.message || "Failed to confirm collection");
      }
    } catch (err) {
      toast.error("Failed to confirm collection");
    } finally {
      setConfirmingReturnId(null);
      setShowReturnConfirmDialog(false);
    }
  };

  const handleMarkAsPaid = async (order) => {
    try {
      setIsUpdating(`${order.id}:PAID`);
      const res = await fetch("/shop/api/route-orders/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeOrderId: order.routeOrderId,
          token,
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success("Payment marked as PAID");
        setPendingDeliveryOrder(order);
        setShowDeliveryAfterPaidDialog(true);
        fetchRouteDetails(true);
      } else {
        toast.error(data.message || "Failed to mark as paid");
      }
    } catch (err) {
      toast.error("Failed to mark as paid");
    } finally {
      setIsUpdating(null);
      setShowCODConfirmDialog(false);
    }
  };

  const handleConfirmDeliveryAfterPaid = async (confirm) => {
    if (confirm && pendingDeliveryOrder) {
      await updateDeliveryStatus(pendingDeliveryOrder.id, pendingDeliveryOrder.routeOrderId, 'DELIVERED');
    }
    setShowDeliveryAfterPaidDialog(false);
    setPendingDeliveryOrder(null);
  };

  const handleAddQuantity = (order) => {
    setSelectedOrderForAdd(order);
    setShowAddQuantityDialog(true);
  };

  const handleSubmitAddQuantity = async () => {
    if (!additionalQuantity || isNaN(parseInt(additionalQuantity))) {
      toast.error("Please enter a valid quantity");
      return;
    }

    try {
      setIsAddingQuantity(true);
      const res = await fetch("/shop/api/route-orders/add-quantity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrderForAdd.id,
          routeOrderId: selectedOrderForAdd.routeOrderId,
          additionalQuantity: parseInt(additionalQuantity),
          paymentType, // 'ONLINE' or 'COD'
          token
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (paymentType === 'ONLINE' && data.payment) {
          setPaymentLinkData(data.payment);
          setAdditionalAmount(data.total_amount / 100);
          setAdditionalSubtotal(data.subtotal / 100);
          setAdditionalGst(data.gst / 100);
          setIsPollingPayment(true);
          // Start polling for payment status
          pollPaymentStatus(data.payment.id, selectedOrderForAdd?.id);
        } else {
          toast.success("Quantity added successfully");
          setShowAddQuantityDialog(false);
          fetchRouteDetails(true);
        }
      } else {
        toast.error(data.message || "Failed to add quantity");
      }
    } catch (err) {
      toast.error("Failed to add quantity");
    } finally {
      if (paymentType !== 'ONLINE') {
        setIsAddingQuantity(false);
      }
    }
  };

  const pollPaymentStatus = async (paymentId, orderIdToPoll) => {
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch("/shop/api/payments/check-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentLinkId: paymentId,
            orderId: orderIdToPoll
          })
        });
        const data = await res.json();

        if (data.success && (data.status === "SUCCESS" || data.status === "paid")) {
          clearInterval(pollInterval);
          setIsPollingPayment(false);
          toast.success("Payment Received Successfully!");
          setShowAddQuantityDialog(false);
          setShowCODConfirmDialog(false);
          setCodPaymentLinkData(null);
          
          // Force delivery confirmation popup for the paid order
          const order = route.orders.find(o => o.id === orderIdToPoll);
          if (order) {
            setPendingDeliveryOrder(order);
            setShowDeliveryAfterPaidDialog(true);
          }
          
          fetchRouteDetails(true);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000); // Poll every 3 seconds

    // Stop polling if dialog is closed or after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      setIsPollingPayment(false);
    }, 5 * 60 * 1000);
  };

  const handleGenerateQR = async () => {
    try {
      setIsGeneratingQR(true);
      const res = await fetch("/shop/api/route-orders/generate-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeOrderId: orderForCOD.routeOrderId,
          token
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCodPaymentLinkData(data.paymentLink);
        setIsPollingPayment(true);
        pollPaymentStatus(data.paymentLink.id, orderForCOD.id);
      } else {
        toast.error(data.message || "Failed to generate QR code");
      }
    } catch (err) {
      toast.error("Failed to generate QR code");
    } finally {
      setIsGeneratingQR(false);
    }
  };


  const formatQuantityDisplay = (order) => {
    if (order.additionalQuantity && order.additionalQuantity > 0) {
      return (
        <span className="flex items-center gap-1">
          {order.originalQuantity} + <span className="text-blue-600 font-bold">{order.additionalQuantity}</span>
        </span>
      );
    }
    return order.quantity;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 text-center">
        <div className="max-w-md bg-white p-8 rounded-2xl shadow-xl border border-red-100">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700"
            onClick={() => window.location.reload()}
          >
            Retry Access
          </Button>
        </div>
      </div>
    );
  }

  const { summary, isExpired } = route;

  return (
    <div className="min-h-screen bg-gray-50 pb-32 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex-shrink-0 overflow-hidden flex items-center justify-center">
                <img
                  src="/shop/Sobals logo.jpg"
                  alt="Sabol's Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-black text-gray-700 tracking-tight leading-none">Delivery Route</h1>
                <p className="text-sm font-medium text-gray-500 mt-1">
                  {new Date(route.date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  })}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 font-bold px-3 py-1">
                {route.area}
              </Badge>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                  <User className="w-4 h-4 text-gray-500" />
                </div>
                <span className="text-xs font-bold text-gray-700">{route.deliveryBoy.name}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 md:gap-4">
            <div className="bg-white rounded p-2 shadow-sm border">
              <div className="text-[10px] text-gray-500 uppercase font-bold">Orders</div>
              <div className="text-sm font-bold text-gray-900">{summary.totalOrders}</div>
            </div>
            <div className="bg-white rounded p-2 shadow-sm border">
              <div className="text-[10px] text-gray-500 uppercase font-bold">Items</div>
              <div className="text-sm font-bold text-gray-900">{summary.totalCans}</div>
            </div>
            <div className="bg-white rounded p-2 shadow-sm border">
              <div className="text-[10px] text-gray-500 uppercase font-bold">COD</div>
              <div className="text-sm font-bold text-gray-900">₹{Math.round(Number(summary.expectedCOD || 0))}</div>
            </div>
            <div className="bg-white rounded p-2 shadow-sm border">
              <div className="text-[10px] text-green-600 uppercase font-bold">Coll.</div>
              <div className="text-sm font-bold text-green-600">₹{Math.round(Number(summary.codCollected || 0))}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Return Requests Section */}
      {route.returnRequests && route.returnRequests.length > 0 && (
        <div className="max-w-4xl mx-auto px-3 py-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-gray-200"></div>
            <Badge variant="outline" className="text-xs font-semibold bg-orange-50 text-orange-700 border-orange-200 uppercase tracking-wider px-3 py-1 flex items-center gap-1">
              <RefreshCcw className="w-3 h-3" />
              Return Requests
            </Badge>
            <div className="h-px flex-1 bg-gray-200"></div>
          </div>

          {route.returnRequests.map(req => (
            <Card key={req.id} className={`shadow-md overflow-hidden ${(req.status === 'COLLECTED' || req.status === 'REFUNDED') ? 'bg-gray-50 opacity-75' : 'bg-white border-orange-200'}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                      R
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {req.customer.name}
                        {req.address?.nickname && (
                          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                            {req.address.nickname}
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">{req.customer.phone}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0 border-green-200 text-green-600 bg-white"
                      onClick={() => handleCallClick(req)}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </Button>
                    {(req.status === 'COLLECTED' || req.status === 'REFUNDED') ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Collected</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Pick Up</Badge>
                    )}
                  </div>
                </div>

                {req.address?.contactName && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50/50 rounded border border-blue-100/50 text-[11px] text-blue-700">
                    <User className="h-3.5 w-3.5" />
                    <span className="font-bold">Contact: {req.address.contactName}</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 bg-gray-50 p-2 rounded-lg border border-gray-100">
                  <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <div className="text-xs text-gray-600 leading-tight">
                    <span className="font-medium text-gray-900">{req.address.line1}</span>
                    {req.address.area && <span>, {req.address.area}</span>}
                    {req.address.city && <span>, {req.address.city} - {req.address.pincode}</span>}
                  </div>
                  <Button variant="ghost" className="ml-auto h-6 w-6 p-0 text-blue-600" onClick={() => openInMaps(req.address)}>
                    <Navigation className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-orange-50 px-2 py-1 rounded text-xs font-semibold text-orange-700 border border-orange-100">
                      {req.quantity} Cans
                    </div>
                    <div className="text-xs text-gray-500">Refund: ₹{Math.round(Number(req.refundAmount || 0))}</div>
                  </div>
                  {req.status !== 'COLLECTED' && req.status !== 'REFUNDED' && (
                    <Button
                      size="sm"
                      className="h-8 bg-orange-600 hover:bg-orange-700 text-white font-semibold"
                      onClick={() => {
                        setReturnRequestToConfirm(req);
                        setShowReturnConfirmDialog(true);
                      }}
                      disabled={confirmingReturnId !== null || route.isSubmitted || route.isExpired}
                    >
                      {confirmingReturnId === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm Collection'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Orders List */}
      <div className="max-w-4xl mx-auto px-3 py-6 space-y-4">
        {route.orders
          .map((order, index) => {
          const isDelivered = order.deliveryStatus === 'DELIVERED';
          const isNotDelivered = order.deliveryStatus === 'NOT_DELIVERED';
          const isCancelled = order.status === 'CANCELLED';
          
          const isPendingCOD = pendingDeliveryOrder && pendingDeliveryOrder.id !== order.id;

          // Show pincode badge only if it's the first order or pincode changed from previous order
          const showPincodeHeader = index === 0 || order.address.pincode !== route.orders[index - 1].address.pincode;
          const pincode = order.address.pincode;

          return (
            <div key={order.id} className={`space-y-4 transition-all duration-300 ${isPendingCOD ? 'opacity-30 pointer-events-none grayscale blur-[1px]' : ''}`}>
              {showPincodeHeader && (
                <div className="flex items-center gap-2 pt-4 pb-2">
                  <div className="h-px flex-1 bg-gray-200"></div>
                  <Badge variant="outline" className="text-xs font-semibold bg-blue-50 text-blue-700 border-blue-200 uppercase tracking-wider px-3 py-1">
                    Pincode: {pincode}
                  </Badge>
                  <div className="h-px flex-1 bg-gray-200"></div>
                </div>
              )}
              <Card
                key={order.id}
                className={`shadow-md overflow-hidden transition-all ${isDelivered ? 'bg-white border-green-200 ring-1 ring-green-100' : ''
                  } ${isCancelled ? 'bg-gray-50 opacity-75' : ''} ${isNotDelivered ? 'bg-white border-red-200 ring-1 ring-red-100' : ''
                  }`}
              >
                <CardContent className="p-4 space-y-4">

                  {/* Row 1: Header - Name and Status */}
                  <div className="flex justify-between items-start">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {order.customer.name}
                          {order.address.nickname && (
                            <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                              {order.address.nickname}
                            </span>
                          )}
                          {/* Display Total Deposit Cans count instead of return cans count */}
                          {typeof order.totalDepositCans === 'number' && (
                            <span className="ml-2 text-xs font-normal text-gray-600 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full inline-flex items-center" title="Total Deposit Cans">
                              {order.totalDepositCans} cans
                            </span>
                          )}
                        </h3>

                        <div className="flex flex-col gap-0.5 mt-1">
                          <p className="text-xs text-gray-500">Order #{order.orderNumber || order.id.slice(-8).toUpperCase()} • {order.address.pincode}</p>
                          <p className="text-[10px] text-gray-400 font-medium">Ordered on {new Date(order.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                      <div className="flex gap-1">
                        {isCancelled ? (
                          <Badge variant="secondary" className="bg-gray-200 text-gray-700">Cancelled</Badge>
                        ) : isDelivered ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100">Delivered</Badge>
                        ) : isNotDelivered ? (
                          <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Not Delivered</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">In Progress</Badge>
                        )}
                      </div>
                      {order.address.contactName && (
                        <div className="text-[11px] font-bold text-blue-600 uppercase tracking-tight bg-blue-50 px-2 py-1 rounded border border-blue-100 flex items-center gap-1.5">
                          <User className="h-3 w-3" />
                          {order.address.contactName}
                        </div>
                      )}
                      {order.isReassigned && (
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <Reply className="h-3 w-3 text-amber-500" />
                          <span className="text-[10px] text-amber-600 font-bold uppercase tracking-tight">Re-assigned {order.reassignedCount > 0 && `(${order.reassignedCount})`}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Contact, Address, Map - Single Line Flex */}
                  <div className="flex items-center gap-1.5 md:gap-2 bg-gray-50 p-1.5 md:p-2 rounded-lg border border-gray-100">

                    {/* Call Button - Icon Only */}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 md:h-10 md:w-10 shrink-0 border-green-200 text-green-600 bg-white hover:bg-green-50 hover:text-green-700 font-bold"
                      onClick={() => handleCallClick(order)}
                    >
                      <Phone className="h-4 w-4" />
                    </Button>

                    {/* Address Text - Middle */}
                    <div className="flex-1 min-w-0 px-1 border-l border-r border-gray-200 mx-1">
                      <div className="flex items-start gap-1.5 h-full">
                        <MapPin className="h-3.5 w-3.5 md:h-4 md:w-4 text-gray-400 mt-0.5 shrink-0" />
                        <div className="text-[10px] md:text-xs text-gray-600 leading-tight break-words whitespace-normal">
                          <span className="font-medium text-gray-900">{order.address.line1}</span>
                          {order.address.line2 && <span>, {order.address.line2}</span>}
                          <span>, {order.address.area}</span>
                          <span>, {order.address.city} - {order.address.pincode}</span>
                        </div>
                      </div>
                    </div>

                    {/* Maps Button - Text + Icon */}
                    <Button
                      variant="ghost"
                      className="shrink-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700 font-medium px-1.5 md:px-2 h-9 md:h-10 text-xs md:text-sm"
                      onClick={() => openInMaps(order.address)}
                    >
                      <Navigation className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1" />
                      Maps
                    </Button>
                  </div>

                  {/* Always visible Items Breakdown */}
                  {order.items && order.items.length > 0 && (
                    <div className="mt-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Order Items</div>
                      <div className="space-y-1.5">
                        {order.items.map((item, idx) => (
                          <div key={item.id || idx} className="flex items-center justify-between text-xs bg-white p-2 rounded border border-gray-100">
                            <span className="text-gray-700 font-medium">{item.quantity}x {item.productName}</span>
                            <span className="font-bold text-blue-700">₹{(item.price * item.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Row 3: Details & Actions */}
                  <div className="flex items-stretch gap-2 md:gap-3">
                    {/* Qty & Price Box - Static */}
                    <div className="bg-blue-50 rounded-lg p-2 flex flex-col justify-center min-w-[70px] md:min-w-[80px] shrink-0 border border-blue-100">
                      <div className="text-[10px] md:text-xs text-gray-500 font-medium flex items-center gap-1 justify-between">
                        <div className="flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          {formatQuantityDisplay(order)} Items
                        </div>
                        {/* 
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                          onClick={() => handleAddQuantity(order)}
                          disabled={isDelivered || isNotDelivered || isCancelled || isExpired}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        */}
                      </div>

                      <div className="text-base md:text-lg font-bold text-blue-700 leading-tight mt-0.5">
                        ₹{Math.round(Number(order.amount || 0))}
                      </div>
                    </div>

                    {/* COD / Paid Button */}
                    <div className="flex-1 flex items-center justify-center min-w-0">
                      {order.paymentStatus === 'COD' && order.outstandingAmount > 0 ? (
                        <Button
                          variant="default"
                          className="w-full h-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm text-xs md:text-sm px-2"
                          onClick={() => {
                            setOrderForCOD(order);
                            setShowCODConfirmDialog(true);
                          }}
                          disabled={!!isUpdating || isDelivered || isNotDelivered || isCancelled || route.isSubmitted || route.isExpired}
                        >
                          {isUpdating === `${order.id}:PAID` ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <IndianRupee className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1" />}
                          COD
                        </Button>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-300">
                          <span className="text-[10px] font-medium text-gray-500 uppercase">Payment</span>
                          <span className="text-xs md:text-sm font-bold text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {order.paymentMethod === 'COD' ? 'COD PAID' : 'PAID'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action Button: Not Delivered (initially for COD) or Deliver (after paid) */}
                    <div className="flex-[1.2] min-w-0">
                      {isDelivered || isNotDelivered ? (
                        <div className={`w-full h-full flex items-center justify-center text-sm md:text-base font-bold px-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 ${isDelivered ? 'text-green-700' : 'text-red-700'
                          }`}>
                          {isDelivered ? (
                            <><CheckCircle2 className="h-4 w-4 md:h-5 md:w-5 mr-1.5 md:mr-2" /> Delivered</>
                          ) : (
                            <><XCircle className="h-4 w-4 md:h-5 md:w-5 mr-1.5 md:mr-2" /> Not Delivered</>
                          )}
                        </div>
                      ) : (
                        <>
                          {order.paymentStatus === 'COD' && order.outstandingAmount > 0 ? (
                            <Button
                              variant="outline"
                              className="w-full h-full text-sm md:text-base font-bold shadow-sm px-2 border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => handleNotDelivered(order)}
                              disabled={!!isUpdating || isCancelled || route.isSubmitted || route.isExpired}
                            >
                              {isUpdating === `${order.id}:NOT_DELIVERED` ? (
                                <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin mr-1.5 md:mr-2" />
                              ) : (
                                <XCircle className="h-4 w-4 md:h-5 md:w-5 mr-1.5 md:mr-2" />
                              )}
                              Not Del.
                            </Button>
                          ) : (
                            <Button
                              className="w-full h-full text-sm md:text-base font-bold shadow-sm px-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:from-blue-600 hover:to-indigo-700"
                              onClick={() => handleStatusClick(order)}
                              disabled={!!isUpdating || isCancelled || route.isSubmitted || route.isExpired}
                            >
                              {isUpdating === `${order.id}:DELIVERED` ? (
                                <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5 mr-1.5 md:mr-2" />
                                  Deliver
                                </>
                              )}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Info Alerts */}
                  {!isDelivered && !isNotDelivered && !isCancelled && route.isExpired && (
                    <Alert className="mt-2 bg-orange-50 border-orange-200">
                      <AlertCircle className="h-4 w-4 text-orange-600" />
                      <AlertDescription className="text-orange-700">
                        Route expired. Actions disabled.
                      </AlertDescription>
                    </Alert>
                  )}

                  {!isDelivered && !isNotDelivered && !isCancelled && route.isSubmitted && (
                    <Alert className="mt-2 bg-green-50 border-green-200">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-700 font-medium">
                        Route submitted. Actions locked.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Not Delivered Reason */}
                  {isNotDelivered && order.notDeliveredReason && (
                    <div className="bg-red-50 border border-red-100 rounded-lg p-2 text-sm text-red-700">
                      <span className="font-semibold mr-1">Reason:</span> {order.notDeliveredReason}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })}
          {/* Modern Footer Summary */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] p-3 safe-area-bottom">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between px-5 gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase font-semibold">Progress</span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-gray-900">{summary.deliveredCount}</span>
                <span className="text-sm text-gray-500">/ {summary.totalOrders}</span>
              </div>
            </div>

            {/* Submit Button or Submitted Badge */}
            <div className="flex-1 max-w-xs px-2">
              {route.isSubmitted ? (
                <div className="w-full py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-center font-bold text-xs flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-green-600" /> Route Submitted
                </div>
              ) : (
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg text-xs"
                  onClick={handlePreSubmitCheck}
                  disabled={isSubmittingRoute || route.isExpired}
                >
                  {isSubmittingRoute ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    "Submit Route"
                  )}
                </Button>
              )}
            </div>

            <div className="flex flex-col items-end">
              <span className="text-[10px] text-gray-500 uppercase font-semibold text-right w-full">Collected</span>
              <div className="flex items-baseline gap-1 w-full justify-end">
                <span className="text-lg font-bold text-green-600 font-bold">₹{Math.round(Number(summary.codCollected || 0))}</span>
              </div>
            </div>
          </div>
          <div className="pt-1 border-t border-gray-50 text-center">
            <p className="text-[9px] text-gray-400 font-light tracking-wide">
              Powered by <a href="https://www.stedaxis.com" target="_blank" rel="noopener noreferrer" className="font-medium">STEDAXIS</a>
            </p>
          </div>
        </div>
      </div>
      </div>

      {/* Dialogs */}
      <Dialog open={showStatusSelectionDialog} onOpenChange={setShowStatusSelectionDialog}>
        <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Update Delivery Status</DialogTitle>
            {/* <DialogDescription>
              Mark order #{selectedOrderForStatus?.id.slice(-8).toUpperCase()} as:
            </DialogDescription> */}
          </DialogHeader>
          <div className="flex flex-col gap-4 ">
            <div className="h-px bg-gray-100 my-1"></div>

            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white h-12 text-lg shadow-md"
              onClick={() => {
                const actualReturns = window._actualReturns || {};
                handleConfirmDeliveryStatus("DELIVERED", actualReturns);
                window._actualReturns = {}; // Reset
              }}
            >
              <CheckCircle2 className="h-5 w-5 mr-3" />
              Confirm Delivery
            </Button>
            {!(selectedOrderForStatus?.paymentMethod === 'COD' && (selectedOrderForStatus?.paymentStatus === 'PAID' || selectedOrderForStatus?.outstandingAmount === 0)) && (
              <Button
                variant="outline"
                className="w-full border-red-200 text-red-600 hover:bg-red-50 h-12 text-lg"
                onClick={() => handleConfirmDeliveryStatus("NOT_DELIVERED")}
              >
                <XCircle className="h-5 w-5 mr-3" />
                Not Delivered
              </Button>
            )}
          </div>
          <DialogFooter className="sm:justify-start">
            <Button type="button" variant="secondary" onClick={() => setShowStatusSelectionDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Quantity Dialog */}
      <Dialog
        open={showAddQuantityDialog}
        onOpenChange={(open) => {
          // Prevent closing when polling payment
          if (!open && isPollingPayment) {
            return;
          }
          setShowAddQuantityDialog(open);
          if (!open) {
            // Reset state when closing
            setSelectedOrderForAdd(null);
            setPaymentLinkData(null);
            setPaymentType("ONLINE");
            setAdditionalQuantity("");
            setAdditionalAmount(0);
            setAdditionalSubtotal(0);
            setAdditionalGst(0);
            setIsPollingPayment(false);
          }
        }}
      >
        <DialogContent
          className="max-w-md"
          showCloseButton={!isPollingPayment}
          onInteractOutside={(e) => {
            // Prevent closing by clicking outside when polling
            if (isPollingPayment) {
              e.preventDefault();
            }
          }}
          onEscapeKeyDown={(e) => {
            // Prevent closing with ESC when polling
            if (isPollingPayment) {
              e.preventDefault();
            }
          }}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Add Additional Quantity</DialogTitle>
            <DialogDescription>Enter the additional quantity the customer needs.</DialogDescription>
          </DialogHeader>
          {!paymentLinkData ? (
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Additional Quantity</Label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={additionalQuantity}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Allow empty string
                      if (value === "") {
                        setAdditionalQuantity("");
                        return;
                      }
                      // Only allow positive numbers
                      const numValue = parseInt(value);
                      if (!isNaN(numValue) && numValue > 0) {
                        setAdditionalQuantity(value);
                      }
                    }}
                    placeholder="Enter quantity"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={isAddingQuantity}
                  />
                </div>

                <div className="space-y-4 pt-2 border-t">
                  <Label>Payment Method</Label>
                  <div className="flex gap-4">
                    <div
                      className={`flex-1 border rounded-lg p-3 cursor-pointer transition-all ${paymentType === "ONLINE" ? "bg-blue-50 border-blue-500 ring-1 ring-blue-500" : "hover:bg-gray-50"}`}
                      onClick={() => setPaymentType("ONLINE")}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${paymentType === "ONLINE" ? "border-blue-500" : "border-gray-400"}`}>
                          {paymentType === "ONLINE" && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                        </div>
                        <span className="font-medium text-sm">Online Payment</span>
                      </div>
                      <p className="text-xs text-gray-500 pl-6">Send payment link via SMS</p>
                    </div>

                    <div
                      className={`flex-1 border rounded-lg p-3 cursor-pointer transition-all ${paymentType === "COD" ? "bg-green-50 border-green-500 ring-1 ring-green-500" : "hover:bg-gray-50"}`}
                      onClick={() => setPaymentType("COD")}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${paymentType === "COD" ? "border-green-500" : "border-gray-400"}`}>
                          {paymentType === "COD" && <div className="w-2 h-2 rounded-full bg-green-500" />}
                        </div>
                        <span className="font-medium text-sm">Cash (COD)</span>
                      </div>
                      <p className="text-xs text-gray-500 pl-6">Collect cash immediately</p>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddQuantityDialog(false);
                    setSelectedOrderForAdd(null);
                    setAdditionalQuantity("");
                    setPaymentLinkData(null);
                    setAdditionalAmount(0);
                  }}
                  disabled={isAddingQuantity}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitAddQuantity}
                  disabled={isAddingQuantity || !additionalQuantity || isNaN(parseInt(additionalQuantity)) || parseInt(additionalQuantity) <= 0}
                >
                  {isAddingQuantity ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Proceed"
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4 py-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Payment link generated! Show this to the customer to collect payment.
                  </AlertDescription>
                </Alert>
                {paymentLinkData.qr_code && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                      <img
                        src={paymentLinkData.qr_code}
                        alt="Payment QR Code"
                        className="w-48 h-48"
                      />
                    </div>
                    <div className="text-sm text-gray-600 text-center space-y-1">
                      <p className="font-medium">Payment Amount: ₹{Math.round(additionalAmount)}</p>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <p>Subtotal: ₹{additionalSubtotal.toFixed(2)}</p>
                        <p>GST (5%): ₹{additionalGst.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                )}
                {paymentLinkData.short_url && (
                  <div className="space-y-2">
                    <Label>Payment Link</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={paymentLinkData.short_url}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(paymentLinkData.short_url);
                          toast.success("Link copied!");
                        }}
                      >
                        <ClipboardList className="h-4 w-4" />
                      </Button>
                    </div>
                    <a
                      href={paymentLinkData.short_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1"
                    >
                      Open Link <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                <div className="bg-blue-50 p-3 rounded-lg flex items-center gap-2 text-sm text-blue-700 mt-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for payment confirmation...
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddQuantityDialog(false);
                    setSelectedOrderForAdd(null);
                    setAdditionalQuantity("");
                    setPaymentLinkData(null);
                    setAdditionalAmount(0);
                    setIsPollingPayment(false);
                  }}
                >
                  Cancel
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Not Delivered Dialog */}
      <Dialog open={showNotDeliveredDialog} onOpenChange={setShowNotDeliveredDialog}>
        <DialogContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Mark as Not Delivered</DialogTitle>
            <DialogDescription>Please provide a reason for not delivering this order.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={notDeliveredReason}
                onChange={(e) => setNotDeliveredReason(e.target.value)}
              >
                <option value="">Select a reason</option>
                {route?.notDeliveredReasons?.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNotDeliveredDialog(false)}
              disabled={!!isUpdating}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitNotDelivered} disabled={!!isUpdating}>
              {isUpdating === `${selectedOrder?.id}:NOT_DELIVERED` ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Submit"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Confirmation Dialog */}
      <Dialog 
        open={showCODConfirmDialog} 
        onOpenChange={(open) => {
          if (!open && isPollingPayment) return;
          setShowCODConfirmDialog(open);
          if (!open) {
            setOrderForCOD(null);
            setCodPaymentLinkData(null);
            setIsPollingPayment(false);
          }
        }}
      >
        <DialogContent 
          className="sm:max-w-md"
          showCloseButton={false}
          onInteractOutside={(e) => {
            if (isPollingPayment) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (isPollingPayment) e.preventDefault();
          }}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Confirm Cash Payment</DialogTitle>
            <DialogDescription>Collect payment for this order.</DialogDescription>
          </DialogHeader>

          {codPaymentLinkData ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(codPaymentLinkData.short_url)}`}
                  alt="Payment QR Code"
                  className="w-48 h-48"
                />
              </div>
              <div className="text-sm text-gray-600 text-center space-y-1">
                <p className="font-medium text-lg text-gray-900">₹{codPaymentLinkData.amount}</p>
                <p className="text-xs">Scan using PhonePe, GPay, Paytm, etc.</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg flex items-center gap-2 text-sm text-blue-700 mt-2 w-full justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Waiting for payment confirmation...
              </div>
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  setCodPaymentLinkData(null);
                  setIsPollingPayment(false);
                }}
              >
                Cancel QR Code
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 py-4">
              <Button
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                onClick={() => handleMarkAsPaid(orderForCOD)}
                disabled={!!isUpdating || isGeneratingQR}
              >
                {isUpdating === `${orderForCOD?.id}:PAID` ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <IndianRupee className="h-5 w-5 mr-2" />
                    Cash Collected
                  </>
                )}
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or pay online</span>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full h-12 border-blue-200 text-blue-700 hover:bg-blue-50 font-bold"
                onClick={handleGenerateQR}
                disabled={!!isUpdating || isGeneratingQR}
              >
                {isGeneratingQR ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Payment QR"
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Post-Payment Delivery Confirmation Dialog */}
      <Dialog 
        open={showDeliveryAfterPaidDialog} 
        onOpenChange={(open) => {
          if (!open) return; // Prevent closing
          setShowDeliveryAfterPaidDialog(open);
        }}
      >
        <DialogContent 
          className="sm:max-w-md"
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Confirm Delivery</DialogTitle>
            <DialogDescription>
              Payment for <strong>{pendingDeliveryOrder?.customer?.name}</strong> (Order #{pendingDeliveryOrder?.orderNumber || pendingDeliveryOrder?.id?.slice(-8).toUpperCase()}) has been collected. 
              Please confirm the delivery to proceed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Button
              className="w-full h-14 bg-green-600 hover:bg-green-700 text-white font-bold text-lg"
              onClick={() => handleConfirmDeliveryAfterPaid(true)}
            >
              <CheckCircle2 className="h-6 w-6 mr-3" />
              Yes, Delivered
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return Collection Confirmation Dialog */}
      <Dialog open={showReturnConfirmDialog} onOpenChange={setShowReturnConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Collection</DialogTitle>
            <DialogDescription>
              Are you sure you have collected <strong>{returnRequestToConfirm?.quantity} cans</strong> from{" "}
              <strong>{returnRequestToConfirm?.customer?.name}</strong>?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex gap-2 sm:justify-end mt-2">
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setShowReturnConfirmDialog(false);
                setReturnRequestToConfirm(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 sm:flex-none bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => handleConfirmReturn(returnRequestToConfirm?.id)}
              disabled={confirmingReturnId !== null}
            >
              {confirmingReturnId === returnRequestToConfirm?.id ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirming...
                </>
              ) : (
                "Yes, I have collected"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Call Dialog */}
      <Dialog open={phoneDialog.open} onOpenChange={(open) => setPhoneDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-[320px] rounded-3xl p-8 border-0 shadow-2xl">
          <DialogHeader className="space-y-4">
            <div className="mx-auto w-16 h-16 bg-green-50 rounded-full flex items-center justify-center text-green-600 border border-green-100">
              <Phone className="w-8 h-8" />
            </div>
            <div className="text-center">
              <DialogTitle className=" font-bold text-gray-900">Call {phoneDialog.name}</DialogTitle>
              <DialogDescription className="mt-4">
                <span className="text-xl font-bold text-gray-900 block mb-2">{phoneDialog.number}</span>
                <span className="text-xs text-gray-500 font-medium">Click below to start the call</span>
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="mt-3">
            <Button 
              className="w-full h-14 bg-green-600 hover:bg-green-700 text-white text-lg font-bold rounded-2xl  transition-all active:scale-95 flex items-center justify-center gap-3"
              onClick={() => {
                window.location.href = `tel:${phoneDialog.number}`;
                setPhoneDialog(prev => ({ ...prev, open: false }));
              }}
            >
              <Phone className="w-5 h-5 fill-current" />
              Call Now
            </Button>
            <Button
              variant="ghost"
              className="w-full mt-2 text-gray-400 font-medium"
              onClick={() => setPhoneDialog(prev => ({ ...prev, open: false }))}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Route Submission Confirmation Dialog */}
      <Dialog open={showSubmitConfirmDialog} onOpenChange={setShowSubmitConfirmDialog}>
        <DialogContent className="max-w-[340px] rounded-3xl p-6 border-0 shadow-2xl" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader className="space-y-4">
            <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 border border-blue-100">
              <ClipboardList className="w-8 h-8" />
            </div>
            <div className="text-center">
              <DialogTitle className="font-bold text-gray-900 text-lg">Confirm Submission</DialogTitle>
              <DialogDescription className="mt-3 text-sm text-gray-500">
                Are you sure you want to submit this route? 
                <span className="block mt-2 font-semibold text-red-600">
                  ⚠️ This will lock all order updates permanently.
                </span>
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="mt-6 flex flex-col gap-2">
            <Button 
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
              onClick={() => {
                setShowSubmitConfirmDialog(false);
                handleSubmitRoute();
              }}
              disabled={isSubmittingRoute}
            >
              {isSubmittingRoute ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, Submit Route"}
            </Button>
            <Button
              variant="ghost"
              className="w-full h-12 text-gray-400 font-medium rounded-2xl"
              onClick={() => setShowSubmitConfirmDialog(false)}
              disabled={isSubmittingRoute}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pending Orders Alert Dialog */}
      <Dialog open={showPendingAlertDialog} onOpenChange={setShowPendingAlertDialog}>
        <DialogContent className="max-w-[360px] rounded-3xl p-6 border-0 shadow-2xl animate-in fade-in zoom-in-95 duration-200" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader className="space-y-3">
            <div className="text-center pt-2">
              <DialogTitle className="font-bold text-gray-900 text-lg flex items-center justify-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                Pending Orders Remaining
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm text-gray-500">
                You have {pendingOrdersToDisplay.length} pending orders. You must mark all orders as Delivered or Not Delivered before submitting.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="max-h-[220px] overflow-y-auto space-y-2 mt-4 pr-1 scrollbar-thin">
            {pendingOrdersToDisplay.map((order) => {
              const originalIndex = route.orders.findIndex((o) => o.id === order.id);
              return (
                <div key={order.id} className="flex items-start gap-2.5 p-2.5 bg-red-50/50 rounded-2xl border border-red-100">
                  <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    {originalIndex !== -1 ? originalIndex + 1 : 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm text-gray-900 truncate">
                      {order.customer?.name}
                    </h4>
                    <p className="text-[11px] text-gray-500 truncate">
                      #{order.orderNumber || order.id.slice(-8).toUpperCase()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5">
            <Button 
              className="w-full h-12 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-2xl transition-all active:scale-95 flex items-center justify-center"
              onClick={() => setShowPendingAlertDialog(false)}
            >
              Okay
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
