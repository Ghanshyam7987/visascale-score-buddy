import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Loader2, Calendar, MapPin, Globe, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { popularCountries } from '@/lib/visaScoreCalculator';

interface EventFormProps {
  onSuccess?: () => void;
}

export function EventForm({ onSuccess }: EventFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('');
  const [isActive, setIsActive] = useState(true);

  const handleSubmit = async () => {
    if (!title) {
      toast.error('Please enter a title');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('upcoming_events')
        .insert({
          title,
          description: description || null,
          event_date: eventDate || null,
          location: location || null,
          country: country || null,
          is_active: isActive,
        });

      if (error) throw error;

      toast.success('Event added successfully!');
      
      // Reset form
      setTitle('');
      setDescription('');
      setEventDate('');
      setLocation('');
      setCountry('');
      setIsActive(true);

      onSuccess?.();
    } catch (error) {
      console.error('Error adding event:', error);
      toast.error('Failed to add event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Add Upcoming Event
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="eventTitle">Event Title *</Label>
          <Input
            id="eventTitle"
            placeholder="e.g., Paris Travel Fair 2026"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="touch-target"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="eventDescription">Description</Label>
          <Textarea
            id="eventDescription"
            placeholder="Details about the event..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[80px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="eventDate">Event Date</Label>
            <Input
              id="eventDate"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="touch-target"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="eventCountry">Country</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="touch-target">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {popularCountries.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="eventLocation">Location</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="eventLocation"
              placeholder="e.g., Convention Center, New Delhi"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="pl-9 touch-target"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="isActive">Active</Label>
          <Switch
            id="isActive"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !title}
          className="w-full gradient-primary text-primary-foreground touch-target"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Add Event
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
