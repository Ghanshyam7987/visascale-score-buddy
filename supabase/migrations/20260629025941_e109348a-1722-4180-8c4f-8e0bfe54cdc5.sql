DROP POLICY IF EXISTS "Anyone can view salary assets" ON storage.objects;
CREATE POLICY "Users can view their own salary assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'salary-assets' AND auth.uid() IS NOT NULL AND auth.uid()::text = (storage.foldername(name))[1]);