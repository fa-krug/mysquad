-- Team meetings table (meetings with your superior)
CREATE TABLE IF NOT EXISTS team_meetings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT NOT NULL DEFAULT (date('now')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add escalation columns to talk_topics
ALTER TABLE talk_topics ADD COLUMN escalated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE talk_topics ADD COLUMN escalated_at DATETIME;
ALTER TABLE talk_topics ADD COLUMN resolved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE talk_topics ADD COLUMN resolved_at DATETIME;
ALTER TABLE talk_topics ADD COLUMN team_meeting_id INTEGER REFERENCES team_meetings(id) ON DELETE SET NULL;

-- Index for quick lookup of escalated topics
CREATE INDEX IF NOT EXISTS idx_talk_topics_escalated ON talk_topics(escalated) WHERE escalated = 1;

-- Index for team meeting topic lookup
CREATE INDEX IF NOT EXISTS idx_talk_topics_team_meeting_id ON talk_topics(team_meeting_id);
