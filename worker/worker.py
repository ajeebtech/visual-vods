#!/usr/bin/env python3
"""
Valorant Round Detection Worker
Uses FFmpeg scene detection to identify round boundaries in Valorant VODs
"""

import os
import sys
import json
import subprocess
import tempfile
import re
from typing import List, Dict, Optional
from urllib.parse import urlparse, parse_qs
import redis
import time
import ssl

# Redis connection with SSL fix for local testing
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')

# Handle SSL certificate verification for Upstash
if REDIS_URL.startswith('rediss://'):
    redis_client = redis.from_url(
        REDIS_URL, 
        decode_responses=True,
        ssl_cert_reqs=ssl.CERT_NONE  # Skip SSL verification for local testing
    )
else:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)

# Configuration
SCENE_THRESHOLD = 0.4  # Scene change threshold (0.3-0.5 works well for Valorant)
MIN_ROUND_DURATION = 30  # Minimum round duration in seconds
MAX_ROUND_DURATION = 180  # Maximum round duration in seconds


def extract_video_id(url: str) -> Optional[str]:
    """Extract YouTube video ID from URL"""
    parsed = urlparse(url)
    
    if 'youtu.be' in parsed.netloc:
        return parsed.path.lstrip('/')
    elif 'youtube.com' in parsed.netloc:
        if '/watch' in parsed.path:
            query = parse_qs(parsed.query)
            return query.get('v', [None])[0]
        elif '/embed/' in parsed.path:
            return parsed.path.split('/embed/')[1].split('?')[0]
    
    return None


def download_video(video_url: str, output_path: str) -> bool:
    """Download low-res video using yt-dlp"""
    try:
        print(f"Downloading video: {video_url}")
        
        # Download low-res video (360p max) for faster processing
        cmd = [
            'yt-dlp',
            '-f', 'bv*[height<=360][ext=mp4]/b[height<=360][ext=mp4]/bv*[height<=480][ext=mp4]/b[height<=480][ext=mp4]',
            '--no-playlist',
            '-o', output_path,
            video_url
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)  # 15 minutes timeout
        
        if result.returncode != 0:
            print(f"Error downloading video: {result.stderr}")
            return False
        
        print(f"Video downloaded successfully to {output_path}")
        return True
        
    except subprocess.TimeoutExpired:
        print("Video download timed out")
        return False
    except Exception as e:
        print(f"Error downloading video: {e}")
        return False


def extract_keyframes_and_detect_rounds(video_url: str, temp_dir: str) -> tuple:
    """
    Extract keyframes directly from YouTube without downloading full video
    Much faster than downloading entire video
    Returns (round_win_timestamps, gameplay_periods)
    """
    try:
        print(f"Extracting keyframes from: {video_url}")
        
        # Get video info first (duration, etc.)
        info_cmd = [
            'yt-dlp',
            '--dump-json',
            '--no-playlist',
            video_url
        ]
        
        info_result = subprocess.run(info_cmd, capture_output=True, text=True, timeout=30)
        if info_result.returncode != 0:
            print(f"Error getting video info: {info_result.stderr}")
            return ([], [])
        
        video_info = json.loads(info_result.stdout)
        duration = video_info.get('duration', 3600)
        print(f"Video duration: {duration} seconds")
        
        # Extract frames at intervals using FFmpeg through yt-dlp
        # We'll sample every 5 seconds (ROUND WIN text stays on screen for ~3-5 seconds)
        round_win_timestamps = []
        scene_changes = []
        
        sample_interval = 5  # Check every 5 seconds (faster processing)
        
        print(f"Scanning {int(duration/sample_interval)} frames for 'ROUND WIN' text...")
        
        for timestamp in range(0, int(duration), sample_interval):
            # Extract single frame at this timestamp directly from YouTube
            # Using yt-dlp with FFmpeg to seek and extract frame
            frame_path = os.path.join(temp_dir, f'frame_{timestamp}.jpg')
            
            frame_cmd = [
                'yt-dlp',
                '-f', 'bv*[height<=480]',  # Low res for speed
                '--no-playlist',
                '--external-downloader', 'ffmpeg',
                '--external-downloader-args', f'ffmpeg_i:-ss {timestamp} -frames:v 1',
                '-o', frame_path,
                video_url
            ]
            
            try:
                # Run with short timeout per frame
                frame_result = subprocess.run(frame_cmd, capture_output=True, text=True, timeout=15)
                
                if frame_result.returncode == 0 and os.path.exists(frame_path):
                    # Run OCR on this frame
                    import pytesseract
                    from PIL import Image
                    
                    image = Image.open(frame_path)
                    
                    # Convert to grayscale for better OCR accuracy
                    gray = image.convert('L')
                    
                    text = pytesseract.image_to_string(gray).upper()
                    
                    # Check for "ROUND WIN"
                    if 'ROUND' in text and 'WIN' in text:
                        print(f"Found 'ROUND WIN' at {timestamp}s")
                        round_win_timestamps.append(float(timestamp))
                    
                    # Track scene changes for gameplay detection
                    scene_changes.append(float(timestamp))
                    
                    # Clean up frame
                    os.remove(frame_path)
                    
                    # Progress indicator
                    if timestamp % 60 == 0:
                        print(f"Progress: {timestamp}/{int(duration)}s ({int(timestamp/duration*100)}%)")
                        
            except subprocess.TimeoutExpired:
                print(f"Frame extraction timeout at {timestamp}s, skipping...")
                continue
            except Exception as e:
                # Skip this frame if any error
                if os.path.exists(frame_path):
                    os.remove(frame_path)
                continue
        
        print(f"Found {len(round_win_timestamps)} 'ROUND WIN' occurrences")
        
        # Detect gameplay periods from scene changes
        gameplay_periods = []
        if scene_changes:
            current_start = scene_changes[0]
            last_timestamp = scene_changes[0]
            
            for timestamp in scene_changes[1:]:
                gap = timestamp - last_timestamp
                
                # If gap > 3 minutes, gameplay has ended
                if gap > 180:
                    gameplay_periods.append((current_start, last_timestamp))
                    current_start = timestamp
                
                last_timestamp = timestamp
            
            # Add final period
            gameplay_periods.append((current_start, last_timestamp))
        
        print(f"Found {len(gameplay_periods)} gameplay period(s)")
        
        return (round_win_timestamps, gameplay_periods)
        
    except Exception as e:
        print(f"Error extracting keyframes: {e}")
        return ([], [])


def build_rounds_from_wins(round_win_timestamps: List[float], gameplay_periods: List[tuple]) -> List[Dict]:
    """
    Build round data from 'ROUND WIN' timestamps
    Each round ends at a 'ROUND WIN' and starts after the previous one
    """
    if not round_win_timestamps:
        return []
    
    rounds = []
    
    # Filter round wins to only those within gameplay periods
    valid_wins = []
    for win_time in round_win_timestamps:
        for start, end in gameplay_periods:
            if start <= win_time <= end:
                valid_wins.append(win_time)
                break
    
    if not valid_wins:
        return []
    
    # First round starts at beginning of first gameplay period
    # or 30 seconds before first round win (buy phase)
    first_gameplay_start = gameplay_periods[0][0] if gameplay_periods else 0
    
    for i, win_time in enumerate(valid_wins):
        if i == 0:
            # First round: start from gameplay start or 30s before win
            round_start = max(first_gameplay_start, win_time - 90)
        else:
            # Subsequent rounds: start a few seconds after previous win
            round_start = valid_wins[i - 1] + 5
        
        round_end = win_time
        duration = round_end - round_start
        
        # Only add if duration is reasonable (30-300 seconds)
        if 30 <= duration <= 300:
            rounds.append({
                'round': len(rounds) + 1,
                'start': round(round_start, 2),
                'end': round(round_end, 2),
                'duration': round(duration, 2)
            })
    
    return rounds


def process_video(video_url: str) -> Dict:
    """Main processing function - now uses keyframe extraction (no full download!)"""
    video_id = extract_video_id(video_url)
    
    if not video_id:
        return {
            'success': False,
            'error': 'Invalid YouTube URL'
        }
    
    # Check cache first
    cache_key = f'rounds:{video_id}'
    cached = redis_client.get(cache_key)
    if cached:
        print(f"Found cached results for {video_id}")
        return json.loads(cached)
    
    # Create temp directory for frames
    with tempfile.TemporaryDirectory() as temp_dir:
        # Extract keyframes and detect rounds (no full video download!)
        round_win_timestamps, gameplay_periods = extract_keyframes_and_detect_rounds(video_url, temp_dir)
        
        if not gameplay_periods:
            return {
                'success': False,
                'error': 'No gameplay detected'
            }
        
        if not round_win_timestamps:
            return {
                'success': False,
                'error': 'No rounds detected - could not find "ROUND WIN" text'
            }
        
        # Build rounds from win timestamps
        rounds = build_rounds_from_wins(round_win_timestamps, gameplay_periods)
        
        if not rounds:
            return {
                'success': False,
                'error': 'Could not build rounds from detected wins'
            }
        
        result = {
            'success': True,
            'video_id': video_id,
            'video_url': video_url,
            'rounds': rounds,
            'total_rounds': len(rounds),
            'processed_at': time.time()
        }
        
        # Cache result for 7 days
        redis_client.setex(cache_key, 7 * 24 * 60 * 60, json.dumps(result))
        
        print(f"Detected {len(rounds)} rounds")
        return result


def process_job(job_data: Dict) -> Dict:
    """Process a job from the queue"""
    try:
        video_url = job_data.get('videoUrl')
        job_id = job_data.get('jobId')
        
        print(f"Processing job {job_id}: {video_url}")
        
        # Update job status to processing
        redis_client.setex(f'job:{job_id}:status', 3600, 'processing')
        
        # Process video
        result = process_video(video_url)
        
        # Store result
        redis_client.setex(f'job:{job_id}:result', 3600, json.dumps(result))
        redis_client.setex(f'job:{job_id}:status', 3600, 'completed')
        
        print(f"Job {job_id} completed successfully")
        return result
        
    except Exception as e:
        print(f"Error processing job: {e}")
        redis_client.setex(f'job:{job_id}:status', 3600, 'failed')
        redis_client.setex(f'job:{job_id}:error', 3600, str(e))
        return {
            'success': False,
            'error': str(e)
        }


def worker_loop():
    """Main worker loop - polls Redis queue for jobs"""
    print("Worker started, waiting for jobs...")
    
    while True:
        try:
            # Block and wait for a job (BRPOP with 5 second timeout)
            result = redis_client.brpop('job_queue', timeout=5)
            
            if result:
                queue_name, job_json = result
                job_data = json.loads(job_json)
                process_job(job_data)
            
        except KeyboardInterrupt:
            print("\nWorker stopped")
            break
        except Exception as e:
            print(f"Error in worker loop: {e}")
            time.sleep(5)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        # Test mode - process a single video
        if len(sys.argv) < 3:
            print("Usage: python worker.py --test <youtube_url>")
            sys.exit(1)
        
        video_url = sys.argv[2]
        result = process_video(video_url)
        print(json.dumps(result, indent=2))
    else:
        # Worker mode - process jobs from queue
        worker_loop()
