'use client';

import { useState } from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { CreditCard, Smartphone, Plus, Trash2, Check, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

/**
 * Component for managing multiple payment methods (UPI IDs and Cards)
 * Used on the Profile page to add/remove payment methods
 */
export default function PaymentMethodsManager({
  paymentMethods = { upi: [], card: [] },
  onChange,
  errors = {},
}) {
  const [newUpi, setNewUpi] = useState('');
  const [newCard, setNewCard] = useState('');
  const [newCardExpMonth, setNewCardExpMonth] = useState('');
  const [newCardExpYear, setNewCardExpYear] = useState('');
  const [newCardCvc, setNewCardCvc] = useState('');
  const [showAddUpi, setShowAddUpi] = useState(false);
  const [showAddCard, setShowAddCard] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState('');

  // Delete confirmation state
  const [deleteConfirmation, setDeleteConfirmation] = useState({
    isOpen: false,
    id: null,
    type: null,
  });

  const handleAddUpi = async () => {
    if (!newUpi.trim()) return;

    setVerifying(true);
    setVerificationError('');

    try {
      const response = await fetch('/shop/api/payments/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'upi',
          details: newUpi.trim(),
        }),
      });

      const data = await response.json();

      if (!data.success || !data.valid) {
        setVerificationError(data.message || 'Invalid UPI ID');
        setVerifying(false);
        return;
      }

      // UPI format check passed (but not fully verified - requires test payment)
      onChange({
        action: 'add',
        type: 'upi',
        details: newUpi.trim(),
        isDefault: paymentMethods.upi.length === 0,
        verified: false, // UPI can't be fully verified without test payment
      });

      setNewUpi('');
      setShowAddUpi(false);
      setVerificationError('');
    } catch (err) {
      console.error('Error verifying UPI:', err);
      setVerificationError('Failed to verify UPI ID. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleAddCard = async () => {
    if (!newCard.trim()) return;

    // If expiry and CVC are provided, verify with Stripe
    if (newCardExpMonth && newCardExpYear && newCardCvc) {
      setVerifying(true);
      setVerificationError('');

      try {
        const response = await fetch('/shop/api/payments/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'card',
            details: newCard.trim(),
            expMonth: parseInt(newCardExpMonth, 10),
            expYear: parseInt(newCardExpYear, 10),
            cvc: newCardCvc.trim(),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Network error' }));
          setVerificationError(errorData.message || `Server error (${response.status})`);
          setVerifying(false);
          return;
        }

        const data = await response.json();

        if (!data.success || !data.valid) {
          setVerificationError(data.message || 'Card verification failed');
          setVerifying(false);
          return;
        }

        // Card validated (format check passed, full verification will happen during payment)
        if (data.verified) {
          // Show success toast for fully verified cards
          // You can add a toast here if needed
        } else {
          // Show info message for format-validated cards
          // Card will be fully verified when used for payment
        }

        onChange({
          action: 'add',
          type: 'card',
          details: data.last4 ? `**** **** **** ${data.last4}` : newCard.trim(),
          isDefault: paymentMethods.card.length === 0,
          verified: data.verified || false,
          stripePaymentMethodId: data.stripePaymentMethodId,
          cardBrand: data.brand,
          cardLast4: data.last4,
        });

        setNewCard('');
        setNewCardExpMonth('');
        setNewCardExpYear('');
        setNewCardCvc('');
        setShowAddCard(false);
        setVerificationError('');
      } catch (err) {
        console.error('Error verifying card:', err);
        setVerificationError('Failed to verify card. Please try again.');
      } finally {
        setVerifying(false);
      }
    } else {
      // Only card number provided - add without full verification
      onChange({
        action: 'add',
        type: 'card',
        details: newCard.trim(),
        isDefault: paymentMethods.card.length === 0,
        verified: false,
      });

      setNewCard('');
      setNewCardExpMonth('');
      setNewCardExpYear('');
      setNewCardCvc('');
      setShowAddCard(false);
    }
  };

  const handleRemove = (id, type) => {
    setDeleteConfirmation({
      isOpen: true,
      id,
      type,
    });
  };

  const confirmDelete = () => {
    const { id, type } = deleteConfirmation;
    if (id && type) {
      onChange({
        action: 'remove',
        id,
        type,
      });
    }
    setDeleteConfirmation({ isOpen: false, id: null, type: null });
  };

  const handleSetDefault = (id, type) => {
    onChange({
      action: 'update',
      id,
      type,
      details: paymentMethods[type].find(pm => pm.id === id)?.details || '',
      isDefault: true,
    });
  };

  return (
    <div className="space-y-6">
      {/* UPI Methods */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <Label className="text-base font-semibold">UPI IDs</Label>
          </div>
          {/* {!showAddUpi && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddUpi(true)}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add UPI
            </Button>
          )} */}
        </div>

        {showAddUpi && (
          <Card className="border-primary/50">
            <CardContent className="pt-4 space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter UPI ID (e.g., yourname@paytm)"
                  value={newUpi}
                  onChange={(e) => {
                    setNewUpi(e.target.value);
                    setVerificationError('');
                  }}
                  className="flex-1"
                  disabled={verifying}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddUpi}
                  disabled={!newUpi.trim() || verifying}
                >
                  {verifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Verify & Add'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowAddUpi(false);
                    setNewUpi('');
                    setVerificationError('');
                  }}
                  disabled={verifying}
                >
                  Cancel
                </Button>
              </div>
              {verificationError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{verificationError}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                UPI ID will be verified for correct format. Full verification requires a test payment.
              </p>
            </CardContent>
          </Card>
        )}

        {paymentMethods.upi.length === 0 && !showAddUpi && (
          <p className="text-sm text-muted-foreground">No UPI IDs added yet</p>
        )}

        {paymentMethods.upi.map((pm) => (
          <Card key={pm.id} className={pm.isDefault ? 'border-primary bg-primary/5' : ''}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{pm.details}</span>
                    {pm.verified === true && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </span>
                    )}
                    {pm.verified === false && pm.type === 'upi' && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        Format Valid
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(pm.id, 'upi')}
                    className="text-destructive hover:text-black"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Card Methods */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <Label className="text-base font-semibold">Card Details</Label>
          </div>
          {/* {!showAddCard && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddCard(true)}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Card
            </Button>
          )} */}
        </div>

        {showAddCard && (
          <Card className="border-primary/50">
            <CardContent className="pt-4 space-y-3">
              <div className="space-y-2">
                <Input
                  placeholder="Card number (e.g., 4242 4242 4242 4242)"
                  value={newCard}
                  onChange={(e) => {
                    // Format card number with spaces
                    let value = e.target.value.replace(/\s/g, '');
                    if (value.length > 0) {
                      value = value.match(/.{1,4}/g)?.join(' ') || value;
                    }
                    setNewCard(value);
                    setVerificationError('');
                  }}
                  maxLength={19}
                  disabled={verifying}
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Expiry Month</Label>
                    <Input
                      placeholder="MM"
                      value={newCardExpMonth}
                      onChange={(e) => {
                        let value = e.target.value.replace(/\D/g, '');
                        if (value.length > 2) value = value.slice(0, 2);
                        if (value && parseInt(value, 10) > 12) value = '12';
                        setNewCardExpMonth(value);
                        setVerificationError('');
                      }}
                      maxLength={2}
                      disabled={verifying}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Expiry Year</Label>
                    <Input
                      placeholder="YYYY"
                      value={newCardExpYear}
                      onChange={(e) => {
                        let value = e.target.value.replace(/\D/g, '');
                        if (value.length > 4) value = value.slice(0, 4);
                        setNewCardExpYear(value);
                        setVerificationError('');
                      }}
                      maxLength={4}
                      disabled={verifying}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">CVC</Label>
                    <Input
                      placeholder="CVC"
                      type="password"
                      value={newCardCvc}
                      onChange={(e) => {
                        let value = e.target.value.replace(/\D/g, '');
                        if (value.length > 4) value = value.slice(0, 4);
                        setNewCardCvc(value);
                        setVerificationError('');
                      }}
                      maxLength={4}
                      disabled={verifying}
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddCard}
                  disabled={!newCard.trim() || verifying}
                  className="flex-1"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Verifying...
                    </>
                  ) : newCardExpMonth && newCardExpYear && newCardCvc ? (
                    'Verify & Add'
                  ) : (
                    'Add'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowAddCard(false);
                    setNewCard('');
                    setNewCardExpMonth('');
                    setNewCardExpYear('');
                    setNewCardCvc('');
                    setVerificationError('');
                  }}
                  disabled={verifying}
                >
                  Cancel
                </Button>
              </div>
              {verificationError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{verificationError}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {newCardExpMonth && newCardExpYear && newCardCvc
                  ? 'Card will be verified with Stripe for full validation.'
                  : 'Add expiry and CVC for full card verification, or add card number only for format validation.'}
              </p>
            </CardContent>
          </Card>
        )}

        {paymentMethods.card.length === 0 && !showAddCard && (
          <p className="text-sm text-muted-foreground">No cards added yet</p>
        )}

        {paymentMethods.card.map((pm) => (
          <Card key={pm.id} className={pm.isDefault ? 'border-primary bg-primary/5' : ''}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {pm.cardLast4 ? `**** **** **** ${pm.cardLast4}` : pm.details}
                    </span>
                    {pm.cardBrand && (
                      <span className="text-xs text-muted-foreground capitalize">
                        {pm.cardBrand}
                      </span>
                    )}
                    {pm.verified === true && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </span>
                    )}
                    {pm.verified === false && pm.type === 'card' && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        Format Valid
                      </span>
                    )}
                    {pm.verified === false && pm.type === 'upi' && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        Format Valid
                      </span>
                    )}
                    {pm.razorpayTokenId && pm.type === 'card' && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Saved for Quick Pay
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(pm.id, 'card')}
                    className="text-destructive hover:text-black"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog
        open={deleteConfirmation.isOpen}
        onOpenChange={(isOpen) => !isOpen && setDeleteConfirmation(prev => ({ ...prev, isOpen: false }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this payment method. You cannot undo this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

