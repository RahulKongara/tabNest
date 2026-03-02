/**
 * TabNest Constants — core/constants.js
 * Domain dictionary (100+ entries), keyword sets, default groups, default settings.
 * Consumed primarily by GroupingEngine (core/grouping-engine.js).
 */

(function () {
  'use strict';

  /** Lifecycle alarm */
  const ALARM_NAME = 'tabnest-lifecycle-tick';
  const ALARM_PERIOD_MINUTES = 0.5; // 30 seconds

  /** Storage keys */
  const STORAGE_KEYS = {
    SESSION_STATE: 'tabnest_session',
    SETTINGS: 'tabnest_settings',
    WORKSPACES: 'tabnest_workspaces',
    USER_RULES: 'tabnest_user_rules',
    TIMESTAMPS: 'tabnest_timestamps',
  };

  /** Default lifecycle timer settings */
  const DEFAULT_SETTINGS = {
    t1Minutes: 5,
    t2Minutes: 15,
    t3Days: 7,
    autoGroup: true,
    persistSessions: true,
    managePinned: false,
    hoverPreRender: true,
    showRamSavings: true,
    batchSize: 3,
    whitelist: [],
  };

  /**
   * Default context groups.
   * Colors per PRD §7.2. Order defines initial sort order.
   */
  const DEFAULT_GROUPS = [
    { id: 'dev',           name: 'Dev',           color: '#1B6B93', order: 0, isCollapsed: false, isCustom: false },
    { id: 'work',          name: 'Work',          color: '#E67E22', order: 1, isCollapsed: false, isCustom: false },
    { id: 'social',        name: 'Social',        color: '#E91E8C', order: 2, isCollapsed: false, isCustom: false },
    { id: 'shopping',      name: 'Shopping',      color: '#27AE60', order: 3, isCollapsed: false, isCustom: false },
    { id: 'entertainment', name: 'Entertainment', color: '#8E44AD', order: 4, isCollapsed: false, isCustom: false },
    { id: 'news',          name: 'News',          color: '#E74C3C', order: 5, isCollapsed: false, isCustom: false },
    { id: 'research',      name: 'Research',      color: '#00ACC1', order: 6, isCollapsed: false, isCustom: false },
    { id: 'finance',       name: 'Finance',       color: '#F39C12', order: 7, isCollapsed: false, isCustom: false },
    { id: 'lifestyle',     name: 'Lifestyle',     color: '#009688', order: 8, isCollapsed: false, isCustom: false },
    { id: 'other',         name: 'Other',         color: '#95A5A6', order: 9, isCollapsed: false, isCustom: false },
  ];

  /**
   * Domain dictionary — 179 known domains mapped to group IDs.
   * Keys are hostnames WITHOUT www. prefix (stripped before lookup).
   * Values are DEFAULT_GROUPS IDs.
   */
  const DOMAIN_DICT = {
    // --- Dev (30) ---
    'github.com':              'dev',
    'gitlab.com':              'dev',
    'bitbucket.org':           'dev',
    'stackoverflow.com':       'dev',
    'stackexchange.com':       'dev',
    'developer.mozilla.org':   'dev',
    'developer.chrome.com':    'dev',
    'developers.google.com':   'dev',
    'npmjs.com':               'dev',
    'pypi.org':                'dev',
    'crates.io':               'dev',
    'hub.docker.com':          'dev',
    'codepen.io':              'dev',
    'codesandbox.io':          'dev',
    'replit.com':              'dev',
    'vercel.com':              'dev',
    'netlify.com':             'dev',
    'heroku.com':              'dev',
    'railway.app':             'dev',
    'digitalocean.com':        'dev',
    'aws.amazon.com':          'dev',
    'console.aws.amazon.com':  'dev',
    'cloud.google.com':        'dev',
    'portal.azure.com':        'dev',
    'docs.python.org':         'dev',
    'docs.rust-lang.org':      'dev',
    'go.dev':                  'dev',
    'pkg.go.dev':              'dev',
    'learn.microsoft.com':     'dev',
    'devdocs.io':              'dev',

    // --- Work (29) ---
    'docs.google.com':          'work',
    'drive.google.com':         'work',
    'sheets.google.com':        'work',
    'slides.google.com':        'work',
    'forms.google.com':         'work',
    'meet.google.com':          'work',
    'calendar.google.com':      'work',
    'mail.google.com':          'work',
    'gmail.com':                'work',
    'outlook.com':              'work',
    'outlook.office.com':       'work',
    'office.com':               'work',
    'teams.microsoft.com':      'work',
    'zoom.us':                  'work',
    'notion.so':                'work',
    'airtable.com':             'work',
    'trello.com':               'work',
    'asana.com':                'work',
    'monday.com':               'work',
    'clickup.com':              'work',
    'linear.app':               'work',
    'figma.com':                'work',
    'miro.com':                 'work',
    'dropbox.com':              'work',
    'box.com':                  'work',
    'sharepoint.com':           'work',
    'atlassian.com':            'work',
    'jira.atlassian.com':       'work',
    'confluence.atlassian.com': 'work',

    // --- Social (18) ---
    'twitter.com':         'social',
    'x.com':               'social',
    'facebook.com':        'social',
    'instagram.com':       'social',
    'linkedin.com':        'social',
    'reddit.com':          'social',
    'discord.com':         'social',
    'slack.com':           'social',
    'telegram.org':        'social',
    'web.telegram.org':    'social',
    'tiktok.com':          'social',
    'pinterest.com':       'social',
    'tumblr.com':          'social',
    'mastodon.social':     'social',
    'threads.net':         'social',
    'snapchat.com':        'social',
    'whatsapp.com':        'social',
    'web.whatsapp.com':    'social',

    // --- Shopping (16) ---
    'amazon.com':          'shopping',
    'amazon.co.uk':        'shopping',
    'ebay.com':            'shopping',
    'etsy.com':            'shopping',
    'walmart.com':         'shopping',
    'target.com':          'shopping',
    'bestbuy.com':         'shopping',
    'newegg.com':          'shopping',
    'shopify.com':         'shopping',
    'aliexpress.com':      'shopping',
    'wish.com':            'shopping',
    'wayfair.com':         'shopping',
    'costco.com':          'shopping',
    'ikea.com':            'shopping',
    'store.google.com':    'shopping',
    'apple.com':           'shopping',

    // --- Entertainment (17) ---
    'youtube.com':         'entertainment',
    'netflix.com':         'entertainment',
    'spotify.com':         'entertainment',
    'twitch.tv':           'entertainment',
    'hulu.com':            'entertainment',
    'disneyplus.com':      'entertainment',
    'hbomax.com':          'entertainment',
    'max.com':             'entertainment',
    'primevideo.com':      'entertainment',
    'soundcloud.com':      'entertainment',
    'vimeo.com':           'entertainment',
    'dailymotion.com':     'entertainment',
    'crunchyroll.com':     'entertainment',
    'funimation.com':      'entertainment',
    'peacocktv.com':       'entertainment',
    'paramountplus.com':   'entertainment',
    'appletvplus.com':     'entertainment',

    // --- News (20) ---
    'bbc.com':             'news',
    'bbc.co.uk':           'news',
    'cnn.com':             'news',
    'nytimes.com':         'news',
    'theguardian.com':     'news',
    'washingtonpost.com':  'news',
    'reuters.com':         'news',
    'apnews.com':          'news',
    'npr.org':             'news',
    'bloomberg.com':       'news',
    'techcrunch.com':      'news',
    'theverge.com':        'news',
    'wired.com':           'news',
    'arstechnica.com':     'news',
    'hackernews.com':      'news',
    'news.ycombinator.com':'news',
    'politico.com':        'news',
    'axios.com':           'news',
    'economist.com':       'news',
    'ft.com':              'news',

    // --- Research (16) ---
    'scholar.google.com':       'research',
    'researchgate.net':         'research',
    'academia.edu':             'research',
    'arxiv.org':                'research',
    'pubmed.ncbi.nlm.nih.gov':  'research',
    'ncbi.nlm.nih.gov':         'research',
    'semanticscholar.org':      'research',
    'jstor.org':                'research',
    'springer.com':             'research',
    'nature.com':               'research',
    'sciencedirect.com':        'research',
    'wikipedia.org':            'research',
    'en.wikipedia.org':         'research',
    'britannica.com':           'research',
    'wolfram.com':              'research',
    'wolframalpha.com':         'research',

    // --- Finance (18) ---
    'robinhood.com':            'finance',
    'etrade.com':               'finance',
    'schwab.com':               'finance',
    'fidelity.com':             'finance',
    'vanguard.com':             'finance',
    'coinbase.com':             'finance',
    'binance.com':              'finance',
    'paypal.com':               'finance',
    'venmo.com':                'finance',
    'mint.com':                 'finance',
    'chase.com':                'finance',
    'bankofamerica.com':        'finance',
    'wellsfargo.com':           'finance',
    'turbotax.intuit.com':      'finance',
    'quickbooks.intuit.com':    'finance',
    'irs.gov':                  'finance',
    'creditkarma.com':          'finance',
    'nerdwallet.com':           'finance',

    // --- Lifestyle (15) ---
    'allrecipes.com':      'lifestyle',
    'foodnetwork.com':     'lifestyle',
    'epicurious.com':      'lifestyle',
    'webmd.com':           'lifestyle',
    'mayoclinic.org':      'lifestyle',
    'healthline.com':      'lifestyle',
    'tripadvisor.com':     'lifestyle',
    'booking.com':         'lifestyle',
    'airbnb.com':          'lifestyle',
    'expedia.com':         'lifestyle',
    'kayak.com':           'lifestyle',
    'yelp.com':            'lifestyle',
    'goodreads.com':       'lifestyle',
    'strava.com':          'lifestyle',
    'fitness.apple.com':   'lifestyle',
  };

  /**
   * Keyword sets for heuristic classification.
   * Used when domain is not in DOMAIN_DICT.
   * Each keyword match scores +1 for its category.
   * Highest score wins; ties fall back to 'other'.
   *
   * Keywords matched case-insensitively against URL path + tab title combined.
   */
  const KEYWORD_SETS = {
    dev: [
      'api', 'docs', 'sdk', 'deploy', 'debug', 'code', 'repo',
      'commit', 'pull request', 'merge', 'build', 'pipeline',
      'npm', 'yarn', 'webpack', 'vite', 'babel', 'typescript',
      'javascript', 'python', 'golang', 'rust', 'java', 'kotlin',
      'dockerfile', 'kubernetes', 'terraform', 'ci/cd', 'git',
      'endpoint', 'graphql', 'rest', 'openapi', 'swagger',
      'localhost', '127.0.0.1', 'devtools', 'debugger',
    ],
    work: [
      'dashboard', 'spreadsheet', 'presentation', 'document',
      'meeting', 'calendar', 'schedule', 'invoice', 'project',
      'task', 'ticket', 'workflow', 'report', 'proposal',
      'email', 'inbox', 'collaborate', 'workspace', 'team',
      'kanban', 'sprint', 'backlog', 'roadmap', 'milestone',
      'crm', 'erp', 'onboarding', 'hr', 'payroll', 'analytics',
    ],
    social: [
      'feed', 'timeline', 'post', 'tweet', 'profile', 'followers',
      'following', 'message', 'chat', 'group', 'community',
      'notification', 'like', 'comment', 'share', 'story',
      'status', 'friend', 'connect', 'network', 'mention',
    ],
    shopping: [
      'cart', 'checkout', 'product', 'buy', 'price', 'shop',
      'order', 'deal', 'coupon', 'shipping', 'discount',
      'review', 'rating', 'wishlist', 'basket', 'payment',
      'purchase', 'sale', 'store', 'catalogue', 'item',
    ],
    entertainment: [
      'watch', 'video', 'stream', 'movie', 'episode', 'season',
      'playlist', 'music', 'song', 'artist', 'album', 'podcast',
      'game', 'gaming', 'player', 'live', 'channel', 'subscribe',
      'anime', 'series', 'trailer', 'clip', 'highlight',
    ],
    news: [
      'news', 'article', 'headline', 'breaking', 'report',
      'journalist', 'politics', 'election', 'government',
      'economy', 'opinion', 'editorial', 'analysis', 'exclusive',
      'world', 'local', 'technology', 'science', 'health',
      'sports', 'business', 'culture', 'environment',
    ],
    research: [
      'paper', 'journal', 'study', 'thesis', 'abstract',
      'citation', 'doi', 'arxiv', 'pubmed', 'research',
      'academic', 'publication', 'bibliography', 'methodology',
      'findings', 'hypothesis', 'experiment', 'dataset',
      'analysis', 'review', 'literature', 'reference',
    ],
    finance: [
      'stock', 'portfolio', 'investment', 'trading', 'market',
      'crypto', 'bitcoin', 'ethereum', 'bank', 'account',
      'transaction', 'budget', 'expense', 'income', 'tax',
      'loan', 'mortgage', 'insurance', 'dividend', 'etf',
      'mutual fund', 'retirement', '401k', 'ira', 'interest rate',
    ],
    lifestyle: [
      'recipe', 'cooking', 'food', 'restaurant', 'health',
      'fitness', 'workout', 'exercise', 'yoga', 'meditation',
      'travel', 'hotel', 'flight', 'destination', 'vacation',
      'review', 'wellness', 'diet', 'nutrition', 'book',
      'hobby', 'garden', 'home', 'decor', 'fashion', 'beauty',
    ],
    other: [],
  };

  /** Internal pages that are never managed by the lifecycle engine */
  const BROWSER_INTERNAL_PROTOCOLS = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'moz-extension://',
    'browser://',
    'opera://',
    'brave://',
    'devtools://',
  ];

  /**
   * Known dynamic domains — URLs on these hosts may lose state on restore.
   * Used by UrlAnalyzer.isStateful() (DATA-01 / SRS FR-20).
   */
  const DYNAMIC_DOMAINS = [
    'docs.google.com',
    'sheets.google.com',
    'slides.google.com',
    'figma.com',
    'notion.so',
    'airtable.com',
    'miro.com',
    'app.diagrams.net',
    'codepen.io',
    'codesandbox.io',
    'replit.com',
    'stackblitz.com',
  ];

  /** Stage constants */
  const STAGE = {
    ACTIVE:    'active',
    DISCARDED: 'discarded',
    SAVED:     'saved',
    ARCHIVED:  'archived',
  };

  /** Maximum number of workspace snapshots stored (SESS-03) */
  const MAX_WORKSPACES = 20;

  const CONSTANTS = {
    ALARM_NAME,
    ALARM_PERIOD_MINUTES,
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    DEFAULT_GROUPS,
    DOMAIN_DICT,
    KEYWORD_SETS,
    BROWSER_INTERNAL_PROTOCOLS,
    DYNAMIC_DOMAINS,
    STAGE,
    MAX_WORKSPACES,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CONSTANTS };
  }
  globalThis.CONSTANTS = CONSTANTS;

})();
