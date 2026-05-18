-- 0023_dispute_ai_triage.sql
-- AI dispute triage results. See SPEC-AGENT-002.
-- One row per dispute. LLM populates it via setImmediate fire-and-forget.
-- Final refund/settlement decisions are still made by admin operators.

CREATE TABLE IF NOT EXISTS dispute_ai_triage (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id              UUID NOT NULL UNIQUE REFERENCES job_disputes(id) ON DELETE CASCADE,
  priority                VARCHAR(10) NOT NULL CHECK (priority IN ('low','medium','urgent')),
  recommended_action      VARCHAR(30) NOT NULL CHECK (recommended_action IN (
    'full_refund',
    'partial_refund',
    'release_to_worker',
    'dismiss',
    'human_review_required'
  )),
  partial_refund_percent  INTEGER CHECK (partial_refund_percent BETWEEN 0 AND 100),
  summary                 TEXT NOT NULL,
  extracted_facts         JSONB NOT NULL,
  open_questions          JSONB NOT NULL DEFAULT '[]'::jsonb,
  legal_risk              VARCHAR(10) NOT NULL CHECK (legal_risk IN ('none','low','medium','high')),
  confidence              NUMERIC(3, 2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  human_review_required   BOOLEAN NOT NULL,
  agent_decision_id       UUID REFERENCES agent_decisions(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin dashboard hot path: urgent + needs human review surfaces first.
CREATE INDEX IF NOT EXISTS idx_dispute_triage_priority_pending
  ON dispute_ai_triage(priority, created_at DESC)
  WHERE human_review_required = TRUE OR legal_risk IN ('medium', 'high');

-- Operator drill-down by dispute.
CREATE INDEX IF NOT EXISTS idx_dispute_triage_dispute
  ON dispute_ai_triage(dispute_id);

COMMENT ON TABLE dispute_ai_triage IS 'AI first-pass triage results for job disputes. Admin-only visibility. SPEC-AGENT-002.';
COMMENT ON COLUMN dispute_ai_triage.recommended_action IS 'LLM recommendation only. Admin executes the actual refund/settlement.';
COMMENT ON COLUMN dispute_ai_triage.legal_risk IS 'high=harassment/violence/minor labor — escalate to ops urgently.';
