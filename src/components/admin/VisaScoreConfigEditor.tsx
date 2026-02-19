import { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CountryConfig {
  id: string;
  country: string;
  max_score: number;
  base_score: number;
  tier1_bonus: number;
  tier2_bonus: number;
  tier3_bonus: number;
  income_below_3lac: number;
  income_3_to_5lac: number;
  income_5_to_10lac: number;
  income_10_to_17lac: number;
  income_above_17lac: number;
}

export function VisaScoreConfigEditor() {
  const [configs, setConfigs] = useState<CountryConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('visa_country_configs')
      .select('*')
      .order('country');
    if (error) {
      toast.error('Failed to load configs');
    } else {
      setConfigs(data || []);
    }
    setLoading(false);
  };

  const handleChange = (id: string, field: keyof CountryConfig, value: number) => {
    setConfigs(prev =>
      prev.map(c => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const handleSave = async (config: CountryConfig) => {
    setSavingId(config.id);
    const { error } = await supabase
      .from('visa_country_configs')
      .update({
        max_score: config.max_score,
        base_score: config.base_score,
        tier1_bonus: config.tier1_bonus,
        tier2_bonus: config.tier2_bonus,
        tier3_bonus: config.tier3_bonus,
        income_below_3lac: config.income_below_3lac,
        income_3_to_5lac: config.income_3_to_5lac,
        income_5_to_10lac: config.income_5_to_10lac,
        income_10_to_17lac: config.income_10_to_17lac,
        income_above_17lac: config.income_above_17lac,
      })
      .eq('id', config.id);

    if (error) {
      toast.error(`Failed to save ${config.country}`);
    } else {
      toast.success(`${config.country} updated`);
    }
    setSavingId(null);
  };

  const fields: { key: keyof CountryConfig; label: string }[] = [
    { key: 'max_score', label: 'Max Score' },
    { key: 'base_score', label: 'Base Score' },
    { key: 'tier1_bonus', label: 'Tier 1 Bonus' },
    { key: 'tier2_bonus', label: 'Tier 2 Bonus' },
    { key: 'tier3_bonus', label: 'Tier 3 Bonus' },
    { key: 'income_below_3lac', label: 'Income <3L' },
    { key: 'income_3_to_5lac', label: 'Income 3-5L' },
    { key: 'income_5_to_10lac', label: 'Income 5-10L' },
    { key: 'income_10_to_17lac', label: 'Income 10-17L' },
    { key: 'income_above_17lac', label: 'Income >17L' },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {configs.map((config) => (
        <Card key={config.id}>
          <CardHeader
            className="cursor-pointer py-3 px-4"
            onClick={() => setExpandedId(expandedId === config.id ? null : config.id)}
          >
            <CardTitle className="text-sm flex items-center justify-between">
              <span>{config.country}</span>
              <span className="text-xs text-muted-foreground font-normal">
                Base: {config.base_score} / Max: {config.max_score}
              </span>
            </CardTitle>
          </CardHeader>
          {expandedId === config.id && (
            <CardContent className="px-4 pb-4 pt-0 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {fields.map((f) => (
                  <div key={f.key}>
                    <Label className="text-xs text-muted-foreground">{f.label}</Label>
                    <Input
                      type="number"
                      value={config[f.key] as number}
                      onChange={(e) => handleChange(config.id, f.key, Number(e.target.value))}
                      className="h-8 text-sm"
                      min={0}
                    />
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                onClick={() => handleSave(config)}
                disabled={savingId === config.id}
                className="w-full"
              >
                {savingId === config.id ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
