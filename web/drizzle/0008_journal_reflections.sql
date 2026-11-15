-- Only user-facing MUSE feedback is persisted. Internal text analysis is transient.
ALTER TABLE journal_entries ADD COLUMN reflection TEXT;
