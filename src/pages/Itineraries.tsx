import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { ItineraryList } from '@/components/itinerary/ItineraryList';

const Itineraries = () => {
  return (
    <AppLayout>
      <Header title="Day-Wise Itineraries" showBack />
      <div className="p-4">
        <ItineraryList />
      </div>
    </AppLayout>
  );
};

export default Itineraries;
