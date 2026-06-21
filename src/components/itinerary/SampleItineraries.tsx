import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, MapPin, Search, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SAMPLE_ITINERARIES } from '@/data/sampleItineraries';

export function SampleItineraries() {
  const countries = useMemo(() => Object.keys(SAMPLE_ITINERARIES), []);
  const [country, setCountry] = useState<string>(countries[0]);
  const [search, setSearch] = useState('');

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => c.toLowerCase().includes(q));
  }, [countries, search]);

  const nightsOptions = useMemo(() => {
    return Object.keys(SAMPLE_ITINERARIES[country] || {}).sort(
      (a, b) => parseInt(a) - parseInt(b)
    );
  }, [country]);

  const [nights, setNights] = useState<string>(nightsOptions[0]);

  const handleCountryChange = (next: string) => {
    setCountry(next);
    const firstNights = Object.keys(SAMPLE_ITINERARIES[next] || {}).sort(
      (a, b) => parseInt(a) - parseInt(b)
    )[0];
    setNights(firstNights);
  };

  const days = SAMPLE_ITINERARIES[country]?.[nights] || [];

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className="bg-gradient-to-r from-teal-500/10 to-emerald-500/10 pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Sample Day-Wise Itineraries
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Ready-to-use plans for your visa application. Pick a country and duration.
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search countries (e.g. Italy, Dubai)"
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Country
            </label>
            <Select value={country} onValueChange={handleCountryChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filteredCountries.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                    No countries found
                  </div>
                ) : (
                  filteredCountries.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Duration
            </label>
            <Select value={nights} onValueChange={setNights}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {nightsOptions.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary" className="text-xs">
            <Globe className="h-3 w-3 mr-1" />
            {country}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {nights} • {days.length} Days
          </Badge>
        </div>

        <div className="space-y-2">
          {days.map((d, idx) => (
            <motion.div
              key={`${country}-${nights}-${d.day}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="flex gap-3 rounded-lg border border-border/60 bg-card/60 p-3"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                {d.day}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{d.activity}</p>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {d.hotel_location}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}