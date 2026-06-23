import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Eye, Globe, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

interface Itinerary {
  id: string;
  country: string;
  title: string;
  description: string | null;
  pdf_url: string;
  created_at: string;
}

export function ItineraryList() {
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [signingId, setSigningId] = useState<string | null>(null);

  useEffect(() => {
    fetchItineraries();
  }, []);

  const fetchItineraries = async () => {
    try {
      const { data, error } = await supabase
        .from('itineraries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItineraries(data || []);
    } catch (error) {
      console.error('Error fetching itineraries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const extractStoragePath = (url: string): string | null => {
    const marker = '/itineraries/';
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(url.slice(idx + marker.length).split('?')[0]);
  };

  const ensureSignedUrl = async (itinerary: Itinerary) => {
    if (signedUrls[itinerary.id]) return;
    const path = extractStoragePath(itinerary.pdf_url);
    if (!path) return;
    setSigningId(itinerary.id);
    const { data, error } = await supabase.storage
      .from('itineraries')
      .createSignedUrl(path, 60 * 30);
    setSigningId(null);
    if (error || !data?.signedUrl) {
      console.error('Failed to sign itinerary URL', error);
      return;
    }
    setSignedUrls((prev) => ({ ...prev, [itinerary.id]: data.signedUrl }));
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (itineraries.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No itineraries available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {itineraries.map((itinerary, index) => (
        <motion.div
          key={itinerary.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <Card className="overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">
                      <Globe className="h-3 w-3 mr-1" />
                      {itinerary.country}
                    </Badge>
                  </div>
                  <h4 className="font-semibold text-foreground">{itinerary.title}</h4>
                  {itinerary.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {itinerary.description}
                    </p>
                  )}
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {new Date(itinerary.created_at).toLocaleDateString('en-IN')}
                  </div>
                </div>
                <Dialog onOpenChange={(open) => { if (open) ensureSignedUrl(itinerary); }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4 mr-1" />
                      Preview
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl h-[80vh]">
                    <DialogHeader>
                      <DialogTitle>{itinerary.title}</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 h-full min-h-0">
                      {signedUrls[itinerary.id] ? (
                        <iframe
                          src={`https://docs.google.com/gview?url=${encodeURIComponent(signedUrls[itinerary.id])}&embedded=true`}
                          className="w-full h-full rounded border"
                          title={itinerary.title}
                          sandbox="allow-scripts allow-same-origin"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
                          {signingId === itinerary.id ? 'Loading preview…' : 'Preparing secure preview…'}
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
