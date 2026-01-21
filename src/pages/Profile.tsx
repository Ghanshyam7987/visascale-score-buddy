import { motion } from 'framer-motion';
import { User, Mail, Phone, LogOut, CreditCard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const Profile = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <AppLayout>
      <Header title="Profile" />
      <div className="p-4 space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="p-6 text-center">
              <div className="w-20 h-20 rounded-full gradient-primary mx-auto flex items-center justify-center mb-4">
                <User className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-xl font-bold">{profile?.full_name || 'User'}</h2>
              <p className="text-muted-foreground">{profile?.email}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{profile?.email || 'Not set'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Subscription</p>
                  <p className="font-medium capitalize">{profile?.subscription_status || 'Inactive'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <Button onClick={handleLogout} variant="destructive" className="w-full touch-target">
          <LogOut className="mr-2 h-5 w-5" />
          Sign Out
        </Button>
      </div>
    </AppLayout>
  );
};

export default Profile;
