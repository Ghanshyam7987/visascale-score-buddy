import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, Calculator, FileText, Calendar, TrendingUp, 
  Shield, Loader2, Trash2, Eye, ToggleLeft 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ItineraryUploadForm } from '@/components/admin/ItineraryUploadForm';
import { EventForm } from '@/components/admin/EventForm';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface DashboardStats {
  totalUsers: number;
  activeSubscriptions: number;
  totalCalculations: number;
  totalItineraries: number;
  totalEvents: number;
}

interface Itinerary {
  id: string;
  title: string;
  country: string;
  pdf_url: string;
  created_at: string;
}

interface Event {
  id: string;
  title: string;
  country: string | null;
  event_date: string | null;
  is_active: boolean | null;
  location: string | null;
}

const Admin = () => {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeSubscriptions: 0,
    totalCalculations: 0,
    totalItineraries: 0,
    totalEvents: 0,
  });
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/dashboard');
      return;
    }
    if (isAdmin) {
      fetchData();
    }
  }, [isAdmin, authLoading, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch stats
      const [profilesRes, calculationsRes, itinerariesRes, eventsRes] = await Promise.all([
        supabase.from('profiles').select('id, subscription_status'),
        supabase.from('visa_score_calculations').select('id'),
        supabase.from('itineraries').select('*').order('created_at', { ascending: false }),
        supabase.from('upcoming_events').select('*').order('event_date', { ascending: true }),
      ]);

      const profiles = profilesRes.data || [];
      const activeCount = profiles.filter(p => p.subscription_status === 'active').length;

      setStats({
        totalUsers: profiles.length,
        activeSubscriptions: activeCount,
        totalCalculations: calculationsRes.data?.length || 0,
        totalItineraries: itinerariesRes.data?.length || 0,
        totalEvents: eventsRes.data?.length || 0,
      });

      setItineraries(itinerariesRes.data || []);
      setEvents(eventsRes.data || []);
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItinerary = async (id: string, pdfUrl: string) => {
    if (!confirm('Are you sure you want to delete this itinerary?')) return;
    
    setDeletingId(id);
    try {
      // Extract file path from URL
      const urlParts = pdfUrl.split('/itineraries/');
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        await supabase.storage.from('itineraries').remove([filePath]);
      }

      const { error } = await supabase.from('itineraries').delete().eq('id', id);
      if (error) throw error;

      toast.success('Itinerary deleted');
      fetchData();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete itinerary');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    
    setDeletingId(id);
    try {
      const { error } = await supabase.from('upcoming_events').delete().eq('id', id);
      if (error) throw error;

      toast.success('Event deleted');
      fetchData();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete event');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleEventActive = async (id: string, currentStatus: boolean | null) => {
    try {
      const { error } = await supabase
        .from('upcoming_events')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;

      toast.success(`Event ${!currentStatus ? 'activated' : 'deactivated'}`);
      fetchData();
    } catch (error) {
      console.error('Toggle error:', error);
      toast.error('Failed to update event status');
    }
  };

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const statCards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-primary' },
    { label: 'Active Subscriptions', value: stats.activeSubscriptions, icon: TrendingUp, color: 'text-emerald-500' },
    { label: 'Visa Calculations', value: stats.totalCalculations, icon: Calculator, color: 'text-accent' },
    { label: 'Itineraries', value: stats.totalItineraries, icon: FileText, color: 'text-blue-500' },
    { label: 'Events', value: stats.totalEvents, icon: Calendar, color: 'text-purple-500' },
  ];

  return (
    <AppLayout>
      <Header title="Admin Panel" />
      
      <div className="p-4 space-y-6 pb-24">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {statCards.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
                      <stat.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Management Tabs */}
        <Tabs defaultValue="itineraries" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="itineraries" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Itineraries
            </TabsTrigger>
            <TabsTrigger value="events" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Events
            </TabsTrigger>
          </TabsList>

          <TabsContent value="itineraries" className="space-y-4 mt-4">
            <ItineraryUploadForm onSuccess={fetchData} />
            
            {/* Itineraries List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Uploaded Itineraries ({itineraries.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {itineraries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No itineraries uploaded yet
                  </p>
                ) : (
                  itineraries.map((itinerary) => (
                    <div 
                      key={itinerary.id} 
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{itinerary.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="text-xs">{itinerary.country}</Badge>
                          <span>{format(new Date(itinerary.created_at), 'dd MMM yyyy')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(itinerary.pdf_url, '_blank')}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteItinerary(itinerary.id, itinerary.pdf_url)}
                          disabled={deletingId === itinerary.id}
                          className="text-destructive hover:text-destructive"
                        >
                          {deletingId === itinerary.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events" className="space-y-4 mt-4">
            <EventForm onSuccess={fetchData} />
            
            {/* Events List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">All Events ({events.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No events added yet
                  </p>
                ) : (
                  events.map((event) => (
                    <div 
                      key={event.id} 
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{event.title}</p>
                          <Badge variant={event.is_active ? 'default' : 'secondary'} className="text-xs">
                            {event.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          {event.country && <span>{event.country}</span>}
                          {event.event_date && (
                            <span>• {format(new Date(event.event_date), 'dd MMM yyyy')}</span>
                          )}
                          {event.location && <span className="truncate">• {event.location}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Switch
                          checked={event.is_active ?? false}
                          onCheckedChange={() => handleToggleEventActive(event.id, event.is_active)}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteEvent(event.id)}
                          disabled={deletingId === event.id}
                          className="text-destructive hover:text-destructive"
                        >
                          {deletingId === event.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Admin;
