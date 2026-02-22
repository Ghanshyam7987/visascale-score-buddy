import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Newspaper, Globe, ExternalLink, Sparkles } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface VisaNewsItem {
  id: string;
  title: string;
  content: string | null;
  country: string | null;
  source_url: string | null;
  created_at: string;
}

const VisaNews = () => {
  const [news, setNews] = useState<VisaNewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      const { data, error } = await supabase
        .from('visa_news')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setNews(data || []);
    } catch (error) {
      console.error('Error fetching visa news:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppLayout>
      <Header title="Visa News" showBack />
      <div className="p-4 pb-24">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i}><CardContent className="p-4"><div className="animate-pulse space-y-2"><div className="h-4 bg-muted rounded w-3/4" /><div className="h-3 bg-muted rounded w-1/2" /></div></CardContent></Card>
            ))}
          </div>
        ) : news.length === 0 ? (
          <Card><CardContent className="p-6 text-center"><Sparkles className="h-8 w-8 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground">No visa news at the moment.</p></CardContent></Card>
        ) : (
          <div className="space-y-3">
            {news.map((item, index) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                <Card className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Newspaper className="h-4 w-4 text-primary" />
                          <h4 className="font-semibold text-foreground">{item.title}</h4>
                        </div>
                        {item.content && <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{item.content}</p>}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {item.country && <Badge variant="secondary" className="text-xs"><Globe className="h-3 w-3 mr-1" />{item.country}</Badge>}
                          <span className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString('en-IN')}</span>
                        </div>
                      </div>
                      {item.source_url && (
                        <Button size="sm" variant="outline" onClick={() => window.open(item.source_url!, '_blank')}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default VisaNews;
