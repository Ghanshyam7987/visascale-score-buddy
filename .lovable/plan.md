
Goal: Face coverage slider (70% / 80%) must produce visibly correct output every time. Right now that is not reliable.

What I found
1. Current crop math is correct in principle, but output depends on detected face height.
2. On many devices, native FaceDetector may not be available, so fallback skin-color detection runs.
3. That fallback tends to estimate face/head height inaccurately, so requested 70% can look like a different value.
4. There is no post-crop verification step, so wrong detection goes directly to final output.
5. UI does not show “requested vs achieved”, so mismatch is hard to trust/debug.

Implementation plan

Phase 1: Make face measurement reliable before cropping
- Update `src/lib/visaPhotoProcessor.ts` to always compute a normalized “head box” for coverage calculations (crown-to-chin estimate), not raw detector box directly.
- Detection pipeline order:
  1) Try native FaceDetector on original image.
  2) If unavailable/fail, run improved fallback (central largest skin cluster + geometry constraints) instead of current loose full-skin bbox.
- Convert detector output into a calibrated head box (adds forehead/crown margin and reduces neck influence) so 70% visually matches user expectation.

Phase 2: Add post-crop coverage correction loop
- After first smart crop, re-measure head height on output.
- Compute achievedCoverage = measuredHeadHeight / outputHeight * 100.
- If difference from requested coverage is more than tolerance (for example ±2%), auto-correct scale and recrop (max 2–3 iterations).
- This makes result converge to selected value (70/80 etc.) even when initial detection is imperfect.

Phase 3: Protect framing and geometry consistency
- Ensure crop math uses consistent coordinate space between original and processed images.
- If processed image dimensions differ from source, normalize mapping before crop calculations.
- Keep all non-generative constraints unchanged (no facial reconstruction, no AI beautification).

Phase 4: User-visible confidence indicators (small but important)
- In `src/pages/VisaPhoto.tsx`, show:
  - Requested coverage (e.g., 70%)
  - Achieved coverage (computed)
  - Detection mode used (FaceDetector / Fallback)
- If fallback confidence is low, show a non-blocking hint: “Try clearer front-facing photo for more accurate head sizing.”

Phase 5: Safety fallback for edge cases
- If face/head still cannot be measured reliably:
  - keep current center-crop fallback,
  - but explicitly show “coverage could not be measured” warning so user is informed.
- Maintain existing background whitening and sharpening steps.

Files to update
1. `src/lib/visaPhotoProcessor.ts`
- Add calibrated head-box estimator
- Improve fallback detection
- Add achieved-coverage measurement utility
- Add iterative recrop correction logic
- Return optional processing metadata (requested/achieved/method)

2. `src/pages/VisaPhoto.tsx`
- Consume processing metadata
- Display requested vs achieved coverage + detection method
- Keep current UI flow unchanged otherwise

3. (Only if needed) `supabase/functions/remove-background/index.ts`
- No major logic change required for this specific issue unless dimension mismatch is detected in practice; if mismatch appears, add strict dimension guard and metadata logging.

Acceptance criteria
1. Selecting 70% gives final achieved coverage within ~±2% in most normal front-facing photos.
2. Selecting 80% clearly zooms relative to 70% and reaches target range similarly.
3. Works on devices with and without native FaceDetector.
4. No biometric feature alteration; only background swap + traditional sharpening + crop/resize.
5. User can see measured achieved value in UI after processing.

Test plan after implementation
1. Upload same image at 60%, 70%, 80% and confirm monotonic increase in head size.
2. Test on at least one browser with FaceDetector and one without (fallback path).
3. Verify output dimensions exactly match chosen mm/cm target conversion.
4. Validate background remains pure white and subject geometry is unchanged.
5. Re-test with your shared sample image to confirm 70% now appears correct.

Risk note
- Exact “visual” interpretation of head coverage can vary (hair-inclusive vs forehead-to-chin). I will tune calibration to ICAO-like crown-to-chin behavior so slider values match expected passport photo standards and your observed output more closely.
