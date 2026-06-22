import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Wallet, Info, CheckCircle2, Calendar, Pencil, Check, X } from 'lucide-react';
import DeliverySlotSelector from './DeliverySlotSelector';
import { format } from 'date-fns';

export function calculateTotal(cart) {
  if (!cart || !Array.isArray(cart)) return 0;
  return cart.reduce((sum, item) => {
    if (item.isAvailable !== false && item.price) {
      return sum + (item.price * item.quantity);
    }
    return sum;
  }, 0);
}

export default function OrderSummary({ cart, slot, onSlotChange, slotError, paymentType, subtotal: propSubtotal, gst: propGst, depositInfo }) {
  const [isEditingDate, setIsEditingDate] = useState(false);
  const itemTotal = propSubtotal ?? calculateTotal(cart || []);
  const totalQuantity = cart?.reduce((sum, item) => {
    if (item.isAvailable !== false) {
      return sum + item.quantity;
    }
    return sum;
  }, 0) || 0;

  const gst = propGst ?? (itemTotal * 0.05);
  const netDeposit = depositInfo?.toPay || 0;
  const grandTotal = itemTotal + gst + netDeposit;

  const getFormattedDate = (dateStr) => {
    if (!dateStr) return '-';
    // For Today/Tomorrow strings if they exist, but order page uses YYYY-MM-DD
    if (dateStr === 'TODAY') return 'Today';
    if (dateStr === 'TOMORROW') return 'Tomorrow';

    try {
      const date = new Date(dateStr + 'T00:00:00');
      return format(date, 'dd/MM/yyyy');
    } catch {
      return dateStr;
    }
  };

  const paymentLabel =
    paymentType === 'ONLINE'
      ? 'Pay Online'
      : paymentType === 'COD'
        ? 'Cash on Delivery'
        : '-';

  return (
    <Card className="border-primary/20 shadow-colorful overflow-hidden">
      <CardHeader className="p-4 sm:p-6 pb-2">
        <CardTitle className="text-base sm:text-lg font-bold">Order Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6 pt-0">
        <div className="space-y-2">
          {cart?.map((item) => (
            <div key={item.id} className="flex justify-between text-xs sm:text-sm">
              <span className="text-muted-foreground truncate pr-2">
                {item.name} × {item.quantity}
              </span>
              <span className="font-medium flex-shrink-0 text-black">₹{(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-primary/20 pt-4 space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-semibold text-black">₹{itemTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">GST (5%)</span>
            <span className="font-semibold text-black">₹{gst.toFixed(2)}</span>
          </div>




          {(depositInfo?.toPay > 0 || depositInfo?.walletCredit > 0) && (
            <div className="pt-2 border-t border-dashed space-y-2">
              {depositInfo.toPay > 0 && (
                <div className="flex justify-between text-sm font-semibold">
                  <div className="flex flex-col">
                    <span className="text-black">New Can Charges</span>
                    {depositInfo.walletUsed > 0 && (
                      <span className="text-[10px] text-blue-600 font-normal italic">
                        (₹{depositInfo.walletUsed.toFixed(2)} used from wallet)
                      </span>
                    )}
                  </div>
                  <span className="text-black">₹{depositInfo.toPay.toFixed(2)}</span>
                </div>
              )}

              {depositInfo.toPay === 0 && depositInfo.walletCredit >= 0 && (
                <div className="flex flex-col gap-1 p-2 bg-blue-50 rounded-md border border-blue-100">
                  <div className="flex justify-between text-xs text-blue-700 font-bold">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {depositInfo.walletCredit > 0 ? "Deposit Surplus Available" : "Deposit Covered by Wallet"}
                    </span>
                    {depositInfo.walletCredit > 0 && <span>₹{depositInfo.walletCredit.toFixed(2)}</span>}
                  </div>
                  <p className="text-[10px] text-blue-600">
                    {depositInfo.walletCredit > 0
                      ? "You have a surplus from extra returns. No deposit needed for this order."
                      : "Your existing deposit balance covers this order."}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="border-t pt-3 flex justify-between items-baseline pb-2">
            <span className="text-base font-bold">Total Amount</span>
            <span className="text-xl font-black text-black">₹{Math.round(grandTotal)}</span>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">Delivery Date:</span>
                <span className="text-sm font-bold text-primary">{getFormattedDate(slot)}</span>
              </div>
              <DeliverySlotSelector
                value={slot}
                onChange={onSlotChange}
                error={slotError}
                trigger={
                  <button
                    className="text-primary text-xs font-semibold hover:underline flex items-center gap-1"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                }
              />
            </div>
            {slotError && (
              <p className="text-xs text-destructive font-medium px-1 animate-in fade-in slide-in-from-top-1">
                {slotError}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


