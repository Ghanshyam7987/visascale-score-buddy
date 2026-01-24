import { useState, useEffect } from 'react';
import { Plus, Loader2, Calendar, MapPin, Save, X } from 'lucide-react';
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

interface Event {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  location: string | null;
  country: string | null;
  is_active: boolean | null;
}

interface EventFormProps {
  onSuccess?: () => void;
  editEvent?: Event | null;
  onCancelEdit?: () => void;
}

export function EventForm({ onSuccess, editEvent, onCancelEdit }: EventFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [country, setCountry] = useState('');
  const [isActive, setIsActive] = useState(true);

  const isEditing = !!editEvent;

  useEffect(() => {
    if (editEvent) {
      setTitle(editEvent.title || '');
      setDescription(editEvent.description || '');
      setEventDate(editEvent.event_date || '');
      setLocation(editEvent.location || '');
      setCountry(editEvent.country || '');
      setIsActive(editEvent.is_active ?? true);
    } else {
      resetForm();
    }
  }, [editEvent]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setEventDate('');
    setLocation('');
    setCountry('');
    setIsActive(true);
  };

  const handleSubmit = async () => {
    if (!title) {
      toast.error('Please enter a title');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditing && editEvent) {
        // Update existing event
        const { error } = await supabase
          .from('upcoming_events')
          .update({
            title,
            description: description || null,
            event_date: eventDate || null,
            location: location || null,
            country: country || null,
            is_active: isActive,
          })
          .eq('id', editEvent.id);

        if (error) throw error;
        toast.success('Event updated successfully!');
      } else {
        // Insert new event
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
      }

      resetForm();
      onCancelEdit?.();
      onSuccess?.();
    } catch (error) {
      console.error('Error saving event:', error);
      toast.error('Failed to save event. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    resetForm();
    onCancelEdit?.();
  };

  return (
    <Card className={isEditing ? 'border-primary' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            {isEditing ? 'Edit Event' : 'Add Upcoming Event'}
          </span>
          {isEditing && (
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-4 w-4" />
            </Button>
          )}
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
            className="min-h-[100px]"
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

        <div className="flex gap-2">
          {isEditing && (
            <Button
              onClick={handleCancel}
              variant="outline"
              className="flex-1 touch-target"
            >
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !title}
            className={`gradient-primary text-primary-foreground touch-target ${isEditing ? 'flex-1' : 'w-full'}`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isEditing ? 'Saving...' : 'Adding...'}
              </>
            ) : (
              <>
                {isEditing ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {isEditing ? 'Save Changes' : 'Add Event'}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
