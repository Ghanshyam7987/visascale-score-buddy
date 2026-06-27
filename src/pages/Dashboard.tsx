import { motion } from 'framer-motion';
import { Calculator, FileText, TrendingUp, Clock, Map, Calendar, Newspaper, FileCheck, ScrollText, ScanFace } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/contexts/AuthContext';

const Dashboard = () => {
  const { profile } = useAuth();

  const quickActions = [
    { path: '/calculator', icon: Calculator, title: 'Calculate VisaScore', desc: 'Check your approval chances', color: 'bg-primary/10 text-primary' },
    { path: '/salary-slip', icon: FileText, title: 'Salary Slip', desc: 'Generate PDF salary slip', color: 'bg-accent/10 text-accent' },
    { path: '/passport-extractor', icon: ScanFace, title: 'Bulk Passport Extractor', desc: 'Fast OCR & Auto-Verify', color: 'bg-primary/10 text-primary' },
    { path: '/cover-letter', icon: ScrollText, title: 'Cover Letter', desc: 'Generate visa cover letter', color: 'bg-primary/10 text-primary' },
    { path: '/noc', icon: FileCheck, title: 'Parents NOC', desc: 'No Objection Certificate', color: 'bg-accent/10 text-accent' },
    { path: '/itineraries', icon: Map, title: 'Itineraries', desc: 'Browse travel itineraries', color: 'bg-secondary/10 text-secondary-foreground' },
    { path: '/events', icon: Calendar, title: 'Upcoming Events', desc: 'Worldwide travel events', color: 'bg-muted text-muted-foreground' },
    { path: '/visa-news', icon: Newspaper, title: 'Visa News', desc: 'Latest visa updates', color: 'bg-primary/10 text-primary' },
  ];

  return (
    <AppLayout>
      <Header title="VisaScore" />
      
      <div className="p-4 space-y-6">
        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="gradient-hero rounded-2xl p-6 text-white"
        >
          <p className="text-white/70">Welcome back,</p>
          <h2 className="text-2xl font-bold">{profile?.full_name || 'User'}</h2>
          <div className="flex items-center gap-2 mt-4 text-sm">
            <Clock className="h-4 w-4" />
            <span>Subscription: {profile?.subscription_status === 'active' ? 'Active' : 'Inactive'}</span>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">Quick Actions</h3>
          {quickActions.map((action, i) => (
            <motion.div
              key={action.path}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link to={action.path}>
                <Card className="hover:shadow-lg transition-shadow">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={`p-3 rounded-xl ${action.color}`}>
                      <action.icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">{action.title}</h4>
                      <p className="text-sm text-muted-foreground">{action.desc}</p>
                    </div>
                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
