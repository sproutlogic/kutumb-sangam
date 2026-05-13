-- Migration 042: add email field to persons
ALTER TABLE persons ADD COLUMN IF NOT EXISTS email TEXT;
