import { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Plane, ChevronRight, IndianRupee, Briefcase, FileText, Stamp, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

import { VisaScoreInput, popularCountries, tier1Countries, tier2Countries, tier3Countries, allTravelCountries, getIncomeBracket, isSponsoredType, isSalariedDocType } from '@/lib/visaScoreCalculator';

interface VisaScoreFormProps {
  onSubmit: (data: VisaScoreInput) => void;
  isLoading?: boolean;
}

export function VisaScoreForm({ onSubmit, isLoading }: VisaScoreFormProps) {
  const [country, setCountry] = useState('');
  const [selectedTier1, setSelectedTier1] = useState<string[]>([]);
  const [selectedTier2, setSelectedTier2] = useState<string[]>([]);
  const [selectedTier3, setSelectedTier3] = useState<string[]>([]);
  const [visaIssuedNotTravelledCountries, setVisaIssuedNotTravelledCountries] = useState<string[]>([]);
  const [yearlyIncomeAmount, setYearlyIncomeAmount] = useState('');
  const [sponsorYearlyIncomeAmount, setSponsorYearlyIncomeAmount] = useState('');
  const [employmentType, setEmploymentType] = useState<VisaScoreInput['employmentType']>('salaried');
  
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

  // Sponsor docs (combined salaried + business)
  const [docSponsorSalarySlip, setDocSponsorSalarySlip] = useState(false);
  const [docSponsorItr3Years, setDocSponsorItr3Years] = useState(false);
  const [docSponsorCompanyNoc, setDocSponsorCompanyNoc] = useState(false);
  const [docSponsorPersonalBankStatement, setDocSponsorPersonalBankStatement] = useState(false);
  const [docSponsorCompanyRegistration, setDocSponsorCompanyRegistration] = useState(false);
  const [docSponsorFirmBankStatement, setDocSponsorFirmBankStatement] = useState(false);

  const toggleCountryInTier = (country: string, selected: string[], setSelected: React.Dispatch<React.SetStateAction<string[]>>) => {
    setSelected(prev => prev.includes(country) ? prev.filter(c => c !== country) : [...prev, country]);
  };

  const toggleVisaIssuedCountry = (country: string) => {
    setVisaIssuedNotTravelledCountries(prev =>
      prev.includes(country) ? prev.filter(c => c !== country) : [...prev, country]
    );
  };

  const sponsored = isSponsoredType(employmentType);
  const salariedType = isSalariedDocType(employmentType);
  const needsSponsorIncome = sponsored || employmentType === 'salaried_sponsored' || employmentType === 'self_business_sponsored';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(yearlyIncomeAmount) || 0;
    const sponsorAmount = Number(sponsorYearlyIncomeAmount) || 0;
    onSubmit({
      country,
      purpose: 'tourist',
      travelHistoryTier1: selectedTier1.length > 0,
      travelHistoryTier2: selectedTier2.length > 0,
      travelHistoryTier3: selectedTier3.length > 0,
      travelHistoryTier4: false,
      tier1CountryCount: selectedTier1.length,
      tier2CountryCount: selectedTier2.length,
      tier3CountryCount: selectedTier3.length,
      tier4CountryCount: 0,
      visaIssuedNotTravelled: visaIssuedNotTravelledCountries.length > 0,
      visaIssuedNotTravelledCountries,
      yearlyIncome: getIncomeBracket(amount),
      yearlyIncomeAmount: amount,
      sponsorYearlyIncome: needsSponsorIncome ? getIncomeBracket(sponsorAmount) : undefined,
      sponsorYearlyIncomeAmount: needsSponsorIncome ? sponsorAmount : undefined,
      employmentType,
      docSalarySlip: salariedType ? docSalarySlip : undefined,
      docItr3Years: salariedType ? docItr3Years : undefined,
      docCompanyNoc: salariedType ? docCompanyNoc : undefined,
      docPersonalBankStatement: salariedType ? docPersonalBankStatement : undefined,
      docCompanyRegistration: (!salariedType && !sponsored) ? docCompanyRegistration : undefined,
      docBusinessItr3Years: (!salariedType && !sponsored) ? docBusinessItr3Years : undefined,
      docFirmBankStatement: (!salariedType && !sponsored) ? docFirmBankStatement : undefined,
      docBusinessPersonalBankStatement: (!salariedType && !sponsored) ? docBusinessPersonalBankStatement : undefined,
      docSponsorSalarySlip: sponsored ? docSponsorSalarySlip : undefined,
      docSponsorItr3Years: sponsored ? docSponsorItr3Years : undefined,
      docSponsorCompanyNoc: sponsored ? docSponsorCompanyNoc : undefined,
      docSponsorPersonalBankStatement: sponsored ? docSponsorPersonalBankStatement : undefined,
      docSponsorCompanyRegistration: sponsored ? docSponsorCompanyRegistration : undefined,
      docSponsorFirmBankStatement: sponsored ? docSponsorFirmBankStatement : undefined,
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

  // Sponsor docs: combined salaried + business list
  const sponsorDocs = [
    { id: 'spSalarySlip', label: 'Sponsor Salary Slip', checked: docSponsorSalarySlip, onChange: setDocSponsorSalarySlip },
    { id: 'spItr3Years', label: 'Sponsor 3 Years ITR', checked: docSponsorItr3Years, onChange: setDocSponsorItr3Years },
    { id: 'spCompanyNoc', label: 'Sponsor Company NOC', checked: docSponsorCompanyNoc, onChange: setDocSponsorCompanyNoc },
    { id: 'spPersonalBank', label: 'Sponsor Personal Bank Statement', checked: docSponsorPersonalBankStatement, onChange: setDocSponsorPersonalBankStatement },
    { id: 'spCompanyReg', label: 'Sponsor Company Registration / GST', checked: docSponsorCompanyRegistration, onChange: setDocSponsorCompanyRegistration },
    { id: 'spFirmBank', label: 'Sponsor Firm Bank Statement', checked: docSponsorFirmBankStatement, onChange: setDocSponsorFirmBankStatement },
  ];

  const getCurrentDocs = () => {
    if (employmentType === 'salaried_sponsored') return { applicantDocs: salariedDocs, sponsorDocs };
    if (employmentType === 'self_business_sponsored') return { applicantDocs: businessDocs, sponsorDocs };
    if (sponsored) return { applicantDocs: null, sponsorDocs };
    if (salariedType) return { applicantDocs: salariedDocs, sponsorDocs: null };
    return { applicantDocs: businessDocs, sponsorDocs: null };
  };

  const { applicantDocs, sponsorDocs: currentSponsorDocs } = getCurrentDocs();

  const renderTierCountries = (
    countries: string[],
    selected: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>,
    tierLabel: string
  ) => (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground mb-2">{tierLabel}</p>
      <div className="flex flex-wrap gap-2">
        {countries.map((c) => (
          <Label
            key={c}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-all text-xs ${
              selected.includes(c) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
            }`}
          >
            <Checkbox
              checked={selected.includes(c)}
              onCheckedChange={() => toggleCountryInTier(c, selected, setSelected)}
              className="h-3.5 w-3.5"
            />
            {c}
          </Label>
        ))}
      </div>
    </div>
  );

  const renderDocGroup = (docs: typeof salariedDocs, groupTitle?: string) => (
    <div className="space-y-3">
      {groupTitle && <p className="text-xs font-semibold text-muted-foreground border-b border-border pb-1">{groupTitle}</p>}
      <div className="flex items-center space-x-3 pb-2 border-b border-border">
        <Checkbox
          id={`selectAll-${groupTitle || 'main'}`}
          checked={docs.every((doc) => doc.checked)}
          onCheckedChange={(checked) => {
            const val = checked === true;
            docs.forEach((doc) => doc.onChange(val));
          }}
        />
        <Label htmlFor={`selectAll-${groupTitle || 'main'}`} className="text-sm font-semibold cursor-pointer flex-1">
          Select All
        </Label>
      </div>
      {docs.map((doc) => (
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
  );

  const docsSection = {
    title: 'Documents Available',
    icon: FileText,
    subtitle: (employmentType === 'salaried_sponsored' || employmentType === 'self_business_sponsored')
      ? 'Tick your documents + sponsor\'s documents'
      : sponsored
        ? 'Tick applicable documents of sponsor person (Salaried & Business both)'
        : 'Complete all documents for bonus points',
    content: (
      <div className="space-y-5">
        {applicantDocs && renderDocGroup(applicantDocs, (currentSponsorDocs ? 'Your Documents' : undefined))}
        {currentSponsorDocs && renderDocGroup(currentSponsorDocs, (applicantDocs ? 'Sponsor\'s Documents' : undefined))}
      </div>
    ),
  };

  const incomeSection = {
    title: 'Yearly Income',
    icon: IndianRupee,
    content: (
      <div className="space-y-4">
        <div className="space-y-2">
          {needsSponsorIncome && (
            <p className="text-xs font-semibold text-muted-foreground">Applicant's Income</p>
          )}
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
        {needsSponsorIncome && (
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground">Sponsor's Income</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">₹</span>
              <Input
                type="number"
                placeholder="Enter sponsor's yearly income"
                value={sponsorYearlyIncomeAmount}
                onChange={(e) => setSponsorYearlyIncomeAmount(e.target.value)}
                className="pl-8 touch-target"
                min={0}
              />
            </div>
            <p className="text-xs text-muted-foreground">Enter sponsor's annual income in INR</p>
          </div>
        )}
      </div>
    ),
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
      title: 'Employment Type',
      icon: Briefcase,
      content: (
        <Select value={employmentType} onValueChange={(v) => setEmploymentType(v as typeof employmentType)}>
          <SelectTrigger className="w-full touch-target">
            <SelectValue placeholder="Select employment type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="salaried">Salaried</SelectItem>
            <SelectItem value="self_business">Self Business</SelectItem>
            <SelectItem value="salaried_sponsored">Salaried but Sponsored</SelectItem>
            <SelectItem value="self_business_sponsored">Self Business but Sponsored</SelectItem>
            <SelectItem value="sponsored_mother">Sponsored (by Mother)</SelectItem>
            <SelectItem value="sponsored_father">Sponsored (by Father)</SelectItem>
            <SelectItem value="sponsored_husband">Sponsored (by Husband)</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    docsSection,
    {
      title: 'Travel History',
      icon: Plane,
      subtitle: 'Select countries you have traveled to',
      content: (
        <div className="space-y-4">
          {renderTierCountries(tier1Countries, selectedTier1, setSelectedTier1, 'Tier 1 — Major Countries')}
          {renderTierCountries(tier2Countries, selectedTier2, setSelectedTier2, 'Tier 2 — Best of Schengen & Important Countries')}
          {renderTierCountries(tier3Countries, selectedTier3, setSelectedTier3, 'Tier 3 — Asian & Other Countries')}
        </div>
      ),
    },
    {
      title: 'Visa Issued But Not Travelled',
      icon: Stamp,
      subtitle: 'Select countries where visa was issued but you didn\'t travel',
      content: (
        <div className="space-y-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between touch-target text-left font-normal">
                {visaIssuedNotTravelledCountries.length > 0
                  ? `${visaIssuedNotTravelledCountries.length} country/countries selected`
                  : 'Select countries'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <ScrollArea className="h-[250px] p-3">
                <div className="space-y-2">
                  {allTravelCountries.map((c) => (
                    <div key={c} className="flex items-center space-x-3">
                      <Checkbox
                        id={`visa-issued-${c}`}
                        checked={visaIssuedNotTravelledCountries.includes(c)}
                        onCheckedChange={() => toggleVisaIssuedCountry(c)}
                      />
                      <Label htmlFor={`visa-issued-${c}`} className="text-sm cursor-pointer flex-1">{c}</Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
          {visaIssuedNotTravelledCountries.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {visaIssuedNotTravelledCountries.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive text-xs px-2.5 py-1 border border-destructive/20">
                  {c}
                  <button type="button" onClick={() => toggleVisaIssuedCountry(c)} className="hover:bg-destructive/20 rounded-full p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {visaIssuedNotTravelledCountries.length > 0 && (
            <p className="text-xs text-destructive pl-1">
              ⚠️ {visaIssuedNotTravelledCountries.length} country/countries selected — score will be reduced
            </p>
          )}
        </div>
      ),
    },
    incomeSection,
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
                  {'subtitle' in section && (section as { subtitle?: string }).subtitle && (
                    <p className="text-xs text-muted-foreground">{(section as { subtitle?: string }).subtitle}</p>
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