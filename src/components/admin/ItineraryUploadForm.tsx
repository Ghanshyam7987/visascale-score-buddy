import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { popularCountries } from '@/lib/visaScoreCalculator';

interface ItineraryUploadFormProps {
  onSuccess?: () => void;
}

export function ItineraryUploadForm({ onSuccess }: ItineraryUploadFormProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [country, setCountry] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleUpload = async () => {
    if (!selectedFile || !country || !title) {
      toast.error('Please fill in all required fields and select a PDF');
      return;
    }

    setIsUploading(true);

    try {
      // Upload file to storage
      const fileName = `${Date.now()}_${selectedFile.name.replace(/\s+/g, '_')}`;
      const filePath = `${country}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('itineraries')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('itineraries')
        .getPublicUrl(filePath);

      // Save to database
      const { error: dbError } = await supabase
        .from('itineraries')
        .insert({
          country,
          title,
          description: description || null,
          pdf_url: urlData.publicUrl,
        });

      if (dbError) throw dbError;

      toast.success('Itinerary uploaded successfully!');
      
      // Reset form
      setSelectedFile(null);
      setCountry('');
      setTitle('');
      setDescription('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      onSuccess?.();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload itinerary. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Upload Itinerary PDF
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            placeholder="e.g., 7-Day Paris Itinerary"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="touch-target"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description (Optional)</Label>
          <Textarea
            id="description"
            placeholder="Brief description of the itinerary..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
          onClick={handleUpload}
          disabled={isUploading || !selectedFile || !country || !title}
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
      </CardContent>
    </Card>
  );
}
