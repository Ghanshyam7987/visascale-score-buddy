import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, TrendingUp, RotateCcw, Share2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getCountrySuggestions } from '@/lib/visaScoreCalculator';

interface VisaScoreResultProps {
  score: number;
  category: 'Low' | 'Medium' | 'High';
  country: string;
  suggestions: string[];
  onReset: () => void;
}

function GaugeChart({ score, category }: { score: number; category: 'Low' | 'Medium' | 'High' }) {
  // Gauge spans from -135deg to +135deg (270 deg total)
  const totalAngle = 270;
  const startAngle = -135;
  const needleAngle = startAngle + (score / 99) * totalAngle;
  const radius = 100;
  const cx = 120;
  const cy = 120;

  const polarToCartesian = (angle: number, r: number) => {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const createArc = (startDeg: number, endDeg: number, r: number) => {
    const start = polarToCartesian(startDeg, r);
    const end = polarToCartesian(endDeg, r);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  // Zone boundaries: Red 0-40, Yellow 40-70, Green 70-99
  const redEnd = startAngle + (40 / 99) * totalAngle;
  const yellowEnd = startAngle + (70 / 99) * totalAngle;
  const greenEnd = startAngle + totalAngle;

  const needleTip = polarToCartesian(needleAngle, radius - 15);

  return (
    <div className="flex flex-col items-center">
      <svg width="240" height="160" viewBox="0 0 240 160">
        {/* Red zone */}
        <path d={createArc(startAngle, redEnd, radius)} fill="none" stroke="hsl(0, 72%, 51%)" strokeWidth="18" strokeLinecap="round" opacity="0.7" />
        {/* Yellow zone */}
        <path d={createArc(redEnd, yellowEnd, radius)} fill="none" stroke="hsl(45, 93%, 47%)" strokeWidth="18" strokeLinecap="round" opacity="0.7" />
        {/* Green zone */}
        <path d={createArc(yellowEnd, greenEnd, radius)} fill="none" stroke="hsl(142, 71%, 45%)" strokeWidth="18" strokeLinecap="round" opacity="0.7" />

        {/* Needle */}
        <motion.line
          x1={cx}
          y1={cy}
          initial={{ x2: cx, y2: cy }}
          animate={{ x2: needleTip.x, y2: needleTip.y }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          stroke="hsl(var(--foreground))"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r="6" fill="hsl(var(--foreground))" />

        {/* Labels */}
        <text x="20" y="150" className="fill-destructive text-[10px] font-medium">0</text>
        <text x="108" y="20" className="fill-muted-foreground text-[10px] font-medium">50</text>
        <text x="210" y="150" className="fill-success text-[10px] font-medium">99</text>
      </svg>

      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
        className="text-center -mt-4"
      >
        <span className="text-5xl font-bold">{score}</span>
        <span className="text-muted-foreground text-sm block">out of 99</span>
      </motion.div>
    </div>
  );
}

export function VisaScoreResult({
  score,
  category,
  country,
  suggestions,
  onReset,
}: VisaScoreResultProps) {
  const getCategoryStyles = () => {
    switch (category) {
      case 'Low':
        return { gradient: 'gradient-score-low', textColor: 'text-destructive', bgColor: 'bg-destructive/10', icon: AlertCircle };
      case 'Medium':
        return { gradient: 'gradient-score-medium', textColor: 'text-warning', bgColor: 'bg-warning/10', icon: TrendingUp };
      case 'High':
        return { gradient: 'gradient-score-high', textColor: 'text-success', bgColor: 'bg-success/10', icon: CheckCircle2 };
    }
  };

  const styles = getCategoryStyles();
  const CategoryIcon = styles.icon;
  const countrySuggestions = getCountrySuggestions(score, category);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Gauge Chart */}
      <Card className="overflow-hidden">
        <div className={`${styles.gradient} p-1`}>
          <CardContent className="bg-card rounded-lg p-8">
            <div className="text-center">
              <p className="text-muted-foreground mb-2">Your VisaScore for</p>
              <h2 className="text-2xl font-bold mb-6">{country}</h2>
              <GaugeChart score={score} category={category} />
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className={`inline-flex items-center gap-2 mt-4 px-6 py-3 rounded-full ${styles.bgColor}`}
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

      {/* Country Suggestions for low/medium scores */}
      {countrySuggestions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
        >
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Countries You Can Apply To
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Based on your score, these countries have higher approval chances:
              </p>
              <div className="flex flex-wrap gap-2">
                {countrySuggestions.map((c, i) => (
                  <motion.span
                    key={c}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1 + i * 0.1 }}
                    className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium"
                  >
                    {c}
                  </motion.span>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

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
        <Button variant="outline" className="flex-1 touch-target" onClick={onReset}>
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