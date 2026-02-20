import { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Plane, ChevronRight, IndianRupee, Briefcase, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
  const [employmentType, setEmploymentType] = useState<'salaried' | 'business'>('salaried');
  
  // Salaried docs
  const [docSalarySlip, setDocSalarySlip] = useState(false);
  const [docItr3Years, setDocItr3Years] = useState(false);
  const [docCompanyNoc, setDocCompanyNoc] = useState(false);
  const [docPersonalBankStatement, setDocPersonalBankStatement] = useState(false);
  
  // Business docs
  const [docCompanyRegistration, setDocCompanyRegistration] = useState(false);
  const [docBusinessItr3Years, setDocBusinessItr3Years] = useState(false);
  const [docFirmBankStatement, setDocFirmBankStatement] = useState(false);
  const [docBusinessPersonalBankStatement, setDocBusinessPersonalBankStatement] = useState(false);

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
      employmentType,
      docSalarySlip,
      docItr3Years,
      docCompanyNoc,
      docPersonalBankStatement,
      docCompanyRegistration,
      docBusinessItr3Years,
      docFirmBankStatement,
      docBusinessPersonalBankStatement,
    });
  };

  const salariedDocs = [
    { id: 'salarySlip', label: 'Salary Slip', checked: docSalarySlip, onChange: setDocSalarySlip },
    { id: 'itr3Years', label: '3 Years ITR', checked: docItr3Years, onChange: setDocItr3Years },
    { id: 'companyNoc', label: 'Company NOC', checked: docCompanyNoc, onChange: setDocCompanyNoc },
    { id: 'personalBank', label: 'Personal Bank Statement', checked: docPersonalBankStatement, onChange: setDocPersonalBankStatement },
  ];

  const businessDocs = [
    { id: 'companyReg', label: 'Company Registration / GST Registration', checked: docCompanyRegistration, onChange: setDocCompanyRegistration },
    { id: 'bizItr3Years', label: '3 Years ITR', checked: docBusinessItr3Years, onChange: setDocBusinessItr3Years },
    { id: 'firmBank', label: 'Firm Bank Statement', checked: docFirmBankStatement, onChange: setDocFirmBankStatement },
    { id: 'bizPersonalBank', label: 'Personal Bank Statement', checked: docBusinessPersonalBankStatement, onChange: setDocBusinessPersonalBankStatement },
  ];

  const currentDocs = employmentType === 'salaried' ? salariedDocs : businessDocs;

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
      title: 'Employment Type',
      icon: Briefcase,
      content: (
        <RadioGroup
          value={employmentType}
          onValueChange={(v) => setEmploymentType(v as 'salaried' | 'business')}
          className="flex gap-4"
        >
          <Label
            className={`flex items-center rounded-lg border-2 p-4 cursor-pointer transition-all touch-target flex-1 ${
              employmentType === 'salaried' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
          >
            <RadioGroupItem value="salaried" className="mr-3" />
            <span className="font-medium">Salaried</span>
          </Label>
          <Label
            className={`flex items-center rounded-lg border-2 p-4 cursor-pointer transition-all touch-target flex-1 ${
              employmentType === 'business' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
          >
            <RadioGroupItem value="business" className="mr-3" />
            <span className="font-medium">Business</span>
          </Label>
        </RadioGroup>
      ),
    },
    {
      title: 'Documents Available',
      icon: FileText,
      subtitle: 'Complete all documents for bonus points',
      content: (
        <div className="space-y-3">
          <div className="flex items-center space-x-3 pb-2 border-b border-border">
            <Checkbox
              id="selectAll"
              checked={currentDocs.every((doc) => doc.checked)}
              onCheckedChange={(checked) => {
                const val = checked === true;
                currentDocs.forEach((doc) => doc.onChange(val));
              }}
            />
            <Label htmlFor="selectAll" className="text-sm font-semibold cursor-pointer flex-1">
              Select All
            </Label>
          </div>
          {currentDocs.map((doc) => (
            <div key={doc.id} className="flex items-center space-x-3">
              <Checkbox
                id={doc.id}
                checked={doc.checked}
                onCheckedChange={(checked) => doc.onChange(checked === true)}
              />
              <Label htmlFor={doc.id} className="text-sm font-medium cursor-pointer flex-1">
                {doc.label}
              </Label>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: 'Travel History',
      icon: Plane,
      subtitle: 'Select all that apply',
      content: (
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <Checkbox
              id="tier1"
              checked={travelHistoryTier1}
              onCheckedChange={(checked) => setTravelHistoryTier1(checked === true)}
            />
            <Label htmlFor="tier1" className="text-sm font-medium leading-none cursor-pointer flex-1">
              <p className="text-muted-foreground text-xs">{tier1Countries.join(', ')}</p>
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox
              id="tier2"
              checked={travelHistoryTier2}
              onCheckedChange={(checked) => setTravelHistoryTier2(checked === true)}
            />
            <Label htmlFor="tier2" className="text-sm font-medium leading-none cursor-pointer flex-1">
              <p className="text-muted-foreground text-xs">{tier2Countries.join(', ')}</p>
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox
              id="tier3"
              checked={travelHistoryTier3}
              onCheckedChange={(checked) => setTravelHistoryTier3(checked === true)}
            />
            <Label htmlFor="tier3" className="text-sm font-medium leading-none cursor-pointer flex-1">
              <p className="text-muted-foreground text-xs">{tier3Countries.join(', ')}</p>
            </Label>
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