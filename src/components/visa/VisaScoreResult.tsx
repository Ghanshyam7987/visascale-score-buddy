import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, TrendingUp, RotateCcw, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface VisaScoreResultProps {
  score: number;
  category: 'Low' | 'Medium' | 'High';
  country: string;
  suggestions: string[];
  onReset: () => void;
}

export function VisaScoreResult({
  score,
  category,
  country,
  suggestions,
  onReset,
}: VisaScoreResultProps) {
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 99) * circumference;
  const offset = circumference - progress;

  const getCategoryStyles = () => {
    switch (category) {
      case 'Low':
        return {
          gradient: 'gradient-score-low',
          textColor: 'text-destructive',
          bgColor: 'bg-destructive/10',
          icon: AlertCircle,
        };
      case 'Medium':
        return {
          gradient: 'gradient-score-medium',
          textColor: 'text-warning',
          bgColor: 'bg-warning/10',
          icon: TrendingUp,
        };
      case 'High':
        return {
          gradient: 'gradient-score-high',
          textColor: 'text-success',
          bgColor: 'bg-success/10',
          icon: CheckCircle2,
        };
    }
  };

  const styles = getCategoryStyles();
  const CategoryIcon = styles.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Score Circle */}
      <Card className="overflow-hidden">
        <div className={`${styles.gradient} p-1`}>
          <CardContent className="bg-card rounded-lg p-8">
            <div className="text-center">
              <p className="text-muted-foreground mb-4">Your VisaScore for</p>
              <h2 className="text-2xl font-bold mb-8">{country}</h2>

              <div className="relative inline-flex items-center justify-center">
                <svg className="w-56 h-56 -rotate-90">
                  {/* Background circle */}
                  <circle
                    cx="112"
                    cy="112"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="12"
                    className="text-muted/30"
                  />
                  {/* Progress circle */}
                  <motion.circle
                    cx="112"
                    cy="112"
                    r={radius}
                    fill="none"
                    stroke="url(#scoreGradient)"
                    strokeWidth="12"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1.5, ease: 'easeOut' }}
                    className="score-circle"
                  />
                  <defs>
                    <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      {category === 'Low' && (
                        <>
                          <stop offset="0%" stopColor="hsl(0, 72%, 51%)" />
                          <stop offset="100%" stopColor="hsl(25, 95%, 53%)" />
                        </>
                      )}
                      {category === 'Medium' && (
                        <>
                          <stop offset="0%" stopColor="hsl(45, 93%, 47%)" />
                          <stop offset="100%" stopColor="hsl(38, 92%, 50%)" />
                        </>
                      )}
                      {category === 'High' && (
                        <>
                          <stop offset="0%" stopColor="hsl(142, 71%, 45%)" />
                          <stop offset="100%" stopColor="hsl(158, 64%, 52%)" />
                        </>
                      )}
                    </linearGradient>
                  </defs>
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <motion.span
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    className="text-6xl font-bold"
                  >
                    {score}
                  </motion.span>
                  <span className="text-muted-foreground text-sm">out of 99</span>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className={`inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-full ${styles.bgColor}`}
              >
                <CategoryIcon className={`h-5 w-5 ${styles.textColor}`} />
                <span className={`font-semibold ${styles.textColor}`}>
                  {category} Approval Chance
                </span>
              </motion.div>
            </div>
          </CardContent>
        </div>
      </Card>

      {/* Suggestions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
      >
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Tips to Improve Your Score
            </h3>
            <ul className="space-y-3">
              {suggestions.map((suggestion, index) => (
                <motion.li
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.2 + index * 0.1 }}
                  className="flex items-start gap-3"
                >
                  <div className="mt-1 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                  <span className="text-muted-foreground">{suggestion}</span>
                </motion.li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* Disclaimer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="bg-muted/50 rounded-lg p-4 text-center"
      >
        <p className="text-sm text-muted-foreground">
          <AlertCircle className="inline h-4 w-4 mr-1" />
          <strong>Disclaimer:</strong> This is an estimation based on general criteria. 
          Actual visa approval depends on embassy evaluation and documentation.
        </p>
      </motion.div>

      {/* Actions */}
      <div className="flex gap-4">
        <Button
          variant="outline"
          className="flex-1 touch-target"
          onClick={onReset}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Calculate Again
        </Button>
        <Button
          className="flex-1 gradient-primary text-primary-foreground touch-target"
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: 'My VisaScore',
                text: `My VisaScore for ${country} is ${score}/99 (${category} approval chance)`,
              });
            }
          }}
        >
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>
      </div>
    </motion.div>
  );
}
