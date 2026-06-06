import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "SABOLS - Watercan Ordering System",
  description: "SABOLS Watercan ordering system",
  icons: {
    icon: '/shop/icon.jpg',
    apple: '/shop/icon.jpg',
  },
};

import { Toaster } from 'react-hot-toast';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/shop/manifest.json" />
        <meta name="theme-color" content="#3b82f6" />
        <script
          src="https://checkout.razorpay.com/v1/checkout.js"
          async
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
