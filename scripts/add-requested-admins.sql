-- SQL script to add requested admins

INSERT INTO "Admin" ("id", "email", "username", "passwordHash", "name", "active", "createdAt", "updatedAt")
VALUES ('af61bdb2-0e00-4651-ad2e-3c7949b5fa0d', 'sabolpurewater@yahoo.com', 'admin 1', 'd29af2c7c6925222879e632a0b31884be3e6454ea072a9d024278984887acce3', 'Admin 1', true, NOW(), NOW());

INSERT INTO "Admin" ("id", "email", "username", "passwordHash", "name", "active", "createdAt", "updatedAt")
VALUES ('5e3eb751-cb7a-4452-836e-f9ff7735e5c9', 'admin@stedaxis.com', 'admin2', 'da49d0392297c7f7cbefd4ac378e201b0142b6fedae6fcf73ed536b155202d2d', 'Admin 2', true, NOW(), NOW());

