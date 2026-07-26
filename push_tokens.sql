-- Run this SQL in your Supabase Dashboard (SQL Editor) to create the push_tokens table

CREATE TABLE public.push_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert a token (so users who haven't logged in can still receive push notifications if user_id is null)
CREATE POLICY "Allow anon insert" 
ON public.push_tokens FOR INSERT 
WITH CHECK (true);

-- Allow users to read their own tokens
CREATE POLICY "Users can read own tokens" 
ON public.push_tokens FOR SELECT 
USING (auth.uid() = user_id);

-- Allow users to delete their own tokens
CREATE POLICY "Users can delete own tokens" 
ON public.push_tokens FOR DELETE 
USING (auth.uid() = user_id);

-- (Admins can do everything because we are using the service_role/anonKey from the CMS, wait, CMS uses anonKey but we log in as admin, so we need an admin policy too if the CMS reads them)

-- Allow admins to read all push tokens for the CMS dashboard
CREATE POLICY "Admins can read all push tokens"
ON public.push_tokens FOR SELECT
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' OR 
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'editor'
);
