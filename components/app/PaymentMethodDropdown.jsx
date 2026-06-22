'use client';

import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { CreditCard, Smartphone } from 'lucide-react';

/**
 * Dropdown to select from saved payment methods
 * Used on the Order page to choose which saved method to use
 */
export default function PaymentMethodDropdown({
  paymentMethods = { upi: [], card: [] },
  selectedType, // 'upi', 'card', or 'netbanking'
  selectedId, // ID of selected payment method
  onSelect,
  errors = {},
}) {
  const methods = selectedType === 'upi' ? paymentMethods.upi : (selectedType === 'card' ? paymentMethods.card : []);

  return (
    <div className="space-y-2">
      <Label>
        {selectedType === 'upi' ? 'Select UPI ID' : (selectedType === 'card' ? 'Select Card' : 'Select Bank')}
        <span className="text-destructive">*</span>
      </Label>
      <Select
        value={selectedId || (methods.length === 0 ? 'new' : '')}
        onValueChange={(value) => {
          if (value === 'new') {
            onSelect({
              id: 'new',
              type: selectedType,
              details: '',
              isNew: true,
            });
            return;
          }
          const method = methods.find((m) => m.id === value);
          if (method) {
            onSelect({
              id: method.id,
              type: selectedType,
              details: method.details,
              razorpayTokenId: method.razorpayTokenId, // Include token for quick payments
              cardLast4: method.cardLast4,
              cardBrand: method.cardBrand,
            });
          }
        }}
      >
        <SelectTrigger className={errors.paymentMethod ? 'border-destructive' : ''}>
          <SelectValue placeholder={`Choose a ${selectedType === 'upi' ? 'UPI ID' : (selectedType === 'card' ? 'card' : 'bank')}`} />
        </SelectTrigger>
        <SelectContent>
          {methods.map((method) => {
            const hasToken = method.razorpayTokenId && selectedType === 'card';
            // For cards, show cardLast4 if available, otherwise show details
            const displayText = selectedType === 'card' && method.cardLast4
              ? `**** **** **** ${method.cardLast4}${method.cardBrand ? ` (${method.cardBrand})` : ''}`
              : method.details;
            return (
              <SelectItem key={method.id} value={method.id}>
                {displayText}
                {method.isDefault ? ' (Default)' : ''}
                {hasToken ? ' ⚡ Quick Pay' : ''}
              </SelectItem>
            );
          })}
          <SelectItem value="new">
            <span className="font-medium text-primary">
              {selectedType === 'netbanking' ? 'Pay via Net Banking' : `Add ${selectedType === 'upi' ? 'UPI ID/Number' : 'Card'}`}
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      {errors.paymentMethod && (
        <p className="text-sm text-destructive">{errors.paymentMethod}</p>
      )}
    </div>
  );
}

