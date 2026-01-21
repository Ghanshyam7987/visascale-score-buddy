import { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Target, Plane, Wallet, Briefcase, Building2, Users, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { VisaScoreInput, popularCountries } from '@/lib/visaScoreCalculator';

interface VisaScoreFormProps {
  onSubmit: (data: VisaScoreInput) => void;
  isLoading?: boolean;
}

export function VisaScoreForm({ onSubmit, isLoading }: VisaScoreFormProps) {
  const [country, setCountry] = useState('');
  const [purpose, setPurpose] = useState<VisaScoreInput['purpose']>('tourist');
  const [travelHistory, setTravelHistory] = useState(false);
  const [financialStrength, setFinancialStrength] = useState<VisaScoreInput['financialStrength']>('medium');
  const [employmentType, setEmploymentType] = useState<VisaScoreInput['employmentType']>('salaried');
  const [bankBalanceRange, setBankBalanceRange] = useState<VisaScoreInput['bankBalanceRange']>('medium');
  const [hasSponsor, setHasSponsor] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      country,
      purpose,
      travelHistory,
      financialStrength,
      employmentType,
      bankBalanceRange,
      hasSponsor,
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
      title: 'Purpose of Travel',
      icon: Target,
      content: (
        <RadioGroup
          value={purpose}
          onValueChange={(v) => setPurpose(v as VisaScoreInput['purpose'])}
          className="grid grid-cols-2 gap-3"
        >
          {[
            { value: 'tourist', label: 'Tourist' },
            { value: 'business', label: 'Business' },
            { value: 'student', label: 'Student' },
            { value: 'work', label: 'Work' },
          ].map((item) => (
            <Label
              key={item.value}
              className={`flex items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-all touch-target ${
                purpose === item.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <RadioGroupItem value={item.value} className="sr-only" />
              <span className="font-medium">{item.label}</span>
            </Label>
          ))}
        </RadioGroup>
      ),
    },
    {
      title: 'Travel History',
      icon: Plane,
      content: (
        <RadioGroup
          value={travelHistory ? 'yes' : 'no'}
          onValueChange={(v) => setTravelHistory(v === 'yes')}
          className="grid grid-cols-2 gap-3"
        >
          <Label
            className={`flex items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-all touch-target ${
              travelHistory
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <RadioGroupItem value="yes" className="sr-only" />
            <span className="font-medium">Yes, I have</span>
          </Label>
          <Label
            className={`flex items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-all touch-target ${
              !travelHistory
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <RadioGroupItem value="no" className="sr-only" />
            <span className="font-medium">No</span>
          </Label>
        </RadioGroup>
      ),
    },
    {
      title: 'Financial Strength',
      icon: Wallet,
      content: (
        <RadioGroup
          value={financialStrength}
          onValueChange={(v) => setFinancialStrength(v as VisaScoreInput['financialStrength'])}
          className="grid grid-cols-3 gap-3"
        >
          {[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ].map((item) => (
            <Label
              key={item.value}
              className={`flex items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-all touch-target ${
                financialStrength === item.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <RadioGroupItem value={item.value} className="sr-only" />
              <span className="font-medium">{item.label}</span>
            </Label>
          ))}
        </RadioGroup>
      ),
    },
    {
      title: 'Employment Type',
      icon: Briefcase,
      content: (
        <RadioGroup
          value={employmentType}
          onValueChange={(v) => setEmploymentType(v as VisaScoreInput['employmentType'])}
          className="grid grid-cols-3 gap-2"
        >
          {[
            { value: 'salaried', label: 'Salaried' },
            { value: 'self_employed', label: 'Self-Employed' },
            { value: 'business', label: 'Business' },
          ].map((item) => (
            <Label
              key={item.value}
              className={`flex items-center justify-center rounded-lg border-2 p-3 cursor-pointer transition-all touch-target text-center ${
                employmentType === item.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <RadioGroupItem value={item.value} className="sr-only" />
              <span className="font-medium text-sm">{item.label}</span>
            </Label>
          ))}
        </RadioGroup>
      ),
    },
    {
      title: 'Bank Balance Range',
      icon: Building2,
      content: (
        <RadioGroup
          value={bankBalanceRange}
          onValueChange={(v) => setBankBalanceRange(v as VisaScoreInput['bankBalanceRange'])}
          className="space-y-3"
        >
          {[
            { value: 'low', label: 'Below ₹5 Lakhs' },
            { value: 'medium', label: '₹5 - 15 Lakhs' },
            { value: 'high', label: 'Above ₹15 Lakhs' },
          ].map((item) => (
            <Label
              key={item.value}
              className={`flex items-center rounded-lg border-2 p-4 cursor-pointer transition-all touch-target ${
                bankBalanceRange === item.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <RadioGroupItem value={item.value} className="mr-3" />
              <span className="font-medium">{item.label}</span>
            </Label>
          ))}
        </RadioGroup>
      ),
    },
    {
      title: 'Sponsor/Invitation',
      icon: Users,
      content: (
        <RadioGroup
          value={hasSponsor ? 'yes' : 'no'}
          onValueChange={(v) => setHasSponsor(v === 'yes')}
          className="grid grid-cols-2 gap-3"
        >
          <Label
            className={`flex items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-all touch-target ${
              hasSponsor
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <RadioGroupItem value="yes" className="sr-only" />
            <span className="font-medium">Yes</span>
          </Label>
          <Label
            className={`flex items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-all touch-target ${
              !hasSponsor
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <RadioGroupItem value="no" className="sr-only" />
            <span className="font-medium">No</span>
          </Label>
        </RadioGroup>
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
                <h3 className="font-semibold">{section.title}</h3>
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
