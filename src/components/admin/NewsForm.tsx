import { useState } from 'react';
import { Loader2, Newspaper } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface NewsFormProps {
  onSuccess: () => void;
}

export function NewsForm({ onSuccess }: NewsFormProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [country, setCountry] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { toast.error('Title is required'); return; }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('visa_news').insert({
        title: title.trim(),
        content: content.trim() || null,
        country: country.trim() || null,
        source_url: sourceUrl.trim() || null,
        created_by: user?.id,
      });
      if (error) throw error;
      toast.success('News published!');
      setTitle(''); setContent(''); setCountry(''); setSourceUrl('');
      onSuccess();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to publish news');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Newspaper className="h-5 w-5" />
          Add Visa News
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="News headline" required />
          </div>
          <div className="space-y-2">
            <Label>Content</Label>
            <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="News details..." rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Country</Label>
              <Input value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g., USA" />
            </div>
            <div className="space-y-2">
              <Label>Source URL</Label>
              <Input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Publishing...</> : 'Publish News'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
