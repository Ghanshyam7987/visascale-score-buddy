
-- Create visa_news table
CREATE TABLE public.visa_news (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  country TEXT,
  source_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.visa_news ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view active news"
ON public.visa_news
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage news"
ON public.visa_news
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_visa_news_updated_at
BEFORE UPDATE ON public.visa_news
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
