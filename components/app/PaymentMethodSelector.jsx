'use client';

import { useEffect, useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardHeader, CardTitle } from '../ui/card';
import { CreditCard, Smartphone } from 'lucide-react';

/**
 * Shared payment method selector.
 * - On profile page: readOnly=false → user can add/edit UPI ID or card number.
 * - On order page:  readOnly=true  → user only chooses which saved method to use.
 */
export default function PaymentMethodSelector({
  paymentMethod,
  onPaymentMethodChange,
  errors = {},
  readOnly = false,
}) {
  const paymentMethods = [
    { id: 'upi', label: 'UPI / GPay', icon: Smartphone },
    { id: 'card', label: 'Credit/Debit Card', icon: CreditCard },
  ];

  // Keep per-method details locally so switching options doesn't lose text
  const [detailsByType, setDetailsByType] = useState({});

  // Initialize local map when we get a value from parent (e.g. from profile API)
  useEffect(() => {
    if (paymentMethod?.type && paymentMethod?.details) {
      setDetailsByType((prev) => ({
        ...prev,
        [paymentMethod.type]: paymentMethod.details,
      }));
    }
  }, [paymentMethod?.type, paymentMethod?.details]);

  const handleSelectMethod = (methodId) => {
    if (readOnly) return;
    const existingDetails = detailsByType[methodId] || '';
    onPaymentMethodChange({
      type: methodId,
      details: existingDetails,
    });
  };

  const handleDetailsChange = (value) => {
    if (readOnly || !paymentMethod?.type) return;
    setDetailsByType((prev) => ({
      ...prev,
      [paymentMethod.type]: value,
    }));
    onPaymentMethodChange({
      ...paymentMethod,
      details: value,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>
          Payment Method <span className="text-destructive">*</span>
        </Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          {paymentMethods.map((method) => {
            const Icon = method.icon;
            const isSelected = paymentMethod.type === method.id;

            return (
              <Card
                key={method.id}
                className={`cursor-pointer transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${readOnly ? 'opacity-90' : ''}`}
                onClick={() => handleSelectMethod(method.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    <CardTitle className="text-sm">{method.label}</CardTitle>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
        {errors.paymentMethod && (
          <p className="text-sm text-destructive mt-1">{errors.paymentMethod}</p>
        )}
      </div>

      {paymentMethod.type && (
        <div className="space-y-2">
          <Label htmlFor="paymentDetails">
            {paymentMethod.type === 'upi' ? 'UPI ID' : 'Card Details'}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="paymentDetails"
            placeholder={
              paymentMethod.type === 'upi'
                ? 'Enter UPI ID (e.g., yourname@paytm)'
                : 'Enter card number'
            }
            value={paymentMethod.details || ''}
            onChange={(e) => handleDetailsChange(e.target.value)}
            disabled={readOnly}
            className={`${errors.paymentDetails ? 'border-destructive' : ''} ${
              readOnly ? 'bg-muted cursor-not-allowed' : ''
            }`}
          />
          {errors.paymentDetails && (
            <p className="text-sm text-destructive">{errors.paymentDetails}</p>
          )}
          {paymentMethod.type === 'upi' && (
            <p className="text-xs text-muted-foreground">
              Enter your UPI ID (e.g., yourname@paytm, yourname@ybl, yourname@phonepe)
            </p>
          )}
        </div>
      )}
    </div>
  );
}


