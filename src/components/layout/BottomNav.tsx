import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calculator, FileText, User, Shield, Home } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function BottomNav() {
  const location = useLocation();
  const { isAdmin } = useAuth();

  const navItems = [
    { path: '/dashboard', icon: Home, label: 'Home' },
    { path: '/calculator', icon: Calculator, label: 'VisaScore' },
    { path: '/salary-slip', icon: FileText, label: 'Salary Slip' },
    { path: '/profile', icon: User, label: 'Profile' },
  ];

  if (isAdmin) {
    navItems.push({ path: '/admin', icon: Shield, label: 'Admin' });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border safe-area-pb">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className="relative flex flex-col items-center justify-center flex-1 h-full touch-target"
            >
              {isActive && (
                <motion.div
                  layoutId="navIndicator"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 rounded-b-full gradient-primary"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <item.icon
                className={`h-6 w-6 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
              <span
                className={`text-xs mt-1 transition-colors ${
                  isActive ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
