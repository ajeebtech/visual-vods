# Deployment Guide

## Prerequisites

1. **Upstash Redis Account** (for job queue and caching)
   - Sign up at [upstash.com](https://upstash.com)
   - Create a Redis database
   - Get the Redis URL

2. **Sevalla Account** (for worker hosting)
   - Sign up at [sevalla.com](https://sevalla.com)
   - You'll deploy the worker here

## Step 1: Set Up Redis (Upstash)

1. Go to [console.upstash.com](https://console.upstash.com)
2. Click "Create Database"
3. Choose a name (e.g., "valorant-rounds")
4. Select region closest to your users
5. Click "Create"
6. Copy the **Redis URL** (starts with `rediss://`)

## Step 2: Configure Environment Variables

Add to your `.env.local`:

```bash
# Redis URL from Upstash
REDIS_URL=rediss://default:xxxxx@xxxxx.upstash.io:6379
```

## Step 3: Deploy Worker to Sevalla

### Option A: Deploy via GitHub (Recommended)

1. **Push worker code to GitHub:**
   ```bash
   git add worker/
   git commit -m "Add Valorant round detection worker"
   git push
   ```

2. **Create Sevalla service:**
   - Go to [sevalla.com](https://sevalla.com) dashboard
   - Click "New Service"
   - Choose "Docker Container"
   - Connect your GitHub repository
   - Set build context to `worker/`
   - Set Dockerfile path to `worker/Dockerfile`

3. **Configure environment variables in Sevalla:**
   ```
   REDIS_URL=rediss://default:xxxxx@xxxxx.upstash.io:6379
   ```

4. **Deploy:**
   - Click "Deploy"
   - Wait for build to complete
   - Worker will start automatically

### Option B: Deploy via Docker (Manual)

1. **Build Docker image:**
   ```bash
   cd worker
   docker build -t valorant-worker .
   ```

2. **Push to Docker Hub:**
   ```bash
   docker tag valorant-worker your-username/valorant-worker
   docker push your-username/valorant-worker
   ```

3. **Deploy to Sevalla:**
   - Create new service
   - Choose "Docker Image"
   - Enter: `your-username/valorant-worker`
   - Set environment variables
   - Deploy

## Step 4: Test Locally (Optional)

Before deploying, test the worker locally:

1. **Install dependencies:**
   ```bash
   cd worker
   pip install -r requirements.txt
   ```

2. **Install FFmpeg:**
   ```bash
   # macOS
   brew install ffmpeg
   
   # Ubuntu/Debian
   sudo apt-get install ffmpeg
   ```

3. **Set Redis URL:**
   ```bash
   export REDIS_URL="rediss://default:xxxxx@xxxxx.upstash.io:6379"
   ```

4. **Test with a video:**
   ```bash
   python worker.py --test "https://www.youtube.com/watch?v=VIDEO_ID"
   ```

   This should output JSON with detected rounds.

5. **Run worker in queue mode:**
   ```bash
   python worker.py
   ```

   Leave this running and test from your Next.js app.

## Step 5: Test End-to-End

1. **Start your Next.js app:**
   ```bash
   npm run dev
   ```

2. **Search for a Valorant match**
3. **Click on a match thumbnail**
4. **Click "Detect Rounds" button**
5. **Wait for processing** (30 seconds - 2 minutes depending on video length)
6. **See round timeline appear**

## Monitoring

### Check Worker Logs (Sevalla)
- Go to your service in Sevalla dashboard
- Click "Logs" tab
- Watch for processing messages

### Check Redis Queue (Upstash)
```bash
# Install redis-cli
brew install redis

# Connect to Upstash
redis-cli -u "rediss://default:xxxxx@xxxxx.upstash.io:6379"

# Check queue length
LLEN job_queue

# View cached rounds
KEYS rounds:*

# Get specific round data
GET rounds:VIDEO_ID
```

### Check Job Status
```bash
# Check job status
GET job:JOB_ID:status

# Check job result
GET job:JOB_ID:result
```

## Troubleshooting

### Worker not processing jobs
1. Check worker is running in Sevalla
2. Verify Redis URL is correct
3. Check worker logs for errors
4. Verify job was added to queue: `LLEN job_queue`

### "Authentication required" error
1. Make sure you're logged in
2. Check Clerk is configured correctly
3. Verify Supabase JWT template exists

### No rounds detected
1. Try lowering `SCENE_THRESHOLD` in `worker.py` (default: 0.4, try 0.3)
2. Check video is actually a Valorant match
3. Verify FFmpeg is working: `ffmpeg -version`

### Processing timeout
1. Video might be too long (>2 hours)
2. Worker might be slow - check Sevalla resources
3. Increase `maxAttempts` in polling function

## Scaling

### Increase Worker Capacity
- In Sevalla, increase CPU/RAM allocation
- Add more worker instances for parallel processing

### Optimize Processing
- Lower video resolution in `worker.py` (currently 360p-480p)
- Adjust scene threshold for faster detection
- Cache more aggressively (increase TTL)

## Costs

### Upstash Redis (Free Tier)
- 10,000 commands/day
- 256 MB storage
- Should be sufficient for testing

### Sevalla
- Pricing varies by resources
- Start with 1 CPU, 2GB RAM (~$10-20/month)
- Scale up as needed

## Next Steps

1. ✅ Deploy worker to Sevalla
2. ✅ Test with real Valorant VODs
3. ✅ Adjust scene threshold if needed
4. ✅ Monitor performance and costs
5. ✅ Scale up when ready for production
