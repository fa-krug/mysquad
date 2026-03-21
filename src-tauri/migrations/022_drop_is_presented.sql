-- SQLite >=3.35.0 supports DROP COLUMN directly.
-- The bundled SQLCipher in rusqlite 0.37 is based on SQLite 3.46+ so this is safe.
ALTER TABLE salary_data_point_members DROP COLUMN is_presented;
