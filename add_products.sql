

INSERT INTO "Product" ("id", "name", "description", "price", "depositAmount", "image", "inStock", "active", "gst", "createdAt", "updatedAt")
VALUES 
    (gen_random_uuid()::text, 'Water Can 20L', '1 NO', 85.72, 0, NULL, true, true, 5.0, NOW(), NOW()),
    (gen_random_uuid()::text, 'Pet Bottle - 300ml', '1 Case - 30 NOS', 157.14, 0, NULL, true, true, 5.0, NOW() + interval '1 second', NOW() + interval '1 second'),
    (gen_random_uuid()::text, 'Pet Bottle - 500ml', '1 Case - 24 NOS', 182.86, 0, NULL, true, true, 5.0, NOW() + interval '2 seconds', NOW() + interval '2 seconds'),
    (gen_random_uuid()::text, 'Pet Bottle - 1L', '1 Case - 12 NOS', 137.14, 0, NULL, true, true, 5.0, NOW() + interval '3 seconds', NOW() + interval '3 seconds'),
    (gen_random_uuid()::text, 'Pet Bottle - 2L', '1 Case - 9 NOS', 223.81, 0, NULL, true, true, 5.0, NOW() + interval '4 seconds', NOW() + interval '4 seconds'),
    (gen_random_uuid()::text, 'Pet Bottles - 5000ml', '1 Case - 4 NOS', 266.67, 0, NULL, true, true, 5.0, NOW() + interval '5 seconds', NOW() + interval '5 seconds'),
    (gen_random_uuid()::text, 'Pet Bottle - 10L', '1 NO', 76.00, 0, NULL, true, true, 5.0, NOW() + interval '6 seconds', NOW() + interval '6 seconds'),
    (gen_random_uuid()::text, 'MATKA', '1 NO', 169.49, 0, NULL, true, true, 18.0, NOW() + interval '7 seconds', NOW() + interval '7 seconds');

