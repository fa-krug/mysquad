ALTER TABLE salary_data_point_members ADD COLUMN promoted_title_id INTEGER REFERENCES titles(id) ON DELETE SET NULL;
