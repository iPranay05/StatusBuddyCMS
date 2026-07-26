-- Run this SQL in your Supabase Dashboard (SQL Editor) to create the ab_tests table

CREATE TABLE public.ab_tests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT false NOT NULL,
  variant_a jsonb NOT NULL DEFAULT '{}'::jsonb,
  variant_b jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;

-- Allow anyone (the mobile app users) to READ the active tests so they can apply the variants
CREATE POLICY "Allow anon read active tests" 
ON public.ab_tests FOR SELECT 
USING (is_active = true);

-- Allow admins to manage all A/B tests (read, insert, update, delete)
CREATE POLICY "Admins can manage tests"
ON public.ab_tests
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'editor'
);
