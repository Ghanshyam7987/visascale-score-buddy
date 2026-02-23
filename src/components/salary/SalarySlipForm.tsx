import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { User, Briefcase, Building2, Calendar, DollarSign, Download, Loader2, Upload, Image, PenTool, Info, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { generateSalarySlipPDF, SalarySlipData, essentialRequirements } from '@/lib/salarySlipGenerator';
import { useToast } from '@/hooks/use-toast';
import { toast } from 'sonner';

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 10 }, (_, i) => (currentYear - i).toString());

export function SalarySlipForm() {
  const { toast: toastHook } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<SalarySlipData>({
    employeeName: '',
    designation: '',
    companyName: '',
    month: months[new Date().getMonth()],
    year: currentYear.toString(),
    basicSalary: 0,
    hra: 0,
    da: 0,
    otherAllowances: 0,
    pf: 0,
    tax: 0,
    otherDeductions: 0,
  });

  const handleInputChange = (field: keyof SalarySlipData, value: string | number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'signature') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size should be less than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (type === 'logo') {
        setLogoPreview(base64);
        handleInputChange('logoBase64', base64);
      } else {
        setSignaturePreview(base64);
        handleInputChange('signatureBase64', base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGeneratePDF = () => {
    if (!formData.employeeName || !formData.designation) {
      toastHook({
        title: 'Missing Information',
        description: 'Please fill in employee name and designation.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    setTimeout(() => {
      try {
        generateSalarySlipPDF(formData);
        toastHook({
          title: 'PDF Generated!',
          description: 'Your salary slip has been downloaded.',
        });
      } catch (error) {
        toastHook({
          title: 'Generation Failed',
          description: 'Could not generate PDF. Please try again.',
          variant: 'destructive',
        });
      }
      setIsGenerating(false);
    }, 500);
  };

  const grossSalary = formData.basicSalary + formData.hra + formData.da + formData.otherAllowances;
  const totalDeductions = formData.pf + formData.tax + formData.otherDeductions;
  const netSalary = grossSalary - totalDeductions;

  return (
    <div className="space-y-5 pb-24">
      {/* Essential Requirements */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Alert className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl">
          <Info className="h-4 w-4 text-primary" />
          <AlertTitle className="text-primary font-bold">Essential Requirements for Visa</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {essentialRequirements.map((req, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      </motion.div>

      {/* Employee Details */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="rounded-2xl border-2 border-border/50 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              Employee Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="employeeName" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employee Name *</Label>
              <Input
                id="employeeName"
                placeholder="Enter full name"
                value={formData.employeeName}
                onChange={(e) => handleInputChange('employeeName', e.target.value)}
                className="touch-target rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="designation" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Designation *</Label>
              <Input
                id="designation"
                placeholder="e.g., Software Engineer"
                value={formData.designation}
                onChange={(e) => handleInputChange('designation', e.target.value)}
                className="touch-target rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Company Name (Optional)</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="companyName"
                  placeholder="Enter company name"
                  value={formData.companyName}
                  onChange={(e) => handleInputChange('companyName', e.target.value)}
                  className="pl-10 touch-target rounded-xl"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Branding */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="rounded-2xl border-2 border-border/50 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Image className="h-4 w-4 text-primary" />
              </div>
              Branding & Signature
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Logo */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Company Logo</Label>
                <input type="file" ref={logoInputRef} accept="image/*" onChange={(e) => handleFileUpload(e, 'logo')} className="hidden" />
                <div
                  onClick={() => logoInputRef.current?.click()}
                  className="border-2 border-dashed border-border/60 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all min-h-[100px]"
                >
                  {logoPreview ? (
                    <div className="relative">
                      <img src={logoPreview} alt="Logo" className="h-14 w-14 object-contain rounded-lg" />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setLogoPreview(null); handleInputChange('logoBase64', ''); }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center"
                      >×</button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Upload Logo</span>
                    </>
                  )}
                </div>
              </div>
              {/* Signature */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Signature</Label>
                <input type="file" ref={signatureInputRef} accept="image/*" onChange={(e) => handleFileUpload(e, 'signature')} className="hidden" />
                <div
                  onClick={() => signatureInputRef.current?.click()}
                  className="border-2 border-dashed border-border/60 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all min-h-[100px]"
                >
                  {signaturePreview ? (
                    <div className="relative">
                      <img src={signaturePreview} alt="Signature" className="h-10 w-20 object-contain rounded-lg" />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSignaturePreview(null); handleInputChange('signatureBase64', ''); }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center"
                      >×</button>
                    </div>
                  ) : (
                    <>
                      <PenTool className="h-5 w-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Upload Sign</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Pay Period */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="rounded-2xl border-2 border-border/50 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              Pay Period
              <Badge variant="secondary" className="ml-auto text-[10px]">{formData.month} {formData.year}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-3">
              <Select value={formData.month} onValueChange={(v) => handleInputChange('month', v)}>
                <SelectTrigger className="touch-target rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{months.map((month) => <SelectItem key={month} value={month}>{month}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={formData.year} onValueChange={(v) => handleInputChange('year', v)}>
                <SelectTrigger className="touch-target rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{years.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Earnings */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="rounded-2xl border-2 border-green-200/50 dark:border-green-900/30 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-green-50/80 to-emerald-50/40 dark:from-green-950/30 dark:to-emerald-950/20 pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-green-700 dark:text-green-400">
              <div className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/40">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              Earnings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {[
              { id: 'basicSalary', label: 'Basic Salary' },
              { id: 'hra', label: 'HRA' },
              { id: 'da', label: 'Dearness Allowance' },
              { id: 'otherAllowances', label: 'Other Allowances' },
            ].map((field) => (
              <div key={field.id} className="flex items-center gap-3">
                <Label htmlFor={field.id} className="text-sm flex-1 min-w-0 truncate">{field.label}</Label>
                <div className="relative w-32">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                  <Input
                    id={field.id}
                    type="number"
                    placeholder="0"
                    value={formData[field.id as keyof SalarySlipData] || ''}
                    onChange={(e) => handleInputChange(field.id as keyof SalarySlipData, parseFloat(e.target.value) || 0)}
                    className="pl-7 text-right rounded-xl h-9"
                  />
                </div>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between items-center">
              <span className="font-bold text-sm">Gross Salary</span>
              <span className="text-lg font-bold text-green-600 dark:text-green-400">₹ {grossSalary.toLocaleString('en-IN')}</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Deductions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className="rounded-2xl border-2 border-red-200/50 dark:border-red-900/30 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-red-50/80 to-rose-50/40 dark:from-red-950/30 dark:to-rose-950/20 pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-400">
              <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/40">
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              Deductions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {[
              { id: 'pf', label: 'Provident Fund (PF)' },
              { id: 'tax', label: 'Income Tax (TDS)' },
              { id: 'otherDeductions', label: 'Other Deductions' },
            ].map((field) => (
              <div key={field.id} className="flex items-center gap-3">
                <Label htmlFor={field.id} className="text-sm flex-1 min-w-0 truncate">{field.label}</Label>
                <div className="relative w-32">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                  <Input
                    id={field.id}
                    type="number"
                    placeholder="0"
                    value={formData[field.id as keyof SalarySlipData] || ''}
                    onChange={(e) => handleInputChange(field.id as keyof SalarySlipData, parseFloat(e.target.value) || 0)}
                    className="pl-7 text-right rounded-xl h-9"
                  />
                </div>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between items-center">
              <span className="font-bold text-sm">Total Deductions</span>
              <span className="text-lg font-bold text-red-600 dark:text-red-400">₹ {totalDeductions.toLocaleString('en-IN')}</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Net Salary Summary */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="rounded-2xl overflow-hidden gradient-primary border-0 shadow-lg">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 text-primary-foreground">
              <div className="p-2.5 rounded-xl bg-white/20">
                <Wallet className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium opacity-80">Net Take Home</p>
                <p className="text-2xl font-black tracking-tight">₹ {netSalary.toLocaleString('en-IN')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Generate Button */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
        <Button
          onClick={handleGeneratePDF}
          className="w-full gradient-primary text-primary-foreground touch-target text-lg font-semibold rounded-2xl h-14 shadow-lg"
          disabled={isGenerating}
        >
          {isGenerating ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Generating PDF...</>
          ) : (
            <><Download className="mr-2 h-5 w-5" />Download Salary Slip PDF</>
          )}
        </Button>
      </motion.div>
    </div>
  );
}
