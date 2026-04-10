CREATE TABLE IF NOT EXISTS stations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  source      TEXT NOT NULL,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  address     TEXT,
  active      INTEGER DEFAULT 1,
  battery     REAL,
  last_seen   TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS readings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id  TEXT NOT NULL REFERENCES stations(id),
  timestamp   TEXT NOT NULL,
  pm25        REAL,
  pm10        REAL,
  pm1         REAL,
  no2         REAL,
  temperature REAL,
  humidity    REAL,
  aqi         INTEGER,
  aqi_label   TEXT,
  source      TEXT NOT NULL,
  raw         TEXT
);

CREATE INDEX IF NOT EXISTS idx_readings_station_time
  ON readings(station_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id  TEXT REFERENCES stations(id),
  level       TEXT NOT NULL,
  pm25_value  REAL,
  message     TEXT,
  active      INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- Seed estaciones Providencia/RM
INSERT OR IGNORE INTO stations (id, name, source, lat, lng, address, last_seen) VALUES
  ('mock-parque-esculturas', 'Parque de las Esculturas', 'openaq', -33.4302, -70.6145, 'Santa María 2205, Providencia, Santiago', datetime('now')),
  ('mock-manuel-montt',      'Manuel Montt',             'openaq', -33.4350, -70.6270, 'Manuel Montt, Providencia, Santiago',       datetime('now')),
  ('mock-parque-bustamante', 'Parque Bustamante',         'openaq', -33.4411, -70.6330, 'Parque Bustamante, Providencia, Santiago',  datetime('now')),
  ('mock-costanera',         'Costanera Center',          'openaq', -33.4172, -70.6064, 'Andrés Bello 2447, Providencia, Santiago',  datetime('now')),
  ('mock-baquedano',         'Plaza Baquedano',           'openaq', -33.4378, -70.6373, 'Av. Libertador B. O''Higgins, Santiago',    datetime('now')),
  ('mock-tobalaba',          'Tobalaba',                  'openaq', -33.4255, -70.5985, 'Tobalaba, Providencia, Santiago',           datetime('now'));

-- Seed lecturas mock de las últimas 24h (PM2.5 realistas para Santiago)
INSERT OR IGNORE INTO readings (station_id, timestamp, pm25, pm10, temperature, humidity, aqi, aqi_label, source) VALUES
  -- Parque de las Esculturas — AQI bueno
  ('mock-parque-esculturas', datetime('now', '-0 hours'),  12.4, 24.1, 22.0, 45, 52, 'moderate',   'openaq'),
  ('mock-parque-esculturas', datetime('now', '-1 hours'),  11.8, 22.5, 21.5, 46, 49, 'good',       'openaq'),
  ('mock-parque-esculturas', datetime('now', '-2 hours'),  13.1, 25.3, 21.0, 48, 54, 'moderate',   'openaq'),
  ('mock-parque-esculturas', datetime('now', '-4 hours'),  15.6, 28.0, 20.0, 50, 58, 'moderate',   'openaq'),
  ('mock-parque-esculturas', datetime('now', '-6 hours'),  18.2, 32.1, 19.5, 52, 65, 'moderate',   'openaq'),
  ('mock-parque-esculturas', datetime('now', '-8 hours'),  22.4, 38.5, 18.0, 55, 76, 'moderate',   'openaq'),
  ('mock-parque-esculturas', datetime('now', '-10 hours'), 28.3, 45.2, 17.0, 58, 86, 'moderate',   'openaq'),
  ('mock-parque-esculturas', datetime('now', '-12 hours'), 35.1, 54.8, 16.5, 60, 100,'moderate',   'openaq'),
  ('mock-parque-esculturas', datetime('now', '-14 hours'), 42.5, 65.3, 16.0, 62, 117,'unhealthy-sensitive','openaq'),
  ('mock-parque-esculturas', datetime('now', '-16 hours'), 38.0, 60.1, 16.5, 61, 107,'unhealthy-sensitive','openaq'),
  ('mock-parque-esculturas', datetime('now', '-18 hours'), 30.2, 48.5, 17.5, 59, 90, 'moderate',   'openaq'),
  ('mock-parque-esculturas', datetime('now', '-20 hours'), 20.1, 35.0, 19.0, 54, 69, 'moderate',   'openaq'),
  ('mock-parque-esculturas', datetime('now', '-22 hours'), 14.5, 27.0, 20.5, 50, 57, 'moderate',   'openaq'),
  ('mock-parque-esculturas', datetime('now', '-24 hours'), 10.2, 20.5, 21.0, 47, 43, 'good',       'openaq'),
  -- Manuel Montt
  ('mock-manuel-montt', datetime('now', '-0 hours'),  18.3, 32.0, 21.5, 44, 65, 'moderate', 'openaq'),
  ('mock-manuel-montt', datetime('now', '-4 hours'),  22.1, 38.0, 20.0, 48, 75, 'moderate', 'openaq'),
  ('mock-manuel-montt', datetime('now', '-8 hours'),  30.5, 50.0, 18.0, 54, 91, 'moderate', 'openaq'),
  ('mock-manuel-montt', datetime('now', '-12 hours'), 40.2, 62.0, 16.5, 60, 114,'unhealthy-sensitive','openaq'),
  ('mock-manuel-montt', datetime('now', '-16 hours'), 35.0, 56.0, 17.0, 58, 100,'moderate', 'openaq'),
  ('mock-manuel-montt', datetime('now', '-20 hours'), 25.0, 42.0, 19.5, 52, 80, 'moderate', 'openaq'),
  -- Parque Bustamante
  ('mock-parque-bustamante', datetime('now', '-0 hours'),  21.5, 38.5, 22.0, 43, 73, 'moderate', 'openaq'),
  ('mock-parque-bustamante', datetime('now', '-4 hours'),  26.8, 45.0, 20.5, 47, 82, 'moderate', 'openaq'),
  ('mock-parque-bustamante', datetime('now', '-8 hours'),  33.2, 55.0, 18.5, 53, 97, 'moderate', 'openaq'),
  ('mock-parque-bustamante', datetime('now', '-12 hours'), 44.0, 68.0, 17.0, 61, 122,'unhealthy-sensitive','openaq'),
  -- Costanera Center
  ('mock-costanera', datetime('now', '-0 hours'),  27.8, 48.0, 23.0, 42, 84, 'moderate', 'openaq'),
  ('mock-costanera', datetime('now', '-4 hours'),  32.5, 55.0, 21.5, 46, 96, 'moderate', 'openaq'),
  ('mock-costanera', datetime('now', '-8 hours'),  41.0, 66.0, 19.0, 52, 115,'unhealthy-sensitive','openaq'),
  ('mock-costanera', datetime('now', '-12 hours'), 52.3, 80.0, 17.5, 60, 142,'unhealthy-sensitive','openaq'),
  -- Plaza Baquedano
  ('mock-baquedano', datetime('now', '-0 hours'),  35.5, 58.0, 21.0, 46, 101,'unhealthy-sensitive','openaq'),
  ('mock-baquedano', datetime('now', '-4 hours'),  40.0, 64.0, 20.0, 49, 113,'unhealthy-sensitive','openaq'),
  ('mock-baquedano', datetime('now', '-8 hours'),  50.2, 78.0, 18.5, 55, 138,'unhealthy-sensitive','openaq'),
  -- Tobalaba
  ('mock-tobalaba', datetime('now', '-0 hours'),  9.8, 19.5, 22.5, 41, 41, 'good', 'openaq'),
  ('mock-tobalaba', datetime('now', '-4 hours'),  12.1, 23.0, 21.0, 44, 51, 'moderate', 'openaq'),
  ('mock-tobalaba', datetime('now', '-8 hours'),  18.5, 32.0, 19.5, 48, 66, 'moderate', 'openaq');
