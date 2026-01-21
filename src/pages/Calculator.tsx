import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { VisaScoreForm } from '@/components/visa/VisaScoreForm';
import { VisaScoreResult } from '@/components/visa/VisaScoreResult';
import { VisaScoreInput, calculateVisaScore, getApprovalSuggestions } from '@/lib/visaScoreCalculator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const Calculator = () => {
  const [result, setResult] = useState<{ score: number; category: 'Low' | 'Medium' | 'High'; country: string; suggestions: string[] } | null>(null);
  const { user } = useAuth();

  const handleSubmit = async (data: VisaScoreInput) => {
    const { score, category } = calculateVisaScore(data);
    const suggestions = getApprovalSuggestions(data, score);

    // Save to database
    if (user) {
      await supabase.from('visa_score_calculations').insert({
        user_id: user.id,
        country: data.country,
        purpose: data.purpose,
        travel_history: data.travelHistory,
        financial_strength: data.financialStrength,
        employment_type: data.employmentType,
        bank_balance_range: data.bankBalanceRange,
        has_sponsor: data.hasSponsor,
        visa_score: score,
        approval_category: category,
      });
    }

    setResult({ score, category, country: data.country, suggestions });
  };

  return (
    <AppLayout>
      <Header title="VisaScore Calculator" showBack />
      <div className="p-4">
        {result ? (
          <VisaScoreResult {...result} onReset={() => setResult(null)} />
        ) : (
          <VisaScoreForm onSubmit={handleSubmit} />
        )}
      </div>
    </AppLayout>
  );
};

export default Calculator;
