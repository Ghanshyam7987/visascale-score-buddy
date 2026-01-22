import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { UpcomingEvents } from '@/components/events/UpcomingEvents';

const Events = () => {
  return (
    <AppLayout>
      <Header title="Upcoming Events" showBack />
      <div className="p-4">
        <UpcomingEvents />
      </div>
    </AppLayout>
  );
};

export default Events;
