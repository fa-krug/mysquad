ALTER TABLE salary_data_points ADD COLUMN previous_data_point_id INTEGER REFERENCES salary_data_points(id) ON DELETE SET NULL;
