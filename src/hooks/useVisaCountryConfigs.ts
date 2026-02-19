import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CountryScoreConfig, countryConfigs as defaultConfigs } from '@/lib/visaScoreCalculator';

export function useVisaCountryConfigs() {
  const [configs, setConfigs] = useState<Record<string, CountryScoreConfig>>(defaultConfigs);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfigs = async () => {
      const { data } = await supabase.from('visa_country_configs').select('*');
      if (data && data.length > 0) {
        const mapped: Record<string, CountryScoreConfig> = {};
        for (const row of data) {
          mapped[row.country] = {
            maxScore: row.max_score,
            baseScore: row.base_score,
            tier1Bonus: row.tier1_bonus,
            tier2Bonus: row.tier2_bonus,
            tier3Bonus: row.tier3_bonus,
            incomeScores: {
              below_3lac: row.income_below_3lac,
              '3_to_5lac': row.income_3_to_5lac,
              '5_to_10lac': row.income_5_to_10lac,
              '10_to_17lac': row.income_10_to_17lac,
              above_17lac: row.income_above_17lac,
            },
          };
        }
        setConfigs(mapped);
      }
      setLoading(false);
    };
    fetchConfigs();
  }, []);

  return { configs, loading };
}
