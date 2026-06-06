-- Enable pgcrypto for UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    -- Constants for Simulation
    area_names text[] := ARRAY['Gandhipuram', 'RS Puram', 'Peelamedu', 'Saibaba Colony', 'Town Hall', 'Saravanampatti', 'Ramanathapuram', 'Singanallur', 'Vadavalli', 'Podanur'];
    pincodes text[] := ARRAY['641012', '641002', '641004', '641011', '641001', '641035', '641045', '641005', '641041', '641023'];
    first_names text[] := ARRAY['Ramesh', 'Suresh', 'Mani', 'Karthik', 'Senthil', 'Kumar', 'Rajesh', 'Prakash', 'Arun', 'Balaji', 'Ganesh', 'Murugan', 'Siva', 'Vignesh', 'Dinesh', 'Anand', 'Vijay', 'Ajith', 'Surya', 'Vikram', 'Lakshmi', 'Priya', 'Divya', 'Deepa', 'Anitha', 'Kavitha', 'Meena', 'Radha', 'Sangeetha', 'Uma'];
    last_names text[] := ARRAY['Kumar', 'Rajan', 'Swamy', 'Velu', 'Smith', 'Doe', 'Reddy', 'Rao'];
    
    -- Loop Variables
    i integer;
    d integer;
    o integer;
    
    -- Helper Variables
    area_idx integer;
    fname_idx integer;
    lname_idx integer;
    
    -- Captured IDs
    new_db_id text;
    new_cust_id text;
    new_addr_id text;
    new_route_id text;
    new_order_id text;
    
    -- Data Stores
    db_ids text[];
    cust_ids text[];
    addr_ids text[];
    day_route_ids text[];
    
    -- Simulation Logic Vars
    curr_date timestamp;
    order_ts timestamp;
    
    target_cust_idx integer;
    target_cust_id text;
    target_addr_id text;
    
    order_qty integer;
    order_amt integer;
    
    rand_val float;
    o_status text;
    o_pay_status text;
    o_del_status text;
    assign_route_id text;
    pay_method text;
    
BEGIN
    RAISE NOTICE 'Starting Simulation...';

    -- 1. Create Admin (Check first to avoid unique constraint violation)
    IF NOT EXISTS (SELECT 1 FROM "Admin" WHERE email = 'admin@example.com' OR username = 'admin') THEN
        INSERT INTO "Admin" (id, email, username, "passwordHash", name, active, "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, 'admin@example.com', 'admin', 'dummy_hash', 'Super Admin', true, NOW(), NOW());
        RAISE NOTICE 'Admin Created';
    ELSE
        RAISE NOTICE 'Admin already exists, skipping...';
    END IF;

    -- 2. Create Product
    IF NOT EXISTS (SELECT 1 FROM "Product" WHERE name = 'Water Can (20L)') THEN
        INSERT INTO "Product" (id, name, description, price, unit, active, "inStock", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, 'Water Can (20L)', 'Purified mineral water 20L can', 90.0, 'can', true, true, NOW(), NOW());
        RAISE NOTICE 'Product Created';
    END IF;

    -- 2.5 Pre-seed Service Areas
    FOR i IN 1..array_length(pincodes, 1) LOOP
        INSERT INTO "ServiceArea" (id, pincode, "areaName", active, "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, pincodes[i], area_names[i], true, NOW(), NOW())
        ON CONFLICT (pincode) DO NOTHING;
    END LOOP;
    RAISE NOTICE 'Service Areas Seeded';

    -- 3. Create 50 Delivery Boys
    FOR i IN 1..50 LOOP
        area_idx := floor(random() * array_length(area_names, 1) + 1);
        fname_idx := floor(random() * array_length(first_names, 1) + 1);
        lname_idx := floor(random() * array_length(last_names, 1) + 1);
        
        -- Insert DeliveryBoy
        INSERT INTO "DeliveryBoy" (id, name, phone, active, "onLeave", "createdAt", "updatedAt")
        VALUES (
            gen_random_uuid()::text, 
            first_names[fname_idx] || ' ' || last_names[lname_idx], 
            '9' || floor(random() * 900000000 + 100000000)::text, 
            true, 
            false,
            NOW(), NOW()
        )
        RETURNING id INTO new_db_id;
        
        -- Assign to the area we picked (linked via ServiceArea table)
        UPDATE "ServiceArea" SET "deliveryBoyId" = new_db_id 
        WHERE pincode = pincodes[area_idx];

        db_ids := array_append(db_ids, new_db_id);
    END LOOP;
    RAISE NOTICE 'Created 50 Delivery Boys and Assigned to Areas';

    -- 4. Create 100 Customers
    FOR i IN 1..100 LOOP
        area_idx := floor(random() * array_length(area_names, 1) + 1);
        fname_idx := floor(random() * array_length(first_names, 1) + 1);
        lname_idx := floor(random() * array_length(last_names, 1) + 1);
        
        INSERT INTO "Customer" (id, name, phone, "createdAt", "updatedAt")
        VALUES (
            gen_random_uuid()::text,
            first_names[fname_idx] || ' ' || last_names[lname_idx],
            '9' || floor(random() * 900000000 + 100000000)::text,
            NOW(), NOW()
        )
        RETURNING id INTO new_cust_id;
        cust_ids := array_append(cust_ids, new_cust_id);
        
        -- Use Pincode for Area
        INSERT INTO "Address" (id, "customerId", line1, line2, area, city, pincode, landmark, "isDefault", "createdAt", "updatedAt")
        VALUES (
            gen_random_uuid()::text,
            new_cust_id,
            floor(random() * 999 + 1)::text || ', Main St',
            area_names[area_idx] || ' Layout',
            pincodes[area_idx], -- Changed from area_names to pincodes
            'Coimbatore',
            pincodes[area_idx],
            'Near Temple',
            true,
            NOW(), NOW()
        )
        RETURNING id INTO new_addr_id;
        addr_ids := array_append(addr_ids, new_addr_id);
    END LOOP;
    RAISE NOTICE 'Created 100 Customers';

    -- 5. Simulate 11 Days (5 Days Past, Today, 5 Days Future)
    FOR d IN -5..5 LOOP
        -- Current simulation date (12:00 PM)
        curr_date := date_trunc('day', CURRENT_DATE) + (d || ' days')::interval + interval '12 hours';
        
        -- Create Routes for this day
        day_route_ids := ARRAY[]::text[];
        
        IF array_length(db_ids, 1) > 0 THEN
            FOREACH new_db_id IN ARRAY db_ids LOOP
                IF random() < 0.8 THEN -- 80% Attendance
                    INSERT INTO "Route" (id, date, area, token, "tokenExpiresAt", "deliveryBoyId", "createdAt", "updatedAt")
                    SELECT
                        gen_random_uuid()::text,
                        curr_date,
                        sa.pincode,
                         md5(random()::text || clock_timestamp()::text), -- Random Token
                         curr_date + interval '11 hours 59 minutes',
                         new_db_id,
                         NOW(), NOW()
                    FROM "ServiceArea" sa WHERE sa."deliveryBoyId" = new_db_id
                    LIMIT 1
                    RETURNING id INTO new_route_id;
                    day_route_ids := array_append(day_route_ids, new_route_id);
                END IF;
            END LOOP;
        END IF;
        
        -- Create Orders (100-200 per day)
        FOR o IN 1..(floor(random() * 101 + 100)::int) LOOP
            
            -- Pick random customer
            target_cust_idx := floor(random() * array_length(cust_ids, 1) + 1);
            target_cust_id := cust_ids[target_cust_idx];
            target_addr_id := addr_ids[target_cust_idx];
            
            order_qty := floor(random() * 5 + 1);
            order_amt := (order_qty * 90.0 * 1.05 * 100)::int; -- Qty * Price * GST * 100 (to Paise)
            
            -- Order Time: 8 AM to 8 PM spread
            order_ts := (date_trunc('day', curr_date) + interval '8 hours') + (random() * 12 || ' hours')::interval;
            
            rand_val := random();
            o_status := 'PENDING';
            o_pay_status := 'PENDING';
            o_del_status := 'PENDING';
            assign_route_id := NULL;
            
            -- Pick a random route if exists
            IF array_length(day_route_ids, 1) > 0 THEN
                assign_route_id := day_route_ids[floor(random() * array_length(day_route_ids, 1) + 1)];
            END IF;

            -- Default payment method logic
            IF random() > 0.5 THEN pay_method := 'COD'; ELSE pay_method := 'ONLINE'; END IF;

            -- Status Logic based on Past, Today, or Future
            IF d < 0 THEN
                -- Past orders: mostly delivered
                IF rand_val < 0.90 THEN
                    o_status := 'DELIVERED';
                    o_pay_status := 'SUCCESS';
                    o_del_status := 'DELIVERED';
                ELSE
                    o_status := 'NOT_DELIVERED';
                    o_del_status := 'NOT_DELIVERED';
                    -- For past orders, payment status might be FAILED or PENDING if not delivered
                    o_pay_status := CASE WHEN random() > 0.5 THEN 'PENDING' ELSE 'FAILED' END;
                END IF;
            ELSIF d = 0 THEN
                -- Today's orders: mixed
                IF rand_val < 0.40 THEN
                    o_status := 'DELIVERED';
                    o_pay_status := 'SUCCESS';
                    o_del_status := 'DELIVERED';
                ELSIF rand_val < 0.80 THEN
                    o_status := 'CONFIRMED';
                    o_pay_status := CASE WHEN pay_method = 'COD' THEN 'COD' ELSE 'PENDING' END;
                    o_del_status := 'PENDING';
                ELSE
                    o_status := 'PENDING';
                    o_pay_status := 'PENDING';
                    o_del_status := 'PENDING';
                END IF;
            ELSE
                -- Future orders: Pending or Confirmed
                IF rand_val < 0.70 THEN
                    o_status := 'CONFIRMED';
                    o_pay_status := CASE WHEN pay_method = 'COD' THEN 'COD' ELSE 'PENDING' END;
                    -- Some pre-paid future orders
                    IF pay_method = 'ONLINE' AND random() > 0.5 THEN
                        o_pay_status := 'SUCCESS';
                    END IF;
                ELSE
                    o_status := 'PENDING';
                    o_pay_status := 'PENDING';
                END IF;
                o_del_status := 'PENDING';
            END IF;
            
            -- Insert Order
            INSERT INTO "Order" (id, "customerId", "addressId", quantity, amount, "deliveryDate", "deliverySlot", status, "paymentStatus", "paymentMethod", "createdAt", "updatedAt")
            VALUES (
                gen_random_uuid()::text,
                target_cust_id,
                target_addr_id,
                order_qty,
                order_amt,
                curr_date,
                'TODAY_MORNING',
                o_status::"OrderStatus",
                o_pay_status::"PaymentStatus",
                pay_method::"PaymentMethod",
                order_ts, order_ts
            )
            RETURNING id INTO new_order_id;
            
            -- Insert RouteOrder (if on route)
            IF assign_route_id IS NOT NULL THEN
                INSERT INTO "RouteOrder" (id, "routeId", "orderId", "deliveryStatus", "notDeliveredReason", "codCollected", "createdAt", "updatedAt")
                VALUES (
                    gen_random_uuid()::text,
                    assign_route_id,
                    new_order_id,
                    o_del_status::"DeliveryStatus",
                    CASE WHEN o_del_status = 'NOT_DELIVERED' THEN 'Customer unavailable' ELSE NULL END,
                    (o_pay_status = 'SUCCESS' AND pay_method = 'COD'),
                    order_ts, order_ts
                );
            END IF;
            
            -- Insert Payment (if success)
            IF o_pay_status = 'SUCCESS' THEN
                 INSERT INTO "Payment" (id, "orderId", provider, amount, status, method, "createdAt", "updatedAt")
                 VALUES (
                     gen_random_uuid()::text,
                     new_order_id,
                     CASE WHEN pay_method = 'ONLINE' THEN 'RAZORPAY' ELSE 'CASH' END,
                     order_amt,
                     'SUCCESS'::"PaymentStatus",
                     pay_method::"PaymentMethod",
                     order_ts, order_ts
                 );
            END IF;
            
        END LOOP;
        
        RAISE NOTICE 'Simulated Date: %, Orders: %', curr_date, o;
        
    END LOOP;
    
    RAISE NOTICE 'Simulation Completed Successfully.';
END $$;
