-- Create storage bucket for itinerary PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('itineraries', 'itineraries', true);

-- Create storage bucket for salary slip assets (logos, signatures)
INSERT INTO storage.buckets (id, name, public) VALUES ('salary-assets', 'salary-assets', true);

-- Storage policies for itineraries bucket
CREATE POLICY "Admins can upload itineraries"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'itineraries' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update itineraries"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'itineraries' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete itineraries"
ON storage.objects
FOR DELETE
USING (bucket_id = 'itineraries' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view itineraries"
ON storage.objects
FOR SELECT
USING (bucket_id = 'itineraries');

-- Storage policies for salary-assets bucket (user uploads)
CREATE POLICY "Authenticated users can upload salary assets"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'salary-assets' AND auth.uid() IS NOT NULL AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Authenticated users can update their salary assets"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'salary-assets' AND auth.uid() IS NOT NULL AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Authenticated users can delete their salary assets"
ON storage.objects
FOR DELETE
USING (bucket_id = 'salary-assets' AND auth.uid() IS NOT NULL AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view salary assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'salary-assets');

-- Create itineraries table
CREATE TABLE public.itineraries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  pdf_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on itineraries
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

-- RLS policies for itineraries
CREATE POLICY "Admins can manage itineraries"
ON public.itineraries
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view itineraries"
ON public.itineraries
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create trigger for itineraries updated_at
CREATE TRIGGER update_itineraries_updated_at
BEFORE UPDATE ON public.itineraries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create upcoming_events table
CREATE TABLE public.upcoming_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE,
  location TEXT,
  country TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on upcoming_events
ALTER TABLE public.upcoming_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for upcoming_events
CREATE POLICY "Admins can manage events"
ON public.upcoming_events
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view active events"
ON public.upcoming_events
FOR SELECT
USING (is_active = true);

-- Create trigger for upcoming_events updated_at
CREATE TRIGGER update_upcoming_events_updated_at
BEFORE UPDATE ON public.upcoming_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();