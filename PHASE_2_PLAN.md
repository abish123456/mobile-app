# Phase 2: Admin Dashboard & Route Links - Implementation Plan

## ✅ What's Completed (Phase 0 & Phase 1)

- ✅ Project setup (Next.js, Tailwind, Prisma, PostgreSQL)
- ✅ Database schema (all models ready)
- ✅ Customer PWA (/app):
  - ✅ OTP Login
  - ✅ Profile/Address management
  - ✅ Items selection & cart
  - ✅ Order placement
  - ✅ Payment method management
  - ✅ My Orders page
- ✅ Deployed to Vercel
- ✅ Twilio OTP integration

## 🎯 Phase 2 Goals

Build Admin Dashboard and Route Management System so office staff can:
1. View and filter orders
2. Create routes and assign delivery boys
3. Generate route links for delivery
4. View delivery reports

---

## 📋 Phase 2 Tasks Breakdown

### Task 1: Admin Authentication
**Owner:** Abish  
**Priority:** High  
**Estimated Time:** 2-3 hours

#### Subtasks:
1. Create `/admin/login` page
   - Simple email/password or phone+OTP login
   - Store admin session (localStorage or cookies)
   
2. Create admin session middleware
   - Protect `/admin/*` routes
   - Redirect to login if not authenticated

3. Create basic admin user (hardcoded for MVP)
   - Email: `admin@watercan.com`
   - Password: (set in env or hardcode for MVP)

**Files to create:**
- `app/admin/login/page.js`
- `app/admin/layout.js` (with auth check)
- `lib/admin-auth.js` (helper functions)

---

### Task 2: Orders List Page
**Owner:** Abish  
**Support:** Ashika  
**Priority:** High  
**Estimated Time:** 4-5 hours

#### Subtasks:
1. Create `/admin/orders` page
   - Table showing: Order ID, Customer Name, Phone, Address, Quantity, Payment Status, Delivery Status, Date
   - Pagination (50 orders per page)

2. Add filters:
   - Date picker (default: today)
   - Area/Zone dropdown
   - Payment status filter (All, Paid, COD, Pending)
   - Delivery status filter (All, Pending, Delivered, etc.)

3. API endpoint: `GET /api/admin/orders`
   - Accept query params: `date`, `area`, `paymentStatus`, `deliveryStatus`
   - Return filtered orders with customer & address details

**Files to create:**
- `app/admin/orders/page.js`
- `app/api/admin/orders/route.ts`

---

### Task 3: Delivery Boy Management
**Owner:** Abish  
**Support:** Ashika  
**Priority:** Medium  
**Estimated Time:** 3-4 hours

#### Subtasks:
1. Create `/admin/delivery-boys` page
   - List all delivery boys
   - Add new delivery boy form (Name, Phone)
   - Edit/Delete delivery boys
   - Toggle active/inactive status

2. API endpoints:
   - `GET /api/admin/delivery-boys` - List all
   - `POST /api/admin/delivery-boys` - Create new
   - `PUT /api/admin/delivery-boys/[id]` - Update
   - `DELETE /api/admin/delivery-boys/[id]` - Delete (soft delete)

**Files to create:**
- `app/admin/delivery-boys/page.js`
- `app/api/admin/delivery-boys/route.ts`
- `app/api/admin/delivery-boys/[id]/route.ts`

---

### Task 4: Route Management
**Owner:** Abish  
**Support:** Ashika  
**Priority:** High  
**Estimated Time:** 5-6 hours

#### Subtasks:
1. Create `/admin/routes` page
   - List all routes (with date, area, delivery boy, order count)
   - "Create Route" button

2. Create Route Form (`/admin/routes/create`):
   - Date picker
   - Area/Zone input
   - Delivery Boy dropdown (from active delivery boys)
   - Order selection:
     - Show filtered orders (by date, area)
     - Checkbox list to select orders
     - Show order details (customer, address, quantity, payment)
   - "Create Route" button

3. Generate route token and link:
   - Generate random secure token
   - Create route with token
   - Create RouteOrder entries for selected orders
   - Display shareable link: `/route/[date]/[token]`
   - Copy link button

4. API endpoints:
   - `GET /api/admin/routes` - List routes
   - `POST /api/admin/routes` - Create route
   - `POST /api/admin/routes/[id]/assign` - Assign orders to route

**Files to create:**
- `app/admin/routes/page.js`
- `app/admin/routes/create/page.js`
- `app/api/admin/routes/route.ts`
- `app/api/admin/routes/[id]/assign/route.ts`

---

### Task 5: Route Link Page (Delivery Boy View)
**Owner:** Abish  
**Support:** Ashika  
**Priority:** High  
**Estimated Time:** 6-7 hours

#### Subtasks:
1. Create `/route/[date]/[token]/page.js`
   - Verify token is valid and not expired
   - Fetch route and associated orders
   - Display route header:
     - Delivery boy name
     - Date
     - Total orders
     - Total cans
     - Expected COD amount

2. Display order list:
   - For each order show:
     - Customer name
     - Phone (clickable to call)
     - Full address + landmark
     - Quantity
     - Payment status (Paid Online / COD)
     - "Open in Maps" button (Google Maps link)
     - "Delivered" button
     - "Not Delivered" button → show reason modal

3. Delivery actions:
   - When "Delivered" clicked:
     - Update RouteOrder.deliveryStatus = DELIVERED
     - Update Order.status = DELIVERED
     - If COD: Mark codCollected = true
   - When "Not Delivered" clicked:
     - Show modal with reason options:
       - Customer not home
       - Address wrong
       - Refused
       - Other (text input)
     - Update RouteOrder.deliveryStatus = NOT_DELIVERED
     - Save reason

4. Footer summary:
   - Show delivered vs pending count
   - Show COD collected vs expected

5. API endpoints:
   - `GET /api/route/[date]/[token]` - Get route details
   - `POST /api/route-orders/update-status` - Update delivery status

**Files to create:**
- `app/route/[date]/[token]/page.js`
- `app/api/route/[date]/[token]/route.ts`
- `app/api/route-orders/update-status/route.ts`

---

### Task 6: Reports Page
**Owner:** Abish  
**Support:** Ashika  
**Priority:** Medium  
**Estimated Time:** 3-4 hours

#### Subtasks:
1. Create `/admin/reports` page
   - Date picker (default: today)
   - Delivery Boy dropdown (optional filter)
   - "Generate Report" button

2. Display report:
   - Orders assigned (count)
   - Orders delivered (count)
   - Orders pending (count)
   - Online payment total (sum)
   - COD expected (sum of COD orders)
   - COD collected (sum of marked as collected)
   - COD pending (expected - collected)

3. API endpoint: `GET /api/admin/reports`
   - Accept query params: `date`, `deliveryBoyId`
   - Return aggregated data

**Files to create:**
- `app/admin/reports/page.js`
- `app/api/admin/reports/route.ts`

---

### Task 7: Admin Layout & Navigation
**Owner:** Abish  
**Support:** Ashika  
**Priority:** Medium  
**Estimated Time:** 2-3 hours

#### Subtasks:
1. Create admin layout component
   - Sidebar navigation:
     - Orders
     - Routes
     - Delivery Boys
     - Reports
     - Logout
   - Header with admin name/email
   - Mobile responsive (hamburger menu)

2. Create shared admin components:
   - AdminHeader
   - AdminSidebar
   - AdminLayout

**Files to create:**
- `app/admin/layout.js`
- `components/admin/AdminHeader.jsx`
- `components/admin/AdminSidebar.jsx`

---

## 🗂️ File Structure After Phase 2

```
app/
├── admin/
│   ├── layout.js
│   ├── login/
│   │   └── page.js
│   ├── orders/
│   │   └── page.js
│   ├── routes/
│   │   ├── page.js
│   │   └── create/
│   │       └── page.js
│   ├── delivery-boys/
│   │   └── page.js
│   └── reports/
│       └── page.js
├── route/
│   └── [date]/
│       └── [token]/
│           └── page.js
└── api/
    ├── admin/
    │   ├── orders/
    │   │   └── route.ts
    │   ├── routes/
    │   │   ├── route.ts
    │   │   └── [id]/
    │   │       └── assign/
    │   │           └── route.ts
    │   ├── delivery-boys/
    │   │   ├── route.ts
    │   │   └── [id]/
    │   │       └── route.ts
    │   └── reports/
    │       └── route.ts
    └── route/
        └── [date]/
            └── [token]/
                └── route.ts
    └── route-orders/
        └── update-status/
            └── route.ts

components/
└── admin/
    ├── AdminHeader.jsx
    └── AdminSidebar.jsx
```

---

## 📅 Suggested Implementation Order

### Week 1:
1. ✅ Task 1: Admin Authentication (Day 1)
2. ✅ Task 7: Admin Layout (Day 1-2)
3. ✅ Task 2: Orders List (Day 2-3)

### Week 2:
4. ✅ Task 3: Delivery Boy Management (Day 1)
5. ✅ Task 4: Route Management (Day 2-3)

### Week 3:
6. ✅ Task 5: Route Link Page (Day 1-3)
7. ✅ Task 6: Reports (Day 4)

---

## 🧪 Testing Checklist (Karisma)

### Admin Flow:
- [ ] Admin can login
- [ ] Admin can view orders list
- [ ] Admin can filter orders by date, area, payment status
- [ ] Admin can create delivery boy
- [ ] Admin can create route
- [ ] Admin can assign orders to route
- [ ] Route link is generated and shareable
- [ ] Delivery boy can open route link
- [ ] Delivery boy can mark orders as delivered
- [ ] Delivery boy can mark orders as not delivered with reason
- [ ] Reports show correct data

### Edge Cases:
- [ ] Route token expires after date
- [ ] Cannot access route link after expiry
- [ ] COD collection tracking works
- [ ] Multiple routes for same day work correctly

---

## 🚀 Next Steps

**Immediate Action Items:**
1. Start with Task 1: Admin Authentication
2. Set up admin layout structure
3. Build orders list page (most critical)

**Questions to Clarify:**
- Admin login method preference? (Email/password vs Phone+OTP)
- Should routes expire after delivery date?
- What areas/zones exist? (Need list for dropdown)

---

## 📝 Notes

- All admin routes should be protected
- Use same design system (Tailwind + shadcn components)
- Mobile responsive for route link page (delivery boys use mobile)
- Google Maps integration: Use URL scheme `https://maps.google.com/?q=ADDRESS`

