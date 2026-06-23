'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import PhoneInput from '../../../components/app/PhoneInput';
import { CheckCircle2, Loader2, ArrowLeft, AlertCircle } from 'lucide-react';
import Image from 'next/image';
import PaymentPolicy from '../../../components/app/PaymentPolicy';

export default function LoginPage() {
  const router = useRouter();
  const [isSendingOTP, setIsSendingOTP] = useState(false);
  const [isVerifyingOTP, setIsVerifyingOTP] = useState(false);
  const [error, setError] = useState('');
  const [phoneSent, setPhoneSent] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [reqId, setReqId] = useState('');
  const COUNTRY_CODE = '+91';

  const handlePhoneSubmit = async (phone, code) => {
    setIsSendingOTP(true);
    setError('');
    setPhoneNumber(phone);

    try {
      // TODO: Replace with actual API endpoint from Abish
      const response = await fetch('/shop/api/auth/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (response.ok) {
        // OTP sent successfully, show OTP input screen
        setReqId(data.reqId);
        setPhoneSent(true);
      } else {
        setError(data.message || 'Failed to send OTP. Please try again.');
      }
    } catch (err) {
      console.error('Error sending OTP:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsSendingOTP(false);
    }
  };

  const handleOTPSubmit = async (otp, force = false, preAuthToken = null) => {
    setIsVerifyingOTP(true);
    setError('');

    try {
      const response = await fetch('/shop/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneNumber, otp, reqId, force, ...(preAuthToken ? { preAuthToken } : {}) }),
      });

      const data = await response.json();

      if (response.status === 409 && data.errorType === 'EXISTING_SESSION') {
        setIsVerifyingOTP(false);
        const receivedPreAuthToken = data.preAuthToken;
        const confirmed = window.confirm(
          'You are already logged in on another device. Do you want to log in here and log out from there?'
        );
        if (confirmed) {
          handleOTPSubmit(otp, true, receivedPreAuthToken);
        }
        return;
      }

      if (response.ok) {
        localStorage.setItem('isLoggedIn', 'true');

        const previousPhone = localStorage.getItem('userPhone');
        const lastUserPhone = localStorage.getItem('lastUserPhone');

        const isDifferentUser = previousPhone && previousPhone !== phoneNumber;
        const wasDifferentUserLastTime = lastUserPhone && lastUserPhone !== phoneNumber;

        if (data.isNewUser || isDifferentUser || wasDifferentUserLastTime) {
          localStorage.removeItem('cart');
          window.dispatchEvent(new Event('cartUpdated'));
        }

        localStorage.setItem('userPhone', phoneNumber);
        localStorage.setItem('lastUserPhone', phoneNumber);

        if (data.isNewUser) {
          localStorage.setItem('isNewUserFlow', 'true');
          window.dispatchEvent(new Event('newUserFlowChanged'));
          router.push('/app/profile?new=true');
        } else {
          localStorage.removeItem('isNewUserFlow');
          window.dispatchEvent(new Event('newUserFlowChanged'));
          router.push('/app/items');
        }
      } else {
        setError(data.message || 'Invalid OTP. Please try again.');
      }
    } catch (err) {
      console.error('Error verifying OTP:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsVerifyingOTP(false);
    }
  };

  const handleResendOTP = async () => {
    setIsSendingOTP(true);
    setError('');

    try {
      const response = await fetch('/shop/api/auth/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: phoneNumber }),
      });

      const data = await response.json();

      if (response.ok) {
        // OTP resent successfully - stay on OTP screen
        setReqId(data.reqId);
        setError('');
        return { success: true };
      } else {
        setError(data.message || 'Failed to resend OTP. Please try again.');
        return { success: false, retryAfter: data.retryAfter };
      }
    } catch (err) {
      console.error('Error resending OTP:', err);
      setError('Network error. Please check your connection and try again.');
      return { success: false };
    } finally {
      setIsSendingOTP(false);
    }
  };

  useEffect(() => {
    // Only disable scrolling if absolutely necessary, but here we want to see the footer
    // document.body.style.overflow = 'hidden';
    // document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center p-5 sm:p-6 bg-muted/50 min-h-[80vh]">
      <div className="w-full max-w-md">
        <Card className="border-primary/20 shadow-colorful hover-lift overflow-hidden">
          <CardHeader className="text-center space-y-2 sm:space-y-4 rounded-t-lg ">
            <div className="flex justify-center pt-3">
              <div className=" bg-white  shadow-lg">
                <Image
                  src="/shop/Sobals logo.jpg"
                  alt="SABOLS logo"
                  width={100}
                  height={100}
                  className=" object-cover"
                  priority
                />
              </div>
            </div>
            <div>
              <CardTitle className="text-3xl font-bold text-black">SABOLS</CardTitle>
              <CardDescription className="text-base font-medium">Watercan Ordering System</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 overflow-hidden">
            {/* Error Alert */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm border border-destructive/20">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}

            {/* Phone Input Screen */}
            {!phoneSent ? (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-1">Login with Phone number</h3>
                  {/* <p className="text-sm text-muted-foreground">
                    Enter your phone number to receive an OTP for verification
                  </p> */}
                </div>
                <PhoneInput onPhoneSubmit={handlePhoneSubmit} isSending={isSendingOTP} />
              </>
            ) : (
              /* OTP Input Screen */
              <OTPInput
                phoneNumber={phoneNumber}
                countryCode={COUNTRY_CODE}
                onOTPSubmit={handleOTPSubmit}
                onResend={handleResendOTP}
                onChangeNumber={() => {
                  setPhoneSent(false);
                  setError('');
                }}
                isVerifying={isVerifyingOTP}
                isSending={isSendingOTP}
              />
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-2 sm:mt-4">
          By continuing, you agree to our <PaymentPolicy />
        </p>
      </div>
    </div>
  );
}

// OTP Input Component
function OTPInput({ phoneNumber, countryCode, onOTPSubmit, onResend, onChangeNumber, isVerifying, isSending }) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(30); // Start with 30s for the first retry
  const [canResend, setCanResend] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let timer;
    if (cooldown > 0 && !canResend) {
      timer = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    } else if (cooldown === 0) {
      setCanResend(true);
    }
    return () => clearInterval(timer);
  }, [cooldown, canResend]);

  const handleResendClick = async () => {
    if (!canResend || isSending || isVerifying) return;

    setCanResend(false);
    setOtp(['', '', '', '', '', '']);
    setError('');

    const result = await onResend();

    if (result?.success) {
      // Logic for next cooldown: 
      // After first resend (retryCount 0 -> 1), next cooldown is 60s
      setRetryCount(prev => prev + 1);
      setCooldown(60);
    } else if (result?.retryAfter) {
      // Sync with backend if it returned a retryAfter value
      setCooldown(result.retryAfter);
    } else {
      // Default to 60s on error if no retryAfter
      setCooldown(60);
    }
  };

  const handleChange = (index, value) => {
    // Handle multi-digit input (autofill or paste-like behavior)
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('');
      if (digits.length === 6) {
        setOtp(digits);
        handleSubmit(digits.join(''));
        return;
      }
    }

    // Only allow single digits for normal typing
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      if (nextInput) nextInput.focus();
    }

    // Auto-submit when all 6 digits are entered
    if (newOtp.every(digit => digit !== '') && newOtp.length === 6) {
      handleSubmit(newOtp.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    const digits = pastedData.replace(/\D/g, '').slice(0, 6).split('');

    if (digits.length === 6) {
      const newOtp = [...otp];
      digits.forEach((digit, index) => {
        newOtp[index] = digit;
      });
      setOtp(newOtp);
      handleSubmit(digits.join(''));
    }
  };

  const handleSubmit = (otpValue) => {
    if (otpValue.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    onOTPSubmit(otpValue);
  };

  return (
    <div className="space-y-4 ">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">Enter OTP</h3>
        <p className="text-sm text-muted-foreground">
          We've sent a 6-digit code to
          <br />
          <span className="font-medium text-foreground">{phoneNumber}</span>
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(otp.join(''));
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <div className="flex justify-center gap-2">
            {otp.map((digit, index) => (
              <Input
                key={index}
                id={`otp-${index}`}
                type="text"
                className="w-12 h-12 text-center text-lg font-semibold"
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={index === 0 ? handlePaste : undefined}
                maxLength={6}
                disabled={isVerifying}
                autoComplete={index === 0 ? "one-time-code" : "off"}
                autoFocus={index === 0}
                inputMode="numeric"
              />
            ))}
          </div>
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={isVerifying || otp.some(digit => !digit)}
        >
          {isVerifying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Verify OTP
            </>
          )}
        </Button>
      </form>

      <div className="text-center space-y-3">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Didn't receive the code?
          </p>
          <Button
            type="button"
            variant="ghost"
            onClick={handleResendClick}
            disabled={!canResend || isSending || isVerifying}
            className="text-sm"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Sending...
              </>
            ) : !canResend ? (
              <>
                Resend OTP in {cooldown}s
              </>
            ) : (
              <>
                Resend OTP
              </>
            )}
          </Button>
        </div>

        <div className="border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onChangeNumber}
            disabled={isVerifying || isSending}
            className="text-sm text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Change Phone Number
          </Button>
        </div>
      </div>
    </div>
  );
}