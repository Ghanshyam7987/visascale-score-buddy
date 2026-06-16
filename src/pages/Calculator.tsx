import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { VisaScoreForm } from '@/components/visa/VisaScoreForm';
import { VisaScoreResult } from '@/components/visa/VisaScoreResult';
import { VisaScoreInput, calculateVisaScore, getApprovalSuggestions } from '@/lib/visaScoreCalculator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useVisaCountryConfigs } from '@/hooks/useVisaCountryConfigs';
import { Loader2 } from 'lucide-react';
import { BankAnalyzerStep } from '@/components/funnel/BankAnalyzerStep';
import { CoverLetterStep } from '@/components/funnel/CoverLetterStep';
import type { VOResult } from '@/lib/voMathEngine';

const Calculator = () => {
  const [result, setResult] = useState<{ score: number; category: 'Low' | 'Medium' | 'High'; country: string; suggestions: string[] } | null>(null);
  const [voResult, setVoResult] = useState<VOResult | null>(null);
  const { user } = useAuth();
  const { configs, loading: configsLoading } = useVisaCountryConfigs();

  const handleSubmit = async (data: VisaScoreInput) => {
    const { score, category } = calculateVisaScore(data, configs);
    const suggestions = getApprovalSuggestions(data, score);

    // Save to database
    if (user) {
      await supabase.from('visa_score_calculations').insert({
        user_id: user.id,
        country: data.country,
        purpose: data.purpose,
        travel_history: data.travelHistoryTier1 || data.travelHistoryTier2 || data.travelHistoryTier3,
        financial_strength: data.yearlyIncome === 'above_17lac' ? 'high' : data.yearlyIncome === '10_to_17lac' ? 'medium' : 'low',
        employment_type: data.employmentType,
        bank_balance_range: data.yearlyIncome === 'above_17lac' ? 'high' : data.yearlyIncome === '10_to_17lac' ? 'medium' : 'low',
        has_sponsor: false,
        visa_score: score,
        approval_category: category,
      });
    }

    setResult({ score, category, country: data.country, suggestions });
    setVoResult(null);
  };

  return (
    <AppLayout>
      <Header title="VisaScore Calculator" showBack />
      <div className="p-4">
        {configsLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : result ? (
          <div className="space-y-10">
            <VisaScoreResult {...result} onReset={() => { setResult(null); setVoResult(null); }} />
            <BankAnalyzerStep onComplete={(vo) => setVoResult(vo)} />
            {voResult && (
              <CoverLetterStep
                country={result.country}
                score={result.score}
                category={result.category}
                voResult={voResult}
              />
            )}
          </div>
        ) : (
          <VisaScoreForm onSubmit={handleSubmit} />
        )}
      </div>
    </AppLayout>
  );
};

export default Calculator;
