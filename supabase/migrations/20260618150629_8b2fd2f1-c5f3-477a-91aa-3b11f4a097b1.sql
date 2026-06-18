
CREATE POLICY "Users read own dataset files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'datasets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own dataset files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'datasets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own dataset files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'datasets' AND auth.uid()::text = (storage.foldername(name))[1]);
