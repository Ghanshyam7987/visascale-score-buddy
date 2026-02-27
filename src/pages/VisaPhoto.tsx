import { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Upload, Download, RotateCcw, Loader2, ZoomIn, ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { processVisaPhoto, type ProcessingOptions, type ProcessingMetadata } from '@/lib/visaPhotoProcessor';

// Common passport photo presets
const PRESETS = [
  { label: 'India (51×51 mm)', w: 51, h: 51, unit: 'mm' as const, face: 70 },
  { label: 'US (2×2 inch)', w: 50.8, h: 50.8, unit: 'mm' as const, face: 69 },
  { label: 'Schengen (35×45 mm)', w: 35, h: 45, unit: 'mm' as const, face: 70 },
  { label: 'UK (35×45 mm)', w: 35, h: 45, unit: 'mm' as const, face: 70 },
  { label: 'Canada (50×70 mm)', w: 50, h: 70, unit: 'mm' as const, face: 62 },
  { label: 'Australia (35×45 mm)', w: 35, h: 45, unit: 'mm' as const, face: 68 },
  { label: 'Japan (35×45 mm)', w: 35, h: 45, unit: 'mm' as const, face: 70 },
  { label: 'China (33×48 mm)', w: 33, h: 48, unit: 'mm' as const, face: 66 },
  { label: 'Custom', w: 35, h: 45, unit: 'mm' as const, face: 70 },
];

const VisaPhoto = () => {
  // State
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ProcessingMetadata | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [tiltAngle, setTiltAngle] = useState(0);
  const [isLevel, setIsLevel] = useState(true);

  // Dimensions
  const [preset, setPreset] = useState('Schengen (35×45 mm)');
  const [width, setWidth] = useState(35);
  const [height, setHeight] = useState(45);
  const [unit, setUnit] = useState<'mm' | 'cm'>('mm');
  const [faceCoverage, setFaceCoverage] = useState(70);
  const [sharpening, setSharpening] = useState(50);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const autoProcessRef = useRef<Blob | null>(null);

  // Gyroscope / device orientation for leveler
  useEffect(() => {
    if (!showCamera) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      // gamma = left-right tilt (-90 to 90)
      const gamma = e.gamma ?? 0;
      setTiltAngle(gamma);
      setIsLevel(Math.abs(gamma) < 3);
    };

    // Try to request permission on iOS
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      (DeviceOrientationEvent as any).requestPermission().then((response: string) => {
        if (response === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation);
        }
      }).catch(() => {});
    } else {
      window.addEventListener('deviceorientation', handleOrientation);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [showCamera]);

  // Preset handler
  const handlePresetChange = (label: string) => {
    setPreset(label);
    const p = PRESETS.find(pr => pr.label === label);
    if (p && label !== 'Custom') {
      setWidth(p.w);
      setHeight(p.h);
      setUnit(p.unit);
      setFaceCoverage(p.face);
    }
  };

  // File upload — auto-trigger processing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    setSourceBlob(file);
    setSourceImage(URL.createObjectURL(file));
    setResultImage(null);
    setMetadata(null);
    // Auto-process after a brief delay to allow state to settle
    setTimeout(() => {
      autoProcessRef.current = file;
    }, 100);
  };

  // Camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      setShowCamera(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      toast.error('Camera access denied');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        setSourceBlob(blob);
        setSourceImage(URL.createObjectURL(blob));
        setResultImage(null);
        setMetadata(null);
        // Auto-process after capture
        setTimeout(() => {
          autoProcessRef.current = blob;
        }, 100);
      }
    }, 'image/jpeg', 0.95);
    stopCamera();
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setShowCamera(false);
  };

  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  // Auto-process effect: triggers processing when autoProcessRef is set
  useEffect(() => {
    const interval = setInterval(() => {
      if (autoProcessRef.current && !processing) {
        const blob = autoProcessRef.current;
        autoProcessRef.current = null;
        // Trigger processing
        setProcessing(true);
        setResultImage(null);
        setMetadata(null);

        const opts: ProcessingOptions = {
          dimensions: { width, height, unit },
          faceCoveragePercent: faceCoverage,
          sharpeningStrength: sharpening,
        };

        processVisaPhoto(blob, opts, (step, pct) => {
          setProgressText(step);
          setProgressPercent(pct);
        }).then(result => {
          setResultImage(result.imageDataUrl);
          setMetadata(result.metadata);
          toast.success('Photo processed successfully!');
        }).catch(err => {
          console.error(err);
          toast.error('Processing failed. Try a clearer photo.');
        }).finally(() => {
          setProcessing(false);
        });
      }
    }, 200);
    return () => clearInterval(interval);
  }, [processing, width, height, unit, faceCoverage, sharpening]);

  // Process
  const handleProcess = useCallback(async () => {
    if (!sourceBlob) {
      toast.error('Please upload or capture a photo first');
      return;
    }

    setProcessing(true);
    setResultImage(null);
    setMetadata(null);

    const options: ProcessingOptions = {
      dimensions: { width, height, unit },
      faceCoveragePercent: faceCoverage,
      sharpeningStrength: sharpening,
    };

    try {
      const result = await processVisaPhoto(sourceBlob, options, (step, pct) => {
        setProgressText(step);
        setProgressPercent(pct);
      });
      setResultImage(result.imageDataUrl);
      setMetadata(result.metadata);
      toast.success('Photo processed successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Processing failed. Try a clearer photo.');
    } finally {
      setProcessing(false);
    }
  }, [sourceBlob, width, height, unit, faceCoverage, sharpening]);

  // Download
  const handleDownload = () => {
    if (!resultImage) return;
    const a = document.createElement('a');
    a.href = resultImage;
    a.download = `visa-photo-${width}x${height}${unit}.jpg`;
    a.click();
  };

  // Reset
  const handleReset = () => {
    setSourceImage(null);
    setSourceBlob(null);
    setResultImage(null);
    setMetadata(null);
    setProgressPercent(0);
    setProgressText('');
  };

  return (
    <AppLayout>
      <Header title="Visa Photo Tool" />
      <div className="p-4 pb-24 space-y-4 max-w-lg mx-auto">

        {/* Camera Fullscreen — NO silhouettes, with gyroscope leveler */}
        <AnimatePresence>
          {showCamera && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black flex flex-col"
            >
              <div className="relative flex-1">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Floating instruction text */}
                <div className="absolute top-8 left-0 right-0 flex justify-center pointer-events-none">
                  <div className="bg-black/60 backdrop-blur-sm rounded-full px-5 py-2.5">
                    <p className="text-white text-sm font-medium text-center">
                      Look straight. Neutral face. Remove glasses.
                    </p>
                  </div>
                </div>

                {/* Gyroscope Leveler indicator */}
                <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
                  <div className="flex items-center gap-3 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
                    {/* Tilt bar */}
                    <div className="w-32 h-1.5 bg-white/20 rounded-full relative overflow-hidden">
                      <div
                        className={`absolute top-0 h-full w-4 rounded-full transition-all duration-150 ${isLevel ? 'bg-green-400' : 'bg-red-400'}`}
                        style={{
                          left: `${Math.max(0, Math.min(100, 50 + tiltAngle * 2))}%`,
                          transform: 'translateX(-50%)',
                        }}
                      />
                      {/* Center mark */}
                      <div className="absolute top-0 left-1/2 -translate-x-px w-0.5 h-full bg-white/50" />
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full ${isLevel ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className={`text-xs font-medium ${isLevel ? 'text-green-400' : 'text-red-400'}`}>
                      {isLevel ? 'Level' : 'Tilt'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6 p-6 bg-black">
                <Button variant="outline" onClick={stopCamera} className="text-white border-white/30">
                  Cancel
                </Button>
                <Button
                  onClick={capturePhoto}
                  className="w-16 h-16 rounded-full bg-white hover:bg-white/90"
                >
                  <Camera className="h-8 w-8 text-black" />
                </Button>
                <div className="w-20" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Source Selection */}
        {!sourceImage && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ImageIcon className="h-5 w-5" /> Select Photo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={startCamera} className="w-full gap-2" variant="outline">
                <Camera className="h-4 w-4" /> Take Photo
              </Button>
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="w-full gap-2"
              >
                <Upload className="h-4 w-4" /> Upload Photo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </CardContent>
          </Card>
        )}

        {/* Preview Source */}
        {sourceImage && !resultImage && !processing && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardContent className="p-4">
                <div className="relative">
                  <img
                    src={sourceImage}
                    alt="Source"
                    className="w-full rounded-lg max-h-80 object-contain bg-muted"
                  />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    onClick={handleReset}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Settings */}
        {sourceImage && !processing && !resultImage && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Photo Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Preset */}
                <div className="space-y-1.5">
                  <Label>Country Preset</Label>
                  <Select value={preset} onValueChange={handlePresetChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRESETS.map(p => (
                        <SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dimensions */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Width ({unit})</Label>
                    <Input
                      type="number"
                      value={width}
                      onChange={e => { setWidth(Number(e.target.value)); setPreset('Custom'); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Height ({unit})</Label>
                    <Input
                      type="number"
                      value={height}
                      onChange={e => { setHeight(Number(e.target.value)); setPreset('Custom'); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Unit</Label>
                    <Select value={unit} onValueChange={(v: 'mm' | 'cm') => setUnit(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mm">mm</SelectItem>
                        <SelectItem value="cm">cm</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Face Coverage */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Face Coverage</Label>
                    <span className="text-sm text-muted-foreground font-medium">{faceCoverage}%</span>
                  </div>
                  <Slider
                    value={[faceCoverage]}
                    onValueChange={([v]) => setFaceCoverage(v)}
                    min={50}
                    max={90}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Head height as % of photo height (ICAO: 60-80%)
                  </p>
                </div>

                {/* Sharpening */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Sharpening</Label>
                    <span className="text-sm text-muted-foreground font-medium">{sharpening}%</span>
                  </div>
                  <Slider
                    value={[sharpening]}
                    onValueChange={([v]) => setSharpening(v)}
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>

                <Button onClick={handleProcess} className="w-full gap-2" size="lg">
                  <ZoomIn className="h-4 w-4" /> Process Photo
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Processing */}
        {processing && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="font-medium">{progressText}</span>
              </div>
              <Progress value={progressPercent} />
              <p className="text-xs text-muted-foreground text-center">
                Background removal may take 15-30 seconds.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Result */}
        {resultImage && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-center">✅ Processed Photo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center bg-muted rounded-lg p-4">
                  <img
                    src={resultImage}
                    alt="Visa Photo Result"
                    className="max-h-80 object-contain rounded shadow-lg"
                    style={{ imageRendering: 'auto' }}
                  />
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  {width}×{height} {unit} @ 300 DPI • White background • ICAO compliant
                </p>
                {metadata && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Requested Coverage</span>
                      <span className="font-medium">{metadata.requestedCoverage}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Achieved Coverage</span>
                      <span className="font-medium">{metadata.achievedCoverage}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Detection</span>
                      <span className="font-medium capitalize">
                        {metadata.detectionMethod === 'native' ? 'Face API' : metadata.detectionMethod === 'fallback' ? 'Skin Analysis' : 'None'}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Confidence</span>
                      <span className={`font-medium capitalize ${metadata.confidence === 'high' ? 'text-green-600' : metadata.confidence === 'medium' ? 'text-yellow-600' : 'text-red-500'}`}>
                        {metadata.confidence}
                      </span>
                    </div>
                    {metadata.confidence === 'low' && (
                      <p className="text-xs text-yellow-600 mt-1">
                        💡 Try a clearer front-facing photo for more accurate head sizing.
                      </p>
                    )}
                  </div>
                )}
                <div className="flex gap-3">
                  <Button onClick={handleDownload} className="flex-1 gap-2">
                    <Download className="h-4 w-4" /> Download
                  </Button>
                  <Button onClick={handleReset} variant="outline" className="flex-1 gap-2">
                    <RotateCcw className="h-4 w-4" /> New Photo
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
};

export default VisaPhoto;
