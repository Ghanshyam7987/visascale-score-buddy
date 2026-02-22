import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Plus, Trash2, Download, Loader2, MapPin, Calendar, Plane } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { generateCoverLetterPDF, embassyAddresses, visaCountries, CoverLetterData, Applicant } from '@/lib/coverLetterGenerator';

const CoverLetter = () => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [country, setCountry] = useState('');
  const [consularCity, setConsularCity] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-IN'));
  const [applicants, setApplicants] = useState<Applicant[]>([{ name: '', passportNumber: '' }]);
  const [dateOfArrival, setDateOfArrival] = useState('');
  const [dateOfDeparture, setDateOfDeparture] = useState('');
  const [cities, setCities] = useState<{ name: string; nights: number }[]>([{ name: '', nights: 1 }]);
  const [documents, setDocuments] = useState<string[]>(['']);

  const addApplicant = () => setApplicants([...applicants, { name: '', passportNumber: '' }]);
  const removeApplicant = (i: number) => setApplicants(applicants.filter((_, idx) => idx !== i));
  const updateApplicant = (i: number, field: keyof Applicant, value: string) => {
    const updated = [...applicants];
    updated[i][field] = value;
    setApplicants(updated);
  };

  const addCity = () => setCities([...cities, { name: '', nights: 1 }]);
  const removeCity = (i: number) => setCities(cities.filter((_, idx) => idx !== i));

  const addDocument = () => setDocuments([...documents, '']);
  const removeDocument = (i: number) => setDocuments(documents.filter((_, idx) => idx !== i));

  const addressOptions = country ? Object.keys(embassyAddresses[country] || {}) : [];

  const handleGenerate = () => {
    if (!country || !consularCity || applicants.some(a => !a.name || !a.passportNumber)) {
      toast({ title: 'Missing Information', description: 'Please fill in country, consular office, and all applicant details.', variant: 'destructive' });
      return;
    }
    setIsGenerating(true);
    setTimeout(() => {
      try {
        const data: CoverLetterData = {
          date,
          country,
          addressType: consularCity.includes('Embassy') ? 'embassy' : 'consulate',
          consularCity,
          applicants,
          dateOfArrival,
          dateOfDeparture,
          cities: cities.filter(c => c.name),
          documents: documents.filter(d => d.trim()),
        };
        generateCoverLetterPDF(data);
        toast({ title: 'PDF Generated!', description: 'Cover letter downloaded.' });
      } catch {
        toast({ title: 'Error', description: 'Failed to generate PDF.', variant: 'destructive' });
      }
      setIsGenerating(false);
    }, 300);
  };

  return (
    <AppLayout>
      <Header title="Cover Letter" showBack />
      <div className="p-4 space-y-4 pb-24">
        {/* Date & Country */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Plane className="h-5 w-5 text-primary" />Letter Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input value={date} onChange={(e) => setDate(e.target.value)} placeholder="DD/MM/YYYY" />
              </div>
              <div className="space-y-2">
                <Label>Visa Country</Label>
                <Select value={country} onValueChange={(v) => { setCountry(v); setConsularCity(''); }}>
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>{visaCountries.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {country && (
                <div className="space-y-2">
                  <Label>Embassy / Consulate</Label>
                  <Select value={consularCity} onValueChange={setConsularCity}>
                    <SelectTrigger><SelectValue placeholder="Select office" /></SelectTrigger>
                    <SelectContent>{addressOptions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Applicants */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Applicants</CardTitle>
                <Button size="sm" variant="outline" onClick={addApplicant}><Plus className="h-4 w-4 mr-1" />Add</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {applicants.map((applicant, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Applicant {i + 1}</span>
                    {applicants.length > 1 && <Button size="sm" variant="ghost" onClick={() => removeApplicant(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                  </div>
                  <Input placeholder="Full Name" value={applicant.name} onChange={(e) => updateApplicant(i, 'name', e.target.value)} />
                  <Input placeholder="Passport Number" value={applicant.passportNumber} onChange={(e) => updateApplicant(i, 'passportNumber', e.target.value)} />
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Travel Dates */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" />Travel Dates</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Arrival Date</Label>
                  <Input type="date" value={dateOfArrival} onChange={(e) => setDateOfArrival(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Departure Date</Label>
                  <Input type="date" value={dateOfDeparture} onChange={(e) => setDateOfDeparture(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Cities */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />Cities & Stay</CardTitle>
                <Button size="sm" variant="outline" onClick={addCity}><Plus className="h-4 w-4 mr-1" />Add</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {cities.map((city, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="City Name" value={city.name} onChange={(e) => { const u = [...cities]; u[i].name = e.target.value; setCities(u); }} className="flex-1" />
                  <Input type="number" min={1} value={city.nights} onChange={(e) => { const u = [...cities]; u[i].nights = parseInt(e.target.value) || 1; setCities(u); }} className="w-20" placeholder="Nights" />
                  {cities.length > 1 && <Button size="icon" variant="ghost" onClick={() => removeCity(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Documents */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Attached Documents</CardTitle>
                <Button size="sm" variant="outline" onClick={addDocument}><Plus className="h-4 w-4 mr-1" />Add</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {documents.map((docItem, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="e.g., Bank Statement, ITR, Passport Copy" value={docItem} onChange={(e) => { const u = [...documents]; u[i] = e.target.value; setDocuments(u); }} className="flex-1" />
                  {documents.length > 1 && <Button size="icon" variant="ghost" onClick={() => removeDocument(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Generate */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Button onClick={handleGenerate} className="w-full gradient-primary text-primary-foreground touch-target text-lg font-semibold" disabled={isGenerating}>
            {isGenerating ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Generating...</> : <><Download className="mr-2 h-5 w-5" />Download Cover Letter PDF</>}
          </Button>
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default CoverLetter;
