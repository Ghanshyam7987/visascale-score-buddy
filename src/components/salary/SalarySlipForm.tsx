import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { User, Briefcase, Building2, Calendar, DollarSign, Download, Loader2, Upload, Image, PenTool, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

    // Small delay for UX
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
    <div className="space-y-6">
      {/* Essential Requirements Alert */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Alert className="border-primary/20 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertTitle className="text-primary font-semibold">Essential Requirements for Visa</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {essentialRequirements.map((req, index) => (
                <li key={index}>{req}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      </motion.div>

      {/* Employee Details */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Employee Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employeeName">Employee Name *</Label>
                <Input
                  id="employeeName"
                  placeholder="Enter full name"
                  value={formData.employeeName}
                  onChange={(e) => handleInputChange('employeeName', e.target.value)}
                  className="touch-target"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="designation">Designation *</Label>
                <Input
                  id="designation"
                  placeholder="e.g., Software Engineer"
                  value={formData.designation}
                  onChange={(e) => handleInputChange('designation', e.target.value)}
                  className="touch-target"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name (Optional)</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="companyName"
                    placeholder="Enter company name"
                    value={formData.companyName}
                    onChange={(e) => handleInputChange('companyName', e.target.value)}
                    className="pl-10 touch-target"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Logo & Signature Upload */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5 text-primary" />
              Branding & Signature
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Logo Upload */}
            <div className="space-y-2">
              <Label>Company Logo (Optional)</Label>
              <input
                type="file"
                ref={logoInputRef}
                accept="image/*"
                onChange={(e) => handleFileUpload(e, 'logo')}
                className="hidden"
              />
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => logoInputRef.current?.click()}
                  className="touch-target"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Logo
                </Button>
                {logoPreview && (
                  <div className="relative">
                    <img 
                      src={logoPreview} 
                      alt="Logo preview" 
                      className="h-12 w-12 object-contain border rounded"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setLogoPreview(null);
                        handleInputChange('logoBase64', '');
                      }}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG up to 2MB. Will appear in header.</p>
            </div>

            {/* Signature Upload */}
            <div className="space-y-2">
              <Label>Authorized Signature (Optional)</Label>
              <input
                type="file"
                ref={signatureInputRef}
                accept="image/*"
                onChange={(e) => handleFileUpload(e, 'signature')}
                className="hidden"
              />
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => signatureInputRef.current?.click()}
                  className="touch-target"
                >
                  <PenTool className="h-4 w-4 mr-2" />
                  Upload Signature
                </Button>
                {signaturePreview && (
                  <div className="relative">
                    <img 
                      src={signaturePreview} 
                      alt="Signature preview" 
                      className="h-10 w-20 object-contain border rounded"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSignaturePreview(null);
                        handleInputChange('signatureBase64', '');
                      }}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Signature image for authorized signatory section.</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Pay Period */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Pay Period
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select
                  value={formData.month}
                  onValueChange={(v) => handleInputChange('month', v)}
                >
                  <SelectTrigger className="touch-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((month) => (
                      <SelectItem key={month} value={month}>{month}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Select
                  value={formData.year}
                  onValueChange={(v) => handleInputChange('year', v)}
                >
                  <SelectTrigger className="touch-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Earnings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-success">
              <DollarSign className="h-5 w-5" />
              Earnings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { id: 'basicSalary', label: 'Basic Salary' },
              { id: 'hra', label: 'House Rent Allowance (HRA)' },
              { id: 'da', label: 'Dearness Allowance (DA)' },
              { id: 'otherAllowances', label: 'Other Allowances' },
            ].map((field) => (
              <div key={field.id} className="space-y-2">
                <Label htmlFor={field.id}>{field.label}</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <Input
                    id={field.id}
                    type="number"
                    placeholder="0"
                    value={formData[field.id as keyof SalarySlipData] || ''}
                    onChange={(e) => handleInputChange(field.id as keyof SalarySlipData, parseFloat(e.target.value) || 0)}
                    className="pl-8 touch-target"
                  />
                </div>
              </div>
            ))}
            <div className="pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="font-semibold">Gross Salary</span>
                <span className="text-lg font-bold text-success">₹ {grossSalary.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Deductions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Briefcase className="h-5 w-5" />
              Deductions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { id: 'pf', label: 'Provident Fund (PF)' },
              { id: 'tax', label: 'Income Tax (TDS)' },
              { id: 'otherDeductions', label: 'Other Deductions' },
            ].map((field) => (
              <div key={field.id} className="space-y-2">
                <Label htmlFor={field.id}>{field.label}</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                  <Input
                    id={field.id}
                    type="number"
                    placeholder="0"
                    value={formData[field.id as keyof SalarySlipData] || ''}
                    onChange={(e) => handleInputChange(field.id as keyof SalarySlipData, parseFloat(e.target.value) || 0)}
                    className="pl-8 touch-target"
                  />
                </div>
              </div>
            ))}
            <div className="pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="font-semibold">Total Deductions</span>
                <span className="text-lg font-bold text-destructive">₹ {totalDeductions.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Net Salary Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="gradient-primary">
          <CardContent className="p-6">
            <div className="flex justify-between items-center text-primary-foreground">
              <span className="text-lg font-semibold">Net Salary</span>
              <span className="text-3xl font-bold">₹ {netSalary.toLocaleString('en-IN')}</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Generate Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <Button
          onClick={handleGeneratePDF}
          className="w-full gradient-primary text-primary-foreground touch-target text-lg font-semibold"
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Generating PDF...
            </>
          ) : (
            <>
              <Download className="mr-2 h-5 w-5" />
              Download Salary Slip PDF
            </>
          )}
        </Button>
      </motion.div>
    </div>
  );
}
