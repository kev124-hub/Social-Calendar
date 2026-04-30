-- Storage RLS policies for the inspirations bucket
-- Run in: Supabase Dashboard → SQL Editor

CREATE POLICY "Authenticated users can upload inspiration images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'inspirations');

CREATE POLICY "Public can view inspiration images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'inspirations');

CREATE POLICY "Authenticated users can delete inspiration images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'inspirations');
