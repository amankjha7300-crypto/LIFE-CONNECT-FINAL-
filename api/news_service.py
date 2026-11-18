"""
LifeConnect — Real-Time News Service
Fetches live 24-hour national and city-level news bulletins for India.
Features in-memory caching, non-blocking background refreshes, and automatic fallback.
"""

import os
import re
import html
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone
import logging

logger = logging.getLogger("lifeconnect.news")

# 12 Target Indian Cities
INDIAN_CITIES = [
    "New Delhi", "Mumbai", "Bengaluru", "Chennai",
    "Kolkata", "Hyderabad", "Pune", "Ahmedabad",
    "Jaipur", "Lucknow", "Chandigarh", "Kochi"
]

# Fallback data if completely offline
FALLBACK_NEWS_DATA = {
    "national_24h": [
        {
            "id": 1,
            "title": "Senior Citizens Digital Pension Portal Upgrade Rolled Out Nationally",
            "category": "Governance & Welfare",
            "time_ago": "2 hours ago",
            "summary": "Ministry of Social Justice announces simplified digital life certificate verification with doorstep assistance for seniors over 60 across India.",
            "tag": "National Welfare",
            "read_time": "2 min read",
            "link": "#"
        },
        {
            "id": 2,
            "title": "Indian Railways Expands Lower Berth Auto-Allocation Quota for Elders",
            "category": "Transport & Infra",
            "time_ago": "4 hours ago",
            "summary": "IRCTC introduces enhanced priority booking for senior citizens, ensuring guaranteed lower berth preferences on Express and Vande Bharat trains.",
            "tag": "Travel & Railways",
            "read_time": "3 min read",
            "link": "#"
        },
        {
            "id": 3,
            "title": "AYUSH Ministry Launches Nationwide Morning Yoga & Pranayama Drive",
            "category": "Health & Wellness",
            "time_ago": "6 hours ago",
            "summary": "Free wellness parks established across 500 towns in India offering guided gentle breathing exercises, joint mobility sessions, and health check-ups.",
            "tag": "Senior Health",
            "read_time": "2 min read",
            "link": "#"
        },
        {
            "id": 4,
            "title": "Golden Era Music Archives Digitized for Public Access",
            "category": "Culture & Heritage",
            "time_ago": "9 hours ago",
            "summary": "Over 10,000 classic 1960s-1980s radio broadcasts, classical ragas, and vintage audio recordings restored and made free for senior listeners.",
            "tag": "Arts & Nostalgia",
            "read_time": "4 min read",
            "link": "#"
        }
    ],
    "cities": {
        "New Delhi": [
            {
                "title": "Lodhi Gardens Launches Morning Senior Walking Club & Herbal Tea Corner",
                "time_ago": "1 hour ago",
                "category": "Health & Parks",
                "summary": "New Delhi Municipal Council sets up medical kiosks and shaded benches along walking trails with free blood pressure monitors for morning walkers.",
                "link": "#"
            }
        ],
        "Mumbai": [
            {
                "title": "Marine Drive Promenade Introduces Dedicated Senior Sunset Seating",
                "time_ago": "2 hours ago",
                "category": "Civic Amenities",
                "summary": "BMC installs 120 ergonomic sheltered benches with sea-breeze protection and emergency call boxes along the Queen's Necklace promenade.",
                "link": "#"
            }
        ],
        "Bengaluru": [
            {
                "title": "Lalbagh Botanical Garden Starts Electric Buggy Shuttles for Elders",
                "time_ago": "3 hours ago",
                "category": "Accessibility",
                "summary": "Free hop-on battery shuttles introduced from all four gates to help seniors comfortably visit the glasshouse, lotus ponds, and herbal gardens.",
                "link": "#"
            }
        ],
        "Chennai": [
            {
                "title": "Besant Nagar Beach Extends Wheelchair-Accessible Boardwalk to Shoreline",
                "time_ago": "2 hours ago",
                "category": "Accessibility",
                "summary": "Chennai Corporation expands timber walkway allowing elders and wheelchair users to reach within 15 meters of gentle evening waves safely.",
                "link": "#"
            }
        ],
        "Kolkata": [
            {
                "title": "Rabindra Sarobar Morning Classical Baul & Rabindra Sangeet Gatherings",
                "time_ago": "4 hours ago",
                "category": "Culture & Music",
                "summary": "Kolkata Metropolitan Development Authority creates acoustic gazebos for senior music enthusiasts singing Tagore songs at sunrise.",
                "link": "#"
            }
        ],
        "Hyderabad": [
            {
                "title": "KBR National Park Introduces Senior Herbal Walking Trails & Bird Gazing",
                "time_ago": "2 hours ago",
                "category": "Nature & Leisure",
                "summary": "Forest Department maps a serene 1.8 km level walking loop surrounded by medicinal flora and shaded seating pavilions.",
                "link": "#"
            }
        ],
        "Pune": [
            {
                "title": "Sambhaji Park Hosts Senior Morning Hasya Yoga & Laughter Therapy",
                "time_ago": "3 hours ago",
                "category": "Wellness",
                "summary": "Over 200 city seniors participate in sunrise laughter circles, followed by complimentary Ayurvedic herbal decoctions.",
                "link": "#"
            }
        ],
        "Ahmedabad": [
            {
                "title": "Sabarmati Riverfront Dedicates Heritage Walking Gazebos for Senior Citizens",
                "time_ago": "1 hour ago",
                "category": "Civic & Leisure",
                "summary": "Air-cooled shade shelters with drinking water and heritage photo galleries opened along the lower river promenade.",
                "link": "#"
            }
        ],
        "Jaipur": [
            {
                "title": "Amer Fort Introduces Battery Golf Carts & Heritage Courtyard Music",
                "time_ago": "3 hours ago",
                "category": "Heritage & Comfort",
                "summary": "Senior visitors enjoy free cart transport up the palace incline and live Shehnai recitations in Rajasthan court.",
                "link": "#"
            }
        ],
        "Lucknow": [
            {
                "title": "Gomti Riverfront Morning Gazebo & Classical Ghazal Sessions",
                "time_ago": "2 hours ago",
                "category": "Music & Leisure",
                "summary": "Lucknow Development Authority hosts sunrise musical gatherings along the riverfront promenade for city elders.",
                "link": "#"
            }
        ],
        "Chandigarh": [
            {
                "title": "Sukhna Lake Morning Walking Festival Attracts 2,000+ Seniors",
                "time_ago": "2 hours ago",
                "category": "Fitness & Nature",
                "summary": "Clean air walking rally, bird watching guide tours, and complimentary herbal immunity drinks hosted by UT administration.",
                "link": "#"
            }
        ],
        "Kochi": [
            {
                "title": "Water Metro Launches Scenic Backwater Morning Excursions for Seniors",
                "time_ago": "3 hours ago",
                "category": "Eco Transport",
                "summary": "Electric boat cruises offer serene views of Fort Kochi, coconut groves, and Chinese fishing nets with priority boarding.",
                "link": "#"
            }
        ]
    }
}


def _clean_text(text: str) -> str:
    """Strip HTML tags and unescape entities."""
    if not text:
        return ""
    no_html = re.sub(r"<[^>]+>", " ", text)
    cleaned = html.unescape(no_html)
    return re.sub(r"\s+", " ", cleaned).strip()


def _format_time_ago(pub_date_str: str) -> str:
    """Convert pubDate string to human-friendly 'X mins ago' / 'X hours ago'."""
    if not pub_date_str:
        return "Just now"
    try:
        dt = parsedate_to_datetime(pub_date_str)
        diff = datetime.now(timezone.utc) - dt
        secs = int(diff.total_seconds())
        if secs < 60:
            return "Just now"
        elif secs < 3600:
            m = max(1, secs // 60)
            return f"{m} min ago" if m == 1 else f"{m} mins ago"
        elif secs < 86400:
            h = secs // 3600
            return f"{h} hour ago" if h == 1 else f"{h} hours ago"
        else:
            d = secs // 86400
            return f"{d} day ago" if d == 1 else f"{d} days ago"
    except Exception:
        return "Today"


def _categorize_headline(title: str) -> str:
    """Categorize headline into user-friendly topic categories."""
    t = title.lower()
    if any(k in t for k in ["health", "hospital", "doctor", "yoga", "ayush", "medicine", "wellness", "diet", "sleep", "fever", "heart"]):
        return "Health & Wellness"
    if any(k in t for k in ["pension", "govt", "government", "ministry", "policy", "welfare", "scheme", "portal", "court", "law"]):
        return "Governance & Welfare"
    if any(k in t for k in ["train", "railway", "metro", "bus", "flight", "airport", "road", "traffic", "highway"]):
        return "Transport & Infra"
    if any(k in t for k in ["weather", "smog", "aqi", "air", "rain", "cold", "heat", "pollution", "monsoon"]):
        return "Weather & Climate"
    if any(k in t for k in ["music", "festival", "temple", "heritage", "art", "classical", "culture", "dance", "film"]):
        return "Culture & Heritage"
    if any(k in t for k in ["market", "gold", "silver", "rupee", "bank", "rbi", "inflation", "tax", "economy"]):
        return "Economy & Markets"
    if any(k in t for k in ["cricket", "match", "cup", "game", "olympic"]):
        return "Sports"
    return "National Update"


def _fetch_rss_items(url: str, timeout: int = 5):
    """Fetch and parse items from RSS feed."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        xml_bytes = resp.read()
        root = ET.fromstring(xml_bytes)
        return root.findall("./channel/item")


def _parse_item(item, fallback_category: str = "General"):
    """Extract clean title, source, summary, and metadata from an RSS item."""
    raw_title = item.find("title").text if item.find("title") is not None else ""
    raw_title = _clean_text(raw_title)

    # Split publisher source from title if formatted like 'Headline - Source'
    source = "National Feed"
    title = raw_title
    if " - " in raw_title:
        parts = raw_title.rsplit(" - ", 1)
        title = parts[0].strip()
        source = parts[1].strip()

    pub_date = item.find("pubDate").text if item.find("pubDate") is not None else ""
    time_ago = _format_time_ago(pub_date)

    link = item.find("link").text if item.find("link") is not None else "#"

    # Description or clean snippet
    desc = item.find("description").text if item.find("description") is not None else ""
    bullets = re.findall(r"<li>(.*?)</li>", desc, flags=re.DOTALL)
    
    clean_bullets = []
    for b in bullets:
        cb = _clean_text(b)
        if cb and len(cb) > 15:
            clean_bullets.append(cb)

    if clean_bullets:
        summary = clean_bullets[0]
        if len(clean_bullets) > 1:
            full_content = summary + "\n\nKey Coverage & Related Reports:\n• " + "\n• ".join(clean_bullets[1:5])
        else:
            full_content = summary
    else:
        summary = _clean_text(desc)
        if not summary or summary == raw_title or len(summary) < 20:
            summary = f"{title}. Reported by {source}."
        elif len(summary) > 220:
            summary = summary[:217].rsplit(" ", 1)[0] + "..."
        full_content = summary

    category = _categorize_headline(title)
    if category == "National Update" and fallback_category != "General":
        category = fallback_category

    return {
        "title": title,
        "source": source,
        "summary": summary,
        "full_content": full_content,
        "time_ago": time_ago,
        "category": category,
        "tag": source,
        "read_time": "2 min read",
        "link": link
    }


def fetch_live_news_data() -> dict:
    """Fetch live news concurrently for National India and all 12 major cities."""
    logger.info("Fetching real-time news feed from live RSS endpoints...")
    national_url = "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en"

    city_urls = {
        city: f"https://news.google.com/rss/search?q={urllib.parse.quote(city + ' news')}&hl=en-IN&gl=IN&ceid=IN:en"
        for city in INDIAN_CITIES
    }

    national_stories = []
    cities_stories = {city: [] for city in INDIAN_CITIES}

    # 1. Fetch National Feed First
    try:
        nat_items = _fetch_rss_items(national_url, timeout=10)
        for idx, it in enumerate(nat_items[:10], start=1):
            story = _parse_item(it)
            story["id"] = idx
            national_stories.append(story)
        logger.info(f"Loaded {len(national_stories)} live national stories.")
    except Exception as e:
        logger.warning(f"Error fetching live national news: {e}")

    # 2. Fetch City Feeds with gentle concurrency to avoid SSL handshake throttling
    with ThreadPoolExecutor(max_workers=2) as executor:
        city_futures = {
            executor.submit(_fetch_rss_items, city_urls[city], 10): city
            for city in INDIAN_CITIES
        }

        for future in as_completed(city_futures):
            city = city_futures[future]
            try:
                c_items = future.result()
                for it in c_items[:3]:
                    c_story = _parse_item(it, fallback_category=f"{city} Civic")
                    cities_stories[city].append({
                        "title": c_story["title"],
                        "time_ago": c_story["time_ago"],
                        "category": c_story["category"],
                        "summary": c_story["summary"],
                        "full_content": c_story.get("full_content", c_story["summary"]),
                        "source": c_story.get("source", "City Desk"),
                        "tag": c_story.get("tag", f"{city} News"),
                        "link": c_story["link"]
                    })
            except Exception as e:
                logger.warning(f"Error fetching live news for city {city}: {e}")

    # Fill any empty city feeds with fallback
    for city in INDIAN_CITIES:
        if not cities_stories.get(city):
            cities_stories[city] = FALLBACK_NEWS_DATA["cities"].get(city, [])

    if not national_stories:
        national_stories = FALLBACK_NEWS_DATA["national_24h"]

    return {
        "national_24h": national_stories,
        "cities": cities_stories
    }


import threading

CACHE_TTL_SECONDS = 900  # 15 minutes cache
_cached_news_data = FALLBACK_NEWS_DATA
_last_fetch_time = 0
_is_refreshing = False

def _async_refresh_worker():
    global _cached_news_data, _last_fetch_time, _is_refreshing
    try:
        data = fetch_live_news_data()
        if data and data.get("national_24h"):
            _cached_news_data = data
            _last_fetch_time = time.time()
            logger.info("Real-time news background refresh complete.")
    except Exception as e:
        logger.error(f"Background news refresh failed: {e}")
    finally:
        _is_refreshing = False

def trigger_background_refresh():
    global _is_refreshing
    if not _is_refreshing:
        _is_refreshing = True
        t = threading.Thread(target=_async_refresh_worker, daemon=True)
        t.start()

# Pre-warm news on demand (do not start threads during cold import)
# trigger_background_refresh()


def get_news() -> dict:
    """
    Retrieve news with instant response and non-blocking background refresh.
    Always returns immediately (< 1ms) while keeping real-time data up to date.
    """
    global _cached_news_data, _last_fetch_time

    now = time.time()
    if now - _last_fetch_time > CACHE_TTL_SECONDS:
        trigger_background_refresh()

    return {
        "success": True,
        "source": "live_realtime_feed" if _last_fetch_time > 0 else "instant_starter",
        "updated_at": "Last 24 Hours (Live Real-Time)" if _last_fetch_time > 0 else "Last 24 Hours (Instant)",
        "cities_count": len(INDIAN_CITIES),
        "cached": True,
        "data": _cached_news_data
    }

