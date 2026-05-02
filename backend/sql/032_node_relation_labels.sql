-- 032_node_relation_labels.sql
-- Personal relation labels: each user stores their own name for every node
-- (e.g. "पिताजी", "बप्पा", "Chachu") — one row per (user, node) pair.

CREATE TABLE IF NOT EXISTS public.node_relation_labels (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    node_id     UUID        NOT NULL REFERENCES public.persons(node_id) ON DELETE CASCADE,
    vansha_id   UUID        NOT NULL,
    label       TEXT        NOT NULL CHECK (char_length(trim(label)) > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT node_relation_labels_user_node_uq UNIQUE (user_id, node_id)
);

-- Index for fast lookup of all labels by a single user
CREATE INDEX IF NOT EXISTS idx_nrl_user ON public.node_relation_labels (user_id);

-- Index for fast lookup of all users who have labelled a particular node
CREATE INDEX IF NOT EXISTS idx_nrl_node ON public.node_relation_labels (node_id);

-- Auto-update updated_at on upsert
CREATE OR REPLACE FUNCTION public.nrl_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nrl_updated_at ON public.node_relation_labels;
CREATE TRIGGER nrl_updated_at
  BEFORE UPDATE ON public.node_relation_labels
  FOR EACH ROW EXECUTE FUNCTION public.nrl_set_updated_at();

-- RLS: users may only read/write their own rows
ALTER TABLE public.node_relation_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nrl_select_own ON public.node_relation_labels;
CREATE POLICY nrl_select_own ON public.node_relation_labels
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS nrl_upsert_own ON public.node_relation_labels;
CREATE POLICY nrl_upsert_own ON public.node_relation_labels
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
