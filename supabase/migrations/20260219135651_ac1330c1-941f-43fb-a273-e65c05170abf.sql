
-- Create table for editable visa score country configs
CREATE TABLE public.visa_country_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country TEXT NOT NULL UNIQUE,
  max_score INTEGER NOT NULL DEFAULT 99,
  base_score INTEGER NOT NULL DEFAULT 50,
  tier1_bonus INTEGER NOT NULL DEFAULT 20,
  tier2_bonus INTEGER NOT NULL DEFAULT 10,
  tier3_bonus INTEGER NOT NULL DEFAULT 5,
  income_below_3lac INTEGER NOT NULL DEFAULT 0,
  income_3_to_5lac INTEGER NOT NULL DEFAULT 5,
  income_5_to_10lac INTEGER NOT NULL DEFAULT 10,
  income_10_to_17lac INTEGER NOT NULL DEFAULT 20,
  income_above_17lac INTEGER NOT NULL DEFAULT 24,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.visa_country_configs ENABLE ROW LEVEL SECURITY;

-- Admins can manage configs
CREATE POLICY "Admins can manage country configs"
ON public.visa_country_configs
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can read configs (needed for calculator)
CREATE POLICY "Anyone can view country configs"
ON public.visa_country_configs
FOR SELECT
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_visa_country_configs_updated_at
BEFORE UPDATE ON public.visa_country_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed with current hardcoded values
INSERT INTO public.visa_country_configs (country, max_score, base_score, tier1_bonus, tier2_bonus, tier3_bonus, income_below_3lac, income_3_to_5lac, income_5_to_10lac, income_10_to_17lac, income_above_17lac) VALUES
('United States of America', 90, 40, 20, 10, 5, 0, 1, 5, 10, 15),
('Canada', 95, 45, 20, 10, 5, 0, 1, 5, 10, 15),
('United Kingdom', 99, 50, 20, 10, 5, 0, 5, 10, 19, 24),
('Schengen Area', 95, 50, 20, 10, 5, 0, 5, 10, 18, 24),
('Australia', 99, 50, 20, 10, 5, 0, 5, 10, 21, 24),
('New Zealand', 99, 50, 20, 10, 5, 0, 5, 10, 21, 24),
('Japan', 99, 50, 20, 10, 5, 0, 5, 10, 22, 24),
('South Africa', 99, 50, 20, 10, 5, 0, 5, 10, 22, 24),
('South Korea', 99, 50, 20, 10, 5, 0, 5, 10, 22, 24),
('Brazil', 99, 50, 20, 10, 5, 0, 5, 10, 22, 24),
('Switzerland', 99, 50, 20, 10, 5, 0, 5, 10, 22, 24),
('France', 99, 50, 20, 10, 5, 0, 5, 10, 22, 24),
('Turkey', 99, 50, 20, 10, 5, 0, 5, 10, 22, 24),
('Ireland', 99, 50, 20, 10, 5, 0, 5, 10, 22, 24),
('Other European Countries', 99, 50, 20, 10, 5, 0, 5, 10, 20, 24);
