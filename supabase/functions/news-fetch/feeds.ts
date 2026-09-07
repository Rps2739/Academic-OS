/**
 * Curated per-category RSS/Atom feed list. Every URL here was verified
 * reachable with a real HTTP GET (curl, browser User-Agent) on 2026-09-07 —
 * see memory/project_next_audit_task.md for the substitutions made when the
 * originally-planned source was dead or bot-blocked (VentureBeat, Moneycontrol,
 * IMF Blog, CFR, Scroll.in, DT Next all failed and were swapped out).
 *
 * Feeds rot. If a category starts reporting a source in `failedFeeds`
 * persistently, re-verify that URL with curl before assuming it's a bug here.
 */
export interface Feed {
  url: string;
  source: string;
}

export const FEEDS: Record<string, Feed[]> = {
  ai: [
    { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch" },
    { url: "https://www.technologyreview.com/feed/", source: "MIT Technology Review" },
    { url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", source: "The Verge" },
    { url: "https://openai.com/blog/rss.xml", source: "OpenAI" },
    { url: "https://blog.google/technology/ai/rss/", source: "Google AI" },
  ],
  tech: [
    { url: "https://feeds.arstechnica.com/arstechnica/index", source: "Ars Technica" },
    { url: "https://www.theverge.com/rss/index.xml", source: "The Verge" },
    { url: "https://techcrunch.com/feed/", source: "TechCrunch" },
    { url: "https://hnrss.org/frontpage", source: "Hacker News" },
    { url: "https://www.wired.com/feed/rss", source: "Wired" },
  ],
  business: [
    { url: "https://www.business-standard.com/rss/home_page_top_stories.rss", source: "Business Standard" },
    { url: "https://www.livemint.com/rss/companies", source: "Mint" },
    { url: "https://economictimes.indiatimes.com/rssfeedstopstories.cms", source: "Economic Times" },
    { url: "https://www.thehindubusinessline.com/feeder/default.rss", source: "BusinessLine" },
  ],
  finance: [
    { url: "https://www.livemint.com/rss/markets", source: "Mint Markets" },
    { url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", source: "ET Markets" },
    { url: "https://www.thehindubusinessline.com/portfolio/feeder/default.rss", source: "BusinessLine Portfolio" },
  ],
  economics: [
    { url: "https://www.livemint.com/rss/economy", source: "Mint Economy" },
    { url: "https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms", source: "ET Economy" },
    { url: "https://www.thehindubusinessline.com/economy/feeder/default.rss", source: "BusinessLine Economy" },
    { url: "https://www.thehindu.com/business/Economy/feeder/default.rss", source: "The Hindu Economy" },
  ],
  geopolitics: [
    { url: "https://thediplomat.com/feed/", source: "The Diplomat" },
    { url: "https://www.aljazeera.com/xml/rss/all.xml", source: "Al Jazeera" },
    { url: "https://foreignpolicy.com/feed/", source: "Foreign Policy" },
    { url: "https://www.thehindu.com/news/international/feeder/default.rss", source: "The Hindu World" },
    { url: "https://warontherocks.com/feed/", source: "War on the Rocks" },
  ],
  "india-national": [
    { url: "https://www.thehindu.com/news/national/feeder/default.rss", source: "The Hindu National" },
    { url: "https://www.thehindu.com/opinion/editorial/feeder/default.rss", source: "The Hindu Editorial" },
    { url: "https://indianexpress.com/section/india/feed/", source: "Indian Express" },
    { url: "https://feeds.feedburner.com/ndtvnews-india-news", source: "NDTV" },
    { url: "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms", source: "TOI India" },
  ],
  "india-states": [
    { url: "https://indianexpress.com/section/cities/feed/", source: "Indian Express Cities" },
    { url: "https://www.thehindu.com/news/states/feeder/default.rss", source: "The Hindu States" },
  ],
  "india-tn": [
    { url: "https://www.thehindu.com/news/national/tamil-nadu/feeder/default.rss", source: "The Hindu Tamil Nadu" },
    { url: "https://timesofindia.indiatimes.com/rssfeeds/-2128833038.cms", source: "TOI Chennai" },
    { url: "https://indianexpress.com/section/cities/chennai/feed/", source: "Indian Express Chennai" },
  ],
};

export const CATEGORY_KEYS = Object.keys(FEEDS);
