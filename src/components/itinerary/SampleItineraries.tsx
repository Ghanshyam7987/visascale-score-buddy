import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  Globe,
  MapPin,
  Sparkles,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Sun,
  Sunrise,
  Moon,
  Train,
  Bed,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SAMPLE_ITINERARIES,
  type ItineraryDay,
  type TimeSlot,
} from '@/data/sampleItineraries';
import { cn } from '@/lib/utils';

// ----------------- Helpers to read a day regardless of shape -----------------

type DayKind = 'arrival' | 'departure' | 'transit' | 'sightseeing' | 'legacy';

function dayKind(d: ItineraryDay): DayKind {
  if ('type' in d) return d.type;
  return 'legacy';
}

function kindBadge(kind: DayKind) {
  switch (kind) {
    case 'arrival':
      return { label: 'Arrival', icon: PlaneLanding, className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' };
    case 'departure':
      return { label: 'Departure', icon: PlaneTakeoff, className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' };
    case 'transit':
      return { label: 'Transit', icon: Train, className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' };
    case 'sightseeing':
      return { label: 'Full Day', icon: Sun, className: 'bg-teal-500/15 text-teal-700 dark:text-teal-300' };
    default:
      return { label: 'Day', icon: MapPin, className: 'bg-muted text-muted-foreground' };
  }
}

function daySummary(d: ItineraryDay): string {
  switch (dayKind(d)) {
    case 'arrival':
      return (d as Extract<ItineraryDay, { type: 'arrival' }>).summary;
    case 'departure':
      return (d as Extract<ItineraryDay, { type: 'departure' }>).summary;
    case 'transit': {
      const t = d as Extract<ItineraryDay, { type: 'transit' }>;
      return `Transit: ${t.from} → ${t.to}`;
    }
    case 'sightseeing': {
      const s = d as Extract<ItineraryDay, { type: 'sightseeing' }>;
      return s.morning.activity;
    }
    default:
      return (d as { activity: string }).activity;
  }
}

// ----------------- Slot row -----------------

function SlotRow({
  icon: Icon,
  label,
  slot,
  tint,
}: {
  icon: typeof Sun;
  label: string;
  slot: TimeSlot;
  tint: string;
}) {
  return (
    <div className="flex gap-3">
      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', tint)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
            {label}
          </span>
          <span className="text-[11px] text-muted-foreground">{slot.time}</span>
        </div>
        <p className="mt-0.5 text-sm leading-snug text-foreground">{slot.activity}</p>
        {slot.transport && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            <span className="font-medium">Transport:</span> {slot.transport}
          </p>
        )}
      </div>
    </div>
  );
}

// ----------------- Day body renderer -----------------

function DayBody({ d }: { d: ItineraryDay }) {
  const kind = dayKind(d);

  if (kind === 'sightseeing') {
    const s = d as Extract<ItineraryDay, { type: 'sightseeing' }>;
    return (
      <div className="space-y-3">
        <SlotRow
          icon={Sunrise}
          label="Morning"
          slot={s.morning}
          tint="bg-amber-500/15 text-amber-700 dark:text-amber-300"
        />
        <SlotRow
          icon={Sun}
          label="Afternoon"
          slot={s.afternoon}
          tint="bg-orange-500/15 text-orange-700 dark:text-orange-300"
        />
        <SlotRow
          icon={Moon}
          label="Evening"
          slot={s.evening}
          tint="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
        />
      </div>
    );
  }

  if (kind === 'transit') {
    const t = d as Extract<ItineraryDay, { type: 'transit' }>;
    return (
      <div className="space-y-2 text-sm">
        {t.checkout && (
          <p><span className="font-semibold">Check-out:</span> {t.checkout}</p>
        )}
        <p className="flex items-start gap-2">
          <Train className="h-4 w-4 mt-0.5 text-amber-600" />
          <span><span className="font-semibold">Transport:</span> {t.transport}</span>
        </p>
        {t.checkin && (
          <p><span className="font-semibold">Check-in:</span> {t.checkin}</p>
        )}
        {t.evening && (
          <p className="flex items-start gap-2">
            <Moon className="h-4 w-4 mt-0.5 text-indigo-500" />
            <span><span className="font-semibold">Evening:</span> {t.evening}</span>
          </p>
        )}
      </div>
    );
  }

  if (kind === 'arrival' || kind === 'departure') {
    const ad = d as Extract<ItineraryDay, { type: 'arrival' | 'departure' }>;
    return (
      <div className="space-y-2 text-sm">
        <p className="flex items-start gap-2">
          <Plane className="h-4 w-4 mt-0.5 text-primary" />
          <span>{ad.summary}</span>
        </p>
        {'arrival_time' in ad && ad.arrival_time && (
          <p><span className="font-semibold">Arrival:</span> {ad.arrival_time}</p>
        )}
        {'checkout_time' in ad && ad.checkout_time && (
          <p><span className="font-semibold">Check-out:</span> {ad.checkout_time}</p>
        )}
        {ad.transport && (
          <p><span className="font-semibold">Transport:</span> {ad.transport}</p>
        )}
      </div>
    );
  }

  // legacy
  return (
    <p className="text-sm text-foreground">{(d as { activity: string }).activity}</p>
  );
}

export function SampleItineraries() {
  const countries = useMemo(() => Object.keys(SAMPLE_ITINERARIES), []);
  const [country, setCountry] = useState<string>(countries[0]);
  const [open, setOpen] = useState(false);

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
          Visa-ready plans broken into Morning / Afternoon / Evening with timings, transport and hotel areas.
        </p>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Country
            </label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">{country}</span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-0 w-[--radix-popover-trigger-width] max-h-[60vh]"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Search country..." />
                  <CommandList>
                    <CommandEmpty>No countries found.</CommandEmpty>
                    <CommandGroup>
                      {countries.map((c) => (
                        <CommandItem
                          key={c}
                          value={c}
                          onSelect={() => {
                            handleCountryChange(c);
                            setOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              country === c ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          {c}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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

        <Accordion
          type="multiple"
          defaultValue={days.length ? [`day-${days[0].day}`] : []}
          className="space-y-2"
        >
          {days.map((d) => {
            const kind = dayKind(d);
            const meta = kindBadge(kind);
            const Icon = meta.icon;
            return (
              <AccordionItem
                key={`${country}-${nights}-${d.day}`}
                value={`day-${d.day}`}
                className="rounded-lg border border-border/60 bg-card/60 px-3"
              >
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex w-full items-start gap-3 text-left">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                      {d.day}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', meta.className)}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                          <Bed className="h-3 w-3" />
                          {d.hotel_location}
                          {d.hotel_area ? ` • ${d.hotel_area}` : ''}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm font-medium text-foreground">
                        {daySummary(d)}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pl-12 pr-1">
                  <DayBody d={d} />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}