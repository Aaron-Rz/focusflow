-- Migration: Habit frequency → structured JSON
--
-- The `frequency` column changes from a plain string enum ('daily'|'weekly'|'custom')
-- to a JSON-serialised HabitFrequency object:
--   {"type":"daily"}
--   {"type":"interval","every":N}
--   {"type":"weekly","weekdays":[0..6]}
--   {"type":"monthly","daysOfMonth":[1..31]}
--
-- The `custom_days` column is retained for the migration (kept nullable) so legacy
-- rows from old clients are still readable before they sync their updated format.
-- New client writes always send custom_days = NULL.

-- 1. Convert existing plain-string rows to JSON format
UPDATE habits
SET frequency = CASE
  WHEN frequency = 'daily'
    THEN '{"type":"daily"}'
  WHEN frequency = 'weekly'
    THEN json_build_object('type', 'weekly', 'weekdays', COALESCE(custom_days, '[]'::int[]))::text
  WHEN frequency = 'custom'
    THEN json_build_object('type', 'interval', 'every', COALESCE(custom_days[1], 1))::text
  ELSE frequency  -- already JSON (idempotent re-run)
END
WHERE frequency IN ('daily', 'weekly', 'custom');

-- 2. (Optional) Add a check constraint so future writes are valid JSON
-- ALTER TABLE habits
--   ADD CONSTRAINT habits_frequency_is_json
--   CHECK (frequency::json IS NOT NULL);
