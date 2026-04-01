import { useState, useCallback } from 'react';
import { FileText, Plus, Trash2, Download, Loader2, MapPin, Calendar, Plane, Search, ChevronsUpDown, Briefcase, Phone } from 'lucide-react';
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
import {
  generateCoverLetterPDF, embassyAddresses, visaCountries,
  CoverLetterData, Applicant, TravelScheduleEntry,
  relationOptions, occupationOptions, coverLetterDocuments
} from '@/lib/coverLetterGenerator';

const CoverLetter = () => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [country, setCountry] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const [consularCity, setConsularCity] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-IN'));
  const [applicants, setApplicants] = useState<Applicant[]>([
    { name: '', passportNumber: '', relation: 'Self', expiryDate: '', occupation: '' }
  ]);
  const [dateOfArrival, setDateOfArrival] = useState('');
  const [dateOfDeparture, setDateOfDeparture] = useState('');
  const [travelSchedule, setTravelSchedule] = useState<TravelScheduleEntry[]>([
    { fromDate: '', toDate: '', country: '', modeOfTransport: '' }
  ]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [designation, setDesignation] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const addApplicant = () => setApplicants([...applicants, { name: '', passportNumber: '', relation: '', expiryDate: '', occupation: '' }]);
  const removeApplicant = (i: number) => setApplicants(applicants.filter((_, idx) => idx !== i));
  const updateApplicant = useCallback((i: number, field: keyof Applicant, value: string) => {
    setApplicants(prev => {
      const updated = prev.map((app, idx) => idx === i ? { ...app, [field]: value } : app);
      return updated;
    });
  }, []);

  const addScheduleEntry = () => setTravelSchedule([...travelSchedule, { fromDate: '', toDate: '', country: '', modeOfTransport: '' }]);
  const removeScheduleEntry = (i: number) => setTravelSchedule(travelSchedule.filter((_, idx) => idx !== i));

  const toggleDocument = (doc: string) => {
    setSelectedDocuments(prev => prev.includes(doc) ? prev.filter(d => d !== doc) : [...prev, doc]);
  };

  const addressOptions = country ? Object.keys(embassyAddresses[country] || {}) : [];
  const filteredCountries = visaCountries.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()));

  const handleGenerate = async () => {
    if (!country || !applicants[0].name || !applicants[0].passportNumber) {
      toast({ title: 'Missing Information', description: 'Please fill in country, name and passport number.', variant: 'destructive' });
      return;
    }
    setIsGenerating(true);
    try {
      const data: CoverLetterData = {
        date, country, consularCity, applicants,
        dateOfArrival, dateOfDeparture,
        cities: [], travelSchedule: travelSchedule.filter(s => s.country),
        documents: selectedDocuments,
        designation, businessName, businessAddress, phone, email,
      };
      await generateCoverLetterPDF(data);
      toast({ title: 'Word File Generated!', description: 'Cover letter downloaded as .docx' });
    } catch {
      toast({ title: 'Error', description: 'Failed to generate document.', variant: 'destructive' });
    }
    setIsGenerating(false);
  };

  return (
    <AppLayout>
      <Header title="Cover Letter" showBack />
      <div className="p-4 space-y-4 pb-24">
        {/* Date & Country */}
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
          </CardContent>
        </Card>

        {/* Applicants */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Traveler Details</CardTitle>
              <Button size="sm" variant="outline" onClick={addApplicant}><Plus className="h-4 w-4 mr-1" />Add</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {applicants.map((applicant, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{i === 0 ? 'Main Applicant' : `Traveler ${i + 1}`}</span>
                  {i > 0 && <Button size="sm" variant="ghost" onClick={() => removeApplicant(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
                <Input placeholder="Full Name" value={applicant.name} onChange={(e) => updateApplicant(i, 'name', e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Passport Number" value={applicant.passportNumber} onChange={(e) => updateApplicant(i, 'passportNumber', e.target.value)} />
                  <Input type="date" placeholder="Expiry Date" value={applicant.expiryDate || ''} onChange={(e) => updateApplicant(i, 'expiryDate', e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={applicant.relation || (i === 0 ? 'Self' : 'Self')} onValueChange={(v) => updateApplicant(i, 'relation', v)}>
                    <SelectTrigger><SelectValue placeholder="Relation" /></SelectTrigger>
                    <SelectContent>
                      {relationOptions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={applicant.occupation || 'BUSINESS'} onValueChange={(v) => updateApplicant(i, 'occupation', v)}>
                    <SelectTrigger><SelectValue placeholder="Occupation" /></SelectTrigger>
                    <SelectContent>
                      {occupationOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Travel Dates */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" />Travel Dates</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Date</Label>
                <Input type="date" value={dateOfArrival} onChange={(e) => setDateOfArrival(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>To Date</Label>
                <Input type="date" value={dateOfDeparture} onChange={(e) => setDateOfDeparture(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Travel Schedule */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />Travel Schedule</CardTitle>
              <Button size="sm" variant="outline" onClick={addScheduleEntry}><Plus className="h-4 w-4 mr-1" />Add</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {travelSchedule.map((entry, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Entry {i + 1}</span>
                  {travelSchedule.length > 1 && <Button size="sm" variant="ghost" onClick={() => removeScheduleEntry(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">From</Label>
                    <Input type="date" value={entry.fromDate} onChange={(e) => {
                      const u = [...travelSchedule]; u[i] = { ...u[i], fromDate: e.target.value }; setTravelSchedule(u);
                    }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">To</Label>
                    <Input type="date" value={entry.toDate} onChange={(e) => {
                      const u = [...travelSchedule]; u[i] = { ...u[i], toDate: e.target.value }; setTravelSchedule(u);
                    }} />
                  </div>
                </div>
                <Input placeholder="Country / City" value={entry.country} onChange={(e) => {
                  const u = [...travelSchedule]; u[i] = { ...u[i], country: e.target.value }; setTravelSchedule(u);
                }} />
                <Input placeholder="Mode of Transport & Stay (e.g., By Air, Stay at Hotel)" value={entry.modeOfTransport} onChange={(e) => {
                  const u = [...travelSchedule]; u[i] = { ...u[i], modeOfTransport: e.target.value }; setTravelSchedule(u);
                }} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Employer / Business */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5 text-primary" />Employer / Business</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Designation</Label>
              <Input placeholder="e.g., Proprietor, Partner, Director" value={designation} onChange={(e) => setDesignation(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Business / Employer Name</Label>
              <Input placeholder="e.g., DEVI FABRICS" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Business Address (optional)</Label>
              <Input placeholder="e.g., 123 Main Street, City" value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Contact Details */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5 text-primary" />Contact Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Mobile Number</Label>
              <Input placeholder="e.g., 9099378880" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="e.g., name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Documents List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {coverLetterDocuments.map((doc) => (
                <div key={doc} className="flex items-center space-x-3">
                  <Checkbox id={`cl-doc-${doc}`} checked={selectedDocuments.includes(doc)} onCheckedChange={() => toggleDocument(doc)} />
                  <Label htmlFor={`cl-doc-${doc}`} className="text-sm cursor-pointer flex-1">{doc}</Label>
                </div>
              ))}
            </div>
            {selectedDocuments.length > 0 && (
              <p className="text-xs text-muted-foreground">{selectedDocuments.length} document(s) selected</p>
            )}
          </CardContent>
        </Card>

        {/* Generate */}
        <Button onClick={handleGenerate} className="w-full gradient-primary text-primary-foreground touch-target text-lg font-semibold" disabled={isGenerating}>
          {isGenerating ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Generating...</> : <><Download className="mr-2 h-5 w-5" />Download Cover Letter (Word)</>}
        </Button>
      </div>
    </AppLayout>
  );
};

export default CoverLetter;
