import { useState, useRef } from 'react';
import { Upload, FileText, Trash2, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { popularCountries } from '@/lib/visaScoreCalculator';

interface DayItinerary {
  id: string;
  day: number;
  title: string;
  description: string;
  file: File | null;
}

interface ItineraryUploadFormProps {
  onSuccess?: () => void;
}

export function ItineraryUploadForm({ onSuccess }: ItineraryUploadFormProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [country, setCountry] = useState('');
  const [tripTitle, setTripTitle] = useState('');
  const [tripDescription, setTripDescription] = useState('');
  const [uploadMode, setUploadMode] = useState<'single' | 'daywise'>('single');
  
  // Single PDF upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Day-wise upload
  const [dayItineraries, setDayItineraries] = useState<DayItinerary[]>([
    { id: crypto.randomUUID(), day: 1, title: '', description: '', file: null }
  ]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please select a PDF file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size should be less than 10MB');
      return;
    }

    setSelectedFile(file);
  };

  const handleDayFileSelect = (dayId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please select a PDF file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size should be less than 10MB');
      return;
    }

    setDayItineraries(prev => 
      prev.map(item => item.id === dayId ? { ...item, file } : item)
    );
  };

  const addDay = () => {
    const nextDay = dayItineraries.length + 1;
    setDayItineraries(prev => [
      ...prev,
      { id: crypto.randomUUID(), day: nextDay, title: '', description: '', file: null }
    ]);
  };

  const removeDay = (dayId: string) => {
    if (dayItineraries.length === 1) {
      toast.error('At least one day is required');
      return;
    }
    setDayItineraries(prev => {
      const filtered = prev.filter(item => item.id !== dayId);
      // Renumber days
      return filtered.map((item, index) => ({ ...item, day: index + 1 }));
    });
  };

  const updateDayField = (dayId: string, field: 'title' | 'description', value: string) => {
    setDayItineraries(prev =>
      prev.map(item => item.id === dayId ? { ...item, [field]: value } : item)
    );
  };

  const handleUploadSingle = async () => {
    if (!selectedFile || !country || !tripTitle) {
      toast.error('Please fill in all required fields and select a PDF');
      return;
    }

    setIsUploading(true);

    try {
      const fileName = `${Date.now()}_${selectedFile.name.replace(/\s+/g, '_')}`;
      const filePath = `${country}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('itineraries')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('itineraries')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('itineraries')
        .insert({
          country,
          title: tripTitle,
          description: tripDescription || null,
          pdf_url: urlData.publicUrl,
        });

      if (dbError) throw dbError;

      toast.success('Itinerary uploaded successfully!');
      resetForm();
      onSuccess?.();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload itinerary. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUploadDaywise = async () => {
    if (!country || !tripTitle) {
      toast.error('Please fill in country and trip title');
      return;
    }

    const daysWithFiles = dayItineraries.filter(day => day.file && day.title);
    if (daysWithFiles.length === 0) {
      toast.error('Please add at least one day with a title and PDF');
      return;
    }

    setIsUploading(true);

    try {
      // Upload all day files
      for (const day of daysWithFiles) {
        if (!day.file) continue;

        const fileName = `${Date.now()}_day${day.day}_${day.file.name.replace(/\s+/g, '_')}`;
        const filePath = `${country}/${tripTitle.replace(/\s+/g, '_')}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('itineraries')
          .upload(filePath, day.file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('itineraries')
          .getPublicUrl(filePath);

        const fullTitle = `${tripTitle} - Day ${day.day}: ${day.title}`;
        const fullDescription = day.description 
          ? `Day ${day.day} of ${tripTitle}. ${day.description}`
          : `Day ${day.day} of ${tripTitle}`;

        const { error: dbError } = await supabase
          .from('itineraries')
          .insert({
            country,
            title: fullTitle,
            description: fullDescription,
            pdf_url: urlData.publicUrl,
          });

        if (dbError) throw dbError;
      }

      toast.success(`${daysWithFiles.length} day itineraries uploaded successfully!`);
      resetForm();
      onSuccess?.();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload itineraries. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setCountry('');
    setTripTitle('');
    setTripDescription('');
    setDayItineraries([{ id: crypto.randomUUID(), day: 1, title: '', description: '', file: null }]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Upload Itinerary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Mode Toggle */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <Button
            type="button"
            variant={uploadMode === 'single' ? 'default' : 'ghost'}
            size="sm"
            className="flex-1"
            onClick={() => setUploadMode('single')}
          >
            Single PDF
          </Button>
          <Button
            type="button"
            variant={uploadMode === 'daywise' ? 'default' : 'ghost'}
            size="sm"
            className="flex-1"
            onClick={() => setUploadMode('daywise')}
          >
            Day-wise PDFs
          </Button>
        </div>

        {/* Common Fields */}
        <div className="space-y-2">
          <Label htmlFor="country">Country *</Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="touch-target">
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent>
              {popularCountries.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tripTitle">Trip Title *</Label>
          <Input
            id="tripTitle"
            placeholder="e.g., 7-Day Paris Adventure"
            value={tripTitle}
            onChange={(e) => setTripTitle(e.target.value)}
            className="touch-target"
          />
        </div>

        {uploadMode === 'single' ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Brief description of the itinerary..."
                value={tripDescription}
                onChange={(e) => setTripDescription(e.target.value)}
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label>PDF File *</Label>
              <input
                type="file"
                ref={fileInputRef}
                accept="application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="touch-target"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Select PDF
                </Button>
                {selectedFile && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <span className="truncate max-w-[150px]">{selectedFile.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="text-destructive hover:text-destructive/80"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PDF files up to 10MB</p>
            </div>

            <Button
              onClick={handleUploadSingle}
              disabled={isUploading || !selectedFile || !country || !tripTitle}
              className="w-full gradient-primary text-primary-foreground touch-target"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Itinerary
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            {/* Day-wise Upload */}
            <div className="space-y-4">
              <Label>Day-wise Itineraries</Label>
              
              {dayItineraries.map((day) => (
                <div key={day.id} className="p-4 bg-muted/50 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary">Day {day.day}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDay(day.id)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <Input
                    placeholder={`Day ${day.day} title (e.g., Eiffel Tower & Louvre)`}
                    value={day.title}
                    onChange={(e) => updateDayField(day.id, 'title', e.target.value)}
                    className="touch-target"
                  />
                  
                  <Textarea
                    placeholder="Day description (optional)..."
                    value={day.description}
                    onChange={(e) => updateDayField(day.id, 'description', e.target.value)}
                    className="min-h-[60px]"
                  />
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      id={`file-${day.id}`}
                      accept="application/pdf"
                      onChange={(e) => handleDayFileSelect(day.id, e)}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById(`file-${day.id}`)?.click()}
                    >
                      <Upload className="h-3.5 w-3.5 mr-1.5" />
                      PDF
                    </Button>
                    {day.file && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        <span className="truncate max-w-[120px]">{day.file.name}</span>
                        <button
                          type="button"
                          onClick={() => setDayItineraries(prev => 
                            prev.map(item => item.id === day.id ? { ...item, file: null } : item)
                          )}
                          className="text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={addDay}
                className="w-full touch-target"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Day {dayItineraries.length + 1}
              </Button>
            </div>

            <Button
              onClick={handleUploadDaywise}
              disabled={isUploading || !country || !tripTitle || !dayItineraries.some(d => d.file && d.title)}
              className="w-full gradient-primary text-primary-foreground touch-target"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading All Days...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload {dayItineraries.filter(d => d.file && d.title).length} Day(s)
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
