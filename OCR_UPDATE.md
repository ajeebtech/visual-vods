# OCR-Based Round Detection - Update Summary

## What Changed

Based on your feedback about how Valorant rounds actually work, I've completely rewritten the round detection logic to be much more accurate.

## Old Approach ❌
- Generic FFmpeg scene detection
- Clustered scenes based on timing gaps
- Not specific to Valorant

## New Approach ✅

### 1. **OCR Text Detection**
- Uses **Tesseract OCR** to find "ROUND WIN" text on screen
- Samples frames every 2 seconds
- Detects the exact moment each round ends
- Much more accurate than generic scene detection

### 2. **Gameplay Period Detection**
- Finds gaps larger than **3 minutes** (no gameplay)
- Identifies when match ends (post-game lobby, etc.)
- Filters out non-gameplay timestamps

### 3. **Smart Round Building**
```
Round 1: [gameplay start] → [first "ROUND WIN"]
Round 2: [first win + 5s] → [second "ROUND WIN"]
Round 3: [second win + 5s] → [third "ROUND WIN"]
...
```

## How It Works Now

1. **Download video** (360p-480p for speed)
2. **Find gameplay periods** - Detect 3+ minute gaps
3. **Scan for "ROUND WIN" text** - OCR every 2 seconds
4. **Build rounds** - Each round ends at "ROUND WIN", starts 5s after previous
5. **Filter** - Only keep rounds 30-300 seconds long
6. **Cache** - Store in Redis for 7 days

## Updated Files

### Worker
- `worker/worker.py` - Replaced scene detection with OCR
- `worker/requirements.txt` - Added pytesseract and Pillow
- `worker/Dockerfile` - Added Tesseract OCR installation
- `worker/README.md` - Updated documentation

### Configuration
```python
MIN_ROUND_DURATION = 30  # Minimum round length
MAX_ROUND_DURATION = 300  # Maximum round length
sample_interval = 2  # OCR sampling rate (seconds)
gap_threshold = 180  # 3 minutes = match end
```

## Installation Requirements

### Local Testing
```bash
# macOS
brew install tesseract

# Ubuntu/Debian
sudo apt-get install tesseract-ocr tesseract-ocr-eng

# Python dependencies
pip install pytesseract Pillow
```

### Docker (Sevalla)
Already included in updated Dockerfile - no extra steps needed!

## Expected Results

Much more accurate round detection because:
- ✅ Detects actual "ROUND WIN" text (not guessing from scenes)
- ✅ Knows when match ends (3-minute gap)
- ✅ Builds rounds based on game logic
- ✅ Filters out false positives

## Testing

```bash
cd worker
python worker.py --test "https://youtube.com/watch?v=VALORANT_VOD"
```

Should output:
```json
{
  "success": true,
  "rounds": [
    {"round": 1, "start": 120.0, "end": 245.5, "duration": 125.5},
    {"round": 2, "start": 250.5, "end": 380.0, "duration": 129.5},
    ...
  ],
  "total_rounds": 13
}
```

## Next Steps

Same deployment process as before:
1. Set up Upstash Redis
2. Deploy to Sevalla (Dockerfile already updated)
3. Test with real Valorant VODs

The OCR approach should give you **much more accurate** round timestamps! 🎯
