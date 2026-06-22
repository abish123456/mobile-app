'use client';

import { useState } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Phone, Send, Loader2 } from 'lucide-react';

const COUNTRY_CODE = '+91';
const MAX_LENGTH = 10;
const PATTERN = /^[6-9]\d{9}$/;

export default function PhoneInput({ onPhoneSubmit, isSending = false }) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    // Remove any spaces or special characters
    const cleanPhone = phone.replace(/\D/g, '');

    if (!cleanPhone) {
      setError('Please enter your phone number');
      return;
    }

    if (cleanPhone.length < MAX_LENGTH) {
      setError(`Phone number must be ${MAX_LENGTH} digits`);
      return;
    }

    if (cleanPhone.length > MAX_LENGTH) {
      setError(`Phone number must not exceed ${MAX_LENGTH} digits`);
      return;
    }

    if (!PATTERN.test(cleanPhone)) {
      setError('Please enter a valid 10-digit Indian mobile number');
      return;
    }

    // Call the parent component's handler with full phone number including country code
    onPhoneSubmit(COUNTRY_CODE + cleanPhone, COUNTRY_CODE);
  };

  const handleChange = (e) => {
    const value = e.target.value;
    // Only allow digits
    const digitsOnly = value.replace(/\D/g, '');
    // Limit to max length
    if (digitsOnly.length <= MAX_LENGTH) {
      setPhone(digitsOnly);
      setError('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-4">
      <div className="space-y-2">
        {/* <label htmlFor="phone" className="text-sm font-medium leading-none">
          Phone Number
        </label> */}
        <div className="flex items-center gap-2 pb-4">
          <div className="h-9 px-3 flex items-center rounded-md border border-input bg-muted/40 text-sm text-foreground">
            {COUNTRY_CODE}
          </div>
          <div className="flex-1">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="tel"
                id="phone"
                placeholder="Enter your 10-digit mobile number"
                value={phone}
                onChange={handleChange}
                maxLength={MAX_LENGTH}
                disabled={isSending}
                autoComplete="tel"
                autoFocus
                className={error ? 'border-destructive pl-9' : 'pl-9'}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive mt-1">{error}</p>
            )}
          </div>
        </div>
        {/* <p className="text-xs text-muted-foreground">
          We'll send you an OTP to verify your number
        </p> */}
      </div>
      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={isSending || phone.length < MAX_LENGTH}

      >
        {isSending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending OTP...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Send OTP
          </>
        )}
      </Button>
    </form>
  );
}