# Quick Start Guide

## 🚀 What You Have Now

A complete Valorant round detection system that:
- Automatically detects round timestamps using FFmpeg
- Caches results in Redis for instant access
- Provides a beautiful UI for round navigation
- Scales with worker-based architecture

## 📁 Files Created

### Backend Worker
- `worker/worker.py` - Python worker with FFmpeg scene detection
- `worker/Dockerfile` - Container for Sevalla deployment
- `worker/requirements.txt` - Python dependencies
- `worker/README.md` - Worker documentation

### API Routes
- `pages/api/rounds/process.ts` - Queue video processing
- `pages/api/rounds/status.ts` - Check job status

### Frontend
- `components/RoundTimeline.tsx` - Interactive round navigation
- `components/MatchScene3D.tsx` - Enhanced with round detection

### Documentation
- `DEPLOYMENT.md` - Step-by-step deployment guide
- `walkthrough.md` - Complete system walkthrough

## ⚡ Quick Deploy

### 1. Set Up Redis (5 minutes)
```bash
# 1. Go to upstash.com and create account
# 2. Create Redis database
# 3. Copy Redis URL
# 4. Add to .env.local:
REDIS_URL=rediss://default:xxxxx@xxxxx.upstash.io:6379
```

### 2. Deploy Worker to Sevalla (10 minutes)
```bash
# 1. Push code to GitHub
git add worker/
git commit -m "Add round detection worker"
git push

# 2. Go to sevalla.com
# 3. Create new Docker service
# 4. Connect GitHub repo
# 5. Set REDIS_URL environment variable
# 6. Deploy
```

### 3. Test It Out
```bash
# Start your app
npm run dev

# 1. Search for a Valorant team
# 2. Click a match thumbnail
# 3. Click "Detect Rounds" button
# 4. Wait 30-120 seconds
# 5. See round timeline appear
# 6. Click rounds to jump to them
```

## 🎯 How It Works

1. **User clicks "Detect Rounds"** → Sends video URL to API
2. **API checks cache** → Returns immediately if already processed
3. **If not cached** → Adds job to Redis queue
4. **Worker picks up job** → Downloads video, runs FFmpeg
5. **FFmpeg detects scenes** → Finds round boundaries
6. **Worker clusters rounds** → Groups scenes into rounds
7. **Results cached** → Stored in Redis for 7 days
8. **Frontend polls** → Gets results and displays timeline
9. **User clicks round** → Video jumps to that timestamp

## 🔧 Configuration

### Adjust Scene Detection Sensitivity
Edit `worker/worker.py`:
```python
SCENE_THRESHOLD = 0.4  # Lower = more sensitive (try 0.3)
MIN_ROUND_DURATION = 30  # Minimum round length
MAX_ROUND_DURATION = 180  # Maximum round length
```

### Change Video Quality
Edit `worker/worker.py`:
```python
# Current: 360p-480p
'-f', 'bv*[height<=360]'

# For higher quality (slower):
'-f', 'bv*[height<=720]'
```

## 🐛 Troubleshooting

### "No rounds detected"
- Lower `SCENE_THRESHOLD` to 0.3
- Verify video is a Valorant match
- Check worker logs

### "Processing timeout"
- Video might be too long
- Increase worker resources
- Check worker is running

### "Authentication required"
- Make sure you're logged in
- Verify Clerk configuration

## 📊 Monitoring

### Check Queue
```bash
redis-cli -u "your_redis_url"
LLEN job_queue  # Number of pending jobs
```

### Check Cache
```bash
KEYS rounds:*  # All cached videos
GET rounds:VIDEO_ID  # Specific video rounds
```

### Check Job Status
```bash
GET job:JOB_ID:status  # Job status
GET job:JOB_ID:result  # Job result
```

## 💰 Costs

- **Upstash Redis:** Free tier (10k commands/day)
- **Sevalla Worker:** ~$10-20/month (1 CPU, 2GB RAM)
- **Total:** ~$10-20/month for testing

## 📈 Scaling

### More Users?
- Increase worker instances in Sevalla
- Upgrade Redis plan if needed

### Faster Processing?
- Increase worker CPU/RAM
- Lower video resolution
- Add more worker instances

## 🎉 You're Ready!

Everything is implemented and ready to deploy. Follow the steps in `DEPLOYMENT.md` for detailed instructions.

**Next:** Deploy to Sevalla and test with real Valorant VODs!
