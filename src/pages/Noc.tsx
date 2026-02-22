import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Download, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { generateNocPDF, NocData } from '@/lib/nocGenerator';
import { visaCountries } from '@/lib/coverLetterGenerator';

const Noc = () => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState<NocData>({
    fatherName: '',
    motherName: '',
    applicantName: '',
    passportNumber: '',
    travelReason: '',
    country: '',
    date: new Date().toLocaleDateString('en-IN'),
  });

  const handleChange = (field: keyof NocData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerate = () => {
    if (!formData.fatherName || !formData.motherName || !formData.applicantName || !formData.passportNumber || !formData.country) {
      toast({ title: 'Missing Information', description: 'Please fill all required fields.', variant: 'destructive' });
      return;
    }
    setIsGenerating(true);
    setTimeout(() => {
      try {
        generateNocPDF(formData);
        toast({ title: 'PDF Generated!', description: 'NOC has been downloaded.' });
      } catch {
        toast({ title: 'Error', description: 'Failed to generate PDF.', variant: 'destructive' });
      }
      setIsGenerating(false);
    }, 300);
  };

  return (
    <AppLayout>
      <Header title="Parents NOC" showBack />
      <div className="p-4 space-y-4 pb-24">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />NOC Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input value={formData.date} onChange={(e) => handleChange('date', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Country *</Label>
                <Select value={formData.country} onValueChange={(v) => handleChange('country', v)}>
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>{visaCountries.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Father's Name *</Label>
                <Input value={formData.fatherName} onChange={(e) => handleChange('fatherName', e.target.value)} placeholder="Enter father's full name" />
              </div>
              <div className="space-y-2">
                <Label>Mother's Name *</Label>
                <Input value={formData.motherName} onChange={(e) => handleChange('motherName', e.target.value)} placeholder="Enter mother's full name" />
              </div>
              <div className="space-y-2">
                <Label>Applicant's Name *</Label>
                <Input value={formData.applicantName} onChange={(e) => handleChange('applicantName', e.target.value)} placeholder="Enter applicant's full name" />
              </div>
              <div className="space-y-2">
                <Label>Passport Number *</Label>
                <Input value={formData.passportNumber} onChange={(e) => handleChange('passportNumber', e.target.value)} placeholder="e.g., A1234567" />
              </div>
              <div className="space-y-2">
                <Label>Reason for Travel</Label>
                <Textarea value={formData.travelReason} onChange={(e) => handleChange('travelReason', e.target.value)} placeholder="Purpose of travel / tourism details" rows={4} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Button onClick={handleGenerate} className="w-full gradient-primary text-primary-foreground touch-target text-lg font-semibold" disabled={isGenerating}>
            {isGenerating ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Generating...</> : <><Download className="mr-2 h-5 w-5" />Download NOC PDF</>}
          </Button>
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default Noc;
