import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Plus, Trash2, Download, Loader2, MapPin, Calendar, Plane, Search, ChevronsUpDown } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { generateCoverLetterPDF, embassyAddresses, visaCountries, CoverLetterData, Applicant, relationOptions, coverLetterDocuments, sponsoredApplicantDocuments } from '@/lib/coverLetterGenerator';

const CoverLetter = () => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [country, setCountry] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [consularCity, setConsularCity] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-IN'));
  const [applicants, setApplicants] = useState<Applicant[]>([{ name: '', passportNumber: '' }]);
  const [dateOfArrival, setDateOfArrival] = useState('');
  const [dateOfDeparture, setDateOfDeparture] = useState('');
  const [cities, setCities] = useState<{ name: string; nights: number }[]>([{ name: '', nights: 1 }]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [occupation, setOccupation] = useState('');
  const [companyName, setCompanyName] = useState('');

  const addApplicant = () => setApplicants([...applicants, { name: '', passportNumber: '', relation: '' }]);
  const removeApplicant = (i: number) => setApplicants(applicants.filter((_, idx) => idx !== i));
  const updateApplicant = (i: number, field: keyof Applicant, value: string) => {
    const updated = [...applicants];
    (updated[i] as any)[field] = value;
    setApplicants(updated);
  };

  const addCity = () => setCities([...cities, { name: '', nights: 1 }]);
  const removeCity = (i: number) => setCities(cities.filter((_, idx) => idx !== i));

  const toggleDocument = (doc: string) => {
    setSelectedDocuments(prev => prev.includes(doc) ? prev.filter(d => d !== doc) : [...prev, doc]);
  };

  const addressOptions = country ? Object.keys(embassyAddresses[country] || {}) : [];
  const filteredCountries = visaCountries.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()));

  const handleGenerate = () => {
    if (!country || applicants.some(a => !a.name || !a.passportNumber)) {
      toast({ title: 'Missing Information', description: 'Please fill in country and all applicant details.', variant: 'destructive' });
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
          documents: selectedDocuments,
          occupation,
          companyName,
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
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between text-left font-normal">
                      {country || 'Select country'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <div className="p-2 border-b border-border">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search countries..." value={countrySearch} onChange={(e) => setCountrySearch(e.target.value)} className="pl-8 h-8 text-sm" />
                      </div>
                    </div>
                    <ScrollArea className="h-[250px]">
                      <div className="p-1">
                        {filteredCountries.map(c => (
                          <button key={c} type="button" className={`w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors ${country === c ? 'bg-primary/10 text-primary font-medium' : ''}`}
                            onClick={() => { setCountry(c); setConsularCity(''); setCountrySearch(''); }}>
                            {c}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              </div>
              {country && addressOptions.length > 0 && (
                <div className="space-y-2">
                  <Label>Embassy / Consulate</Label>
                  <Select value={consularCity} onValueChange={setConsularCity}>
                    <SelectTrigger><SelectValue placeholder="Select office" /></SelectTrigger>
                    <SelectContent>{addressOptions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Your Occupation / Designation</Label>
                <Input placeholder="e.g., Partner, Director, Employee" value={occupation} onChange={(e) => setOccupation(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Company / Firm Name</Label>
                <Input placeholder="e.g., ENKAY INVESTMENTS" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
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
                    <span className="text-sm font-medium">{i === 0 ? 'Main Applicant' : `Applicant ${i + 1}`}</span>
                    {applicants.length > 1 && i > 0 && <Button size="sm" variant="ghost" onClick={() => removeApplicant(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                  </div>
                  <Input placeholder="Full Name" value={applicant.name} onChange={(e) => updateApplicant(i, 'name', e.target.value)} />
                  <Input placeholder="Passport Number" value={applicant.passportNumber} onChange={(e) => updateApplicant(i, 'passportNumber', e.target.value)} />
                  {i > 0 && (
                    <Select value={applicant.relation || ''} onValueChange={(v) => updateApplicant(i, 'relation', v)}>
                      <SelectTrigger><SelectValue placeholder="Select Relation" /></SelectTrigger>
                      <SelectContent>
                        {relationOptions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
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

        {/* Cities & Stay */}
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
                  <div className="flex items-center gap-1">
                    <Input type="number" min={1} value={city.nights} onChange={(e) => { const u = [...cities]; u[i].nights = parseInt(e.target.value) || 1; setCities(u); }} className="w-16 text-center" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Nights</span>
                  </div>
                  {cities.length > 1 && <Button size="icon" variant="ghost" onClick={() => removeCity(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Documents - Dropdown checklist */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Attached Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {coverLetterDocuments.map((doc) => (
                  <div key={doc} className="flex items-center space-x-3">
                    <Checkbox
                      id={`cl-doc-${doc}`}
                      checked={selectedDocuments.includes(doc)}
                      onCheckedChange={() => toggleDocument(doc)}
                    />
                    <Label htmlFor={`cl-doc-${doc}`} className="text-sm cursor-pointer flex-1">{doc}</Label>
                  </div>
                ))}
              </div>

              {/* Sponsored applicant & sponsor documents */}
              {(selectedDocuments.includes('Sponsorship Letter') || selectedDocuments.includes('Invitation Letter')) && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  <p className="text-sm font-semibold text-primary">Applicant & Sponsor Documents</p>
                  <div className="space-y-2">
                    {sponsoredApplicantDocuments.map((doc) => (
                      <div key={doc} className="flex items-center space-x-3">
                        <Checkbox
                          id={`cl-sp-doc-${doc}`}
                          checked={selectedDocuments.includes(doc)}
                          onCheckedChange={() => toggleDocument(doc)}
                        />
                        <Label htmlFor={`cl-sp-doc-${doc}`} className="text-sm cursor-pointer flex-1">{doc}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedDocuments.length > 0 && (
                <p className="text-xs text-muted-foreground">{selectedDocuments.length} document(s) selected</p>
              )}
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
