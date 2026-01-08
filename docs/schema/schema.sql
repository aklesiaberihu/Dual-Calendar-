CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  preferred_calendar VARCHAR(20) DEFAULT 'gregorian',
  timezone VARCHAR(64) DEFAULT 'UTC',
  language VARCHAR(32) DEFAULT 'en',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_time_utc TIMESTAMP NOT NULL,
  end_time_utc TIMESTAMP,
  timezone VARCHAR(64) DEFAULT 'UTC',
  reminder_minutes INTEGER DEFAULT 60,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  holiday_date DATE NOT NULL,
  calendar_type VARCHAR(20) NOT NULL,
  description TEXT
);
