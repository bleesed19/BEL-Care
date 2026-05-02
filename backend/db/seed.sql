-- Sample data for BEL-CARE MedAccess (10 hospitals in Zimbabwe)

-- Insert services master list
INSERT INTO services (name, category, icon) VALUES
('X-Ray', 'Diagnostics', 'camera'),
('Maternity', 'Maternal', 'heart'),
('ICU', 'Emergency', 'alert-circle'),
('Pharmacy', 'Pharmaceutical', 'pill'),
('Laboratory', 'Diagnostics', 'microscope'),
('Dental', 'Specialty', 'tooth'),
('Pediatrics', 'Specialty', 'baby'),
('Surgery', 'Surgical', 'scalpel'),
('Emergency Room', 'Emergency', 'ambulance'),
('Outpatient', 'General', 'users');

-- Insert hospitals (10 private facilities in Harare & Bulawayo)
INSERT INTO hospitals (name, description, address, latitude, longitude, phone, email, emergency_ready, bed_availability, is_approved, health_score) VALUES
('Arundel Hospital', 'Private hospital with modern facilities', '14 Arundel Road, Harare', -17.7886, 31.0341, '+263242703131', 'info@arundelhospital.co.zw', true, 45, true, 4.2),
('St Annes Hospital', 'Maternity and pediatric specialist', '50 Baines Ave, Harare', -17.8269, 31.0439, '+263242707777', 'stannes@health.co.zw', true, 30, true, 4.5),
('Sally Mugabe Hospital', 'Comprehensive care facility', 'Cnr Mazowe & Human Road, Harare', -17.8441, 31.0267, '+263242621111', 'smh@zimbabwehealth.com', true, 60, true, 4.0),
('Parirenyatwa Hospital', 'Teaching and referral hospital', 'Mazowe Street, Harare', -17.8227, 31.0509, '+263242795151', 'parirenyatwa@health.gov.zw', true, 120, true, 4.8),
('Harare Central Hospital', 'General medical services', 'Corner Lobengula & Baines Ave', -17.8399, 31.0499, '+263242753781', 'hararecentral@health.gov.zw', false, 85, true, 3.9),
('Westend Hospital', 'Private clinic with dental', '58 Livingstone Ave, Harare', -17.8221, 31.0397, '+263242704209', 'westend@private.co.zw', true, 25, true, 4.3),
('Mater Dei Hospital', 'Catholic mission hospital', '122 Enterprise Road, Harare', -17.7849, 31.0887, '+263242497920', 'info@materdei.co.zw', true, 40, true, 4.6),
('Mpilo Central Hospital', 'Major referral in Bulawayo', 'Mpilo Road, Bulawayo', -20.1666, 28.5783, '+263292270121', 'mpilo@health.co.zw', true, 95, true, 4.1),
('Bulawayo Clinic', 'Private clinic with ICU', '10 Park Road, Bulawayo', -20.1552, 28.5893, '+263292274000', 'bulawayoclinic@private.co.zw', true, 35, true, 4.4),
('Cimas Medcare', 'Multi-location clinic network', 'Corner Samora Machel & Witney, Harare', -17.8175, 31.0380, '+263242705968', 'cimas@cimas.co.zw', true, 20, true, 4.7);

-- Link hospitals with services
INSERT INTO hospital_services (hospital_id, service_id, is_available)
SELECT h.id, s.id, true
FROM hospitals h, services s
WHERE (h.name = 'Arundel Hospital' AND s.name IN ('X-Ray', 'ICU', 'Pharmacy', 'Laboratory', 'Emergency Room'))
   OR (h.name = 'St Annes Hospital' AND s.name IN ('Maternity', 'Pediatrics', 'Pharmacy', 'Outpatient'))
   OR (h.name = 'Sally Mugabe Hospital' AND s.name IN ('X-Ray', 'Maternity', 'ICU', 'Surgery', 'Emergency Room'))
   OR (h.name = 'Parirenyatwa Hospital' AND s.name IN ('X-Ray', 'Maternity', 'ICU', 'Pediatrics', 'Surgery', 'Laboratory', 'Emergency Room'))
   OR (h.name = 'Harare Central Hospital' AND s.name IN ('X-Ray', 'Pharmacy', 'Outpatient'))
   OR (h.name = 'Westend Hospital' AND s.name IN ('Dental', 'Pharmacy', 'X-Ray', 'Outpatient'))
   OR (h.name = 'Mater Dei Hospital' AND s.name IN ('Maternity', 'Pediatrics', 'Pharmacy', 'Laboratory', 'Outpatient'))
   OR (h.name = 'Mpilo Central Hospital' AND s.name IN ('ICU', 'Surgery', 'Emergency Room', 'X-Ray'))
   OR (h.name = 'Bulawayo Clinic' AND s.name IN ('ICU', 'Dental', 'Laboratory', 'Pharmacy'))
   OR (h.name = 'Cimas Medcare' AND s.name IN ('X-Ray', 'Pharmacy', 'Outpatient', 'Laboratory'));

-- Create initial super admin (password: SuperAdmin123!)
INSERT INTO users (full_name, email, password_hash, role) VALUES 
('System Admin', 'admin@belcare.com', '$2b$10$5eXyhIY6nWlwPlMZTRO8COp/fUyXsA8xNfNqC6LKGnCkGQeQw6Jmu', 'super_admin');

-- Create sample hospital admin users (password: Hospital123!)
INSERT INTO users (full_name, email, password_hash, role) VALUES
('Arundel Manager', 'hospital1@belcare.com', '$2b$10$5eXyhIY6nWlwPlMZTRO8COp/fUyXsA8xNfNqC6LKGnCkGQeQw6Jmu', 'hospital_admin'),
('St Annes Admin', 'hospital2@belcare.com', '$2b$10$5eXyhIY6nWlwPlMZTRO8COp/fUyXsA8xNfNqC6LKGnCkGQeQw6Jmu', 'hospital_admin');

-- Assign hospital admins to hospitals
UPDATE hospitals SET admin_id = (SELECT id FROM users WHERE email = 'hospital1@belcare.com') WHERE name = 'Arundel Hospital';
UPDATE hospitals SET admin_id = (SELECT id FROM users WHERE email = 'hospital2@belcare.com') WHERE name = 'St Annes Hospital';