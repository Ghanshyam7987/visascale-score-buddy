import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { ItineraryList } from '@/components/itinerary/ItineraryList';
import { SampleItineraries } from '@/components/itinerary/SampleItineraries';

const Itineraries = () => {
  return (
    <AppLayout>
      <Header title="Day-Wise Itineraries" showBack />
      <div className="p-4 space-y-4">
        <SampleItineraries />
        <ItineraryList />
      </div>
    </AppLayout>
  );
};

export default Itineraries;
