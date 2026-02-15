import { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Plane, ChevronRight, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { VisaScoreInput, popularCountries, tier1Countries, tier2Countries, tier3Countries, getIncomeBracket } from '@/lib/visaScoreCalculator';

interface VisaScoreFormProps {
  onSubmit: (data: VisaScoreInput) => void;
  isLoading?: boolean;
}

export function VisaScoreForm({ onSubmit, isLoading }: VisaScoreFormProps) {
  const [country, setCountry] = useState('');
  const [travelHistoryTier1, setTravelHistoryTier1] = useState(false);
  const [travelHistoryTier2, setTravelHistoryTier2] = useState(false);
  const [travelHistoryTier3, setTravelHistoryTier3] = useState(false);
  const [yearlyIncomeAmount, setYearlyIncomeAmount] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(yearlyIncomeAmount) || 0;
    onSubmit({
      country,
      purpose: 'tourist',
      travelHistoryTier1,
      travelHistoryTier2,
      travelHistoryTier3,
      yearlyIncome: getIncomeBracket(amount),
      yearlyIncomeAmount: amount,
    });
  };

  const formSections = [
    {
      title: 'Destination Country',
      icon: Globe,
      content: (
        <Select value={country} onValueChange={setCountry} required>
          <SelectTrigger className="w-full touch-target">
            <SelectValue placeholder="Select country" />
          </SelectTrigger>
          <SelectContent>
            {popularCountries.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      title: 'Travel History',
      icon: Plane,
      subtitle: 'Select all that apply (highest tier will be counted)',
      content: (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="tier1"
                checked={travelHistoryTier1}
                onCheckedChange={(checked) => setTravelHistoryTier1(checked === true)}
              />
              <Label 
                htmlFor="tier1" 
                className="text-sm font-medium leading-none cursor-pointer flex-1"
              >
                <p className="text-muted-foreground text-xs">
                  {tier1Countries.join(', ')}
                </p>
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="tier2"
                checked={travelHistoryTier2}
                onCheckedChange={(checked) => setTravelHistoryTier2(checked === true)}
              />
              <Label 
                htmlFor="tier2" 
                className="text-sm font-medium leading-none cursor-pointer flex-1"
              >
                <p className="text-muted-foreground text-xs">
                  {tier2Countries.join(', ')}
                </p>
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="tier3"
                checked={travelHistoryTier3}
                onCheckedChange={(checked) => setTravelHistoryTier3(checked === true)}
              />
              <Label 
                htmlFor="tier3" 
                className="text-sm font-medium leading-none cursor-pointer flex-1"
              >
                <p className="text-muted-foreground text-xs">
                  {tier3Countries.join(', ')}
                </p>
              </Label>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Yearly Income',
      icon: IndianRupee,
      content: (
        <div className="space-y-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">₹</span>
            <Input
              type="number"
              placeholder="Enter yearly income"
              value={yearlyIncomeAmount}
              onChange={(e) => setYearlyIncomeAmount(e.target.value)}
              className="pl-8 touch-target"
              min={0}
            />
          </div>
          <p className="text-xs text-muted-foreground">Enter your annual income in INR</p>
        </div>
      ),
    },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formSections.map((section, index) => (
        <motion.div
          key={section.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-primary/10">
                  <section.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{section.title}</h3>
                  {section.subtitle && (
                    <p className="text-xs text-muted-foreground">{section.subtitle}</p>
                  )}
                </div>
              </div>
              {section.content}
            </CardContent>
          </Card>
        </motion.div>
      ))}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: formSections.length * 0.1 }}
      >
        <Button
          type="submit"
          className="w-full gradient-primary text-primary-foreground touch-target text-lg font-semibold"
          disabled={!country || isLoading}
        >
          Calculate VisaScore
          <ChevronRight className="ml-2 h-5 w-5" />
        </Button>
      </motion.div>
    </form>
  );
}
