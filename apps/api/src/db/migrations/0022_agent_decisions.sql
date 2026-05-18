-- 0022_agent_decisions.sql
-- LLM agent audit trail. See SPEC-AGENT-001.
-- Stores every agent invocation: input, output, model, tokens, cost, latency, status.
-- Retention: input_text masked after 30 days, rows deleted after 5 years.

CREATE TABLE IF NOT EXISTS agent_decisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name    VARCHAR(50) NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id),
  model         VARCHAR(40) NOT NULL,
  input_text    TEXT NOT NULL,
  output_json   JSONB NOT NULL,
  tokens_in     INTEGER NOT NULL,
  tokens_out    INTEGER NOT NULL,
  cost_krw      NUMERIC(10, 4) NOT NULL,
  latency_ms    INTEGER NOT NULL,
  trace_id      VARCHAR(64),
  status        VARCHAR(20) NOT NULL CHECK (status IN ('success','partial','fallback','error')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_decisions_agent_user
  ON agent_decisions(agent_name, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_decisions_status
  ON agent_decisions(status)
  WHERE status != 'success';

CREATE INDEX IF NOT EXISTS idx_agent_decisions_trace
  ON agent_decisions(trace_id)
  WHERE trace_id IS NOT NULL;

COMMENT ON TABLE agent_decisions IS 'Audit trail for every LLM agent invocation. SPEC-AGENT-001.';
COMMENT ON COLUMN agent_decisions.input_text IS 'Plain text for 30d, then masked to [REDACTED] by retention cron.';
COMMENT ON COLUMN agent_decisions.cost_krw IS 'KRW cost derived from per-Mtok pricing. See agents/runtime.ts COST_KRW_PER_MTOK.';
