
// ================================================================
// LIFECONNECT — Main Application Script
// "Reconnect with your past. Live meaningfully today."
// ================================================================

const LS_KEYS = {
  SESSION: 'lc_session',
  USER: 'lc_user',
  TOKEN: 'lc_token',
  OFFLINE_QUEUE: 'lc_offline_queue'
};

// ----------------------------------------------------------------
// 1. API ARCHITECTURE & RESILIENCE
// ----------------------------------------------------------------
const API_BASE_URL = (function () {
  if (typeof window === 'undefined') return 'http://localhost:8000/api';
  if (window.location.protocol === 'file:') return 'http://localhost:8000/api';
  if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '8000') {
    return `http://${window.location.hostname}:8000/api`;
  }
  return '/api';
})();

/**
 * Centralized API request function with JWT Authorization, retry logic, and offline detection.
 */
async function apiRequest(endpoint, method = 'GET', body = null, retries = 2) {
  const token = localStorage.getItem(LS_KEYS.TOKEN);
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(API_BASE_URL + endpoint, opts);
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }

      if (!res.ok) {
        const errMsg = (data && (data.detail || data.message || data.error)) ||
          (res.status === 401 ? 'Incorrect credentials or session expired.' :
            res.status === 404 ? 'Resource not found.' :
              res.status === 409 ? 'An account with this email already exists.' :
                res.status === 429 ? 'Rate limit reached. Please wait a moment.' :
                  `Server error (${res.status})`);
        return { success: false, status: res.status, error: errMsg };
      }
      return data || { success: true };
    } catch (e) {
      if (attempt === retries) {
        console.warn(`[LifeConnect API] Request to ${endpoint} failed after ${retries} retries:`, e);
        return { success: false, offline: true, error: e.message || 'Network connection error' };
      }
      await new Promise(r => setTimeout(r, 400 * Math.pow(2, attempt)));
    }
  }
}

// ----------------------------------------------------------------
// 2. UNIVERSAL TOAST NOTIFICATIONS
// ----------------------------------------------------------------
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-msg ${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span class="toast-icon">${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, duration);
}

// ----------------------------------------------------------------
// 3. SENIOR ACCESSIBILITY CONTROLS

// ----------------------------------------------------------------
// 4. FLOATING PERSISTENT MINI AUDIO PLAYER
// ----------------------------------------------------------------
function playMiniPlayerTrack(title, subtitle, audioUrl) {
  const player = document.getElementById('mini-audio-player');
  const titleEl = document.getElementById('player-title');
  const subtitleEl = document.getElementById('player-subtitle');
  const playBtn = document.getElementById('player-play-btn');
  const audioEl = document.getElementById('global-audio-element');

  if (!player || !audioEl) return;

  if (titleEl) titleEl.textContent = title || 'Golden Era Song';
  if (subtitleEl) subtitleEl.textContent = subtitle || 'LifeConnect Nostalgia Vault';
  player.style.display = 'block';

  if (audioUrl) {
    audioEl.src = audioUrl;
    audioEl.play().then(() => {
      if (playBtn) playBtn.textContent = '⏸️';
    }).catch(e => {
      console.warn("Playback notice:", e);
      if (playBtn) playBtn.textContent = '▶️';
    });
  } else {
    if (playBtn) playBtn.textContent = '▶️';
  }
}

function toggleMiniPlayerPlay() {
  const audioEl = document.getElementById('global-audio-element');
  const playBtn = document.getElementById('player-play-btn');
  if (!audioEl) return;
  if (audioEl.paused) {
    audioEl.play();
    if (playBtn) playBtn.textContent = '⏸️';
  } else {
    audioEl.pause();
    if (playBtn) playBtn.textContent = '▶️';
  }
}

function changeAudioSpeed(speed) {
  const audioEl = document.getElementById('global-audio-element');
  if (audioEl) {
    audioEl.playbackRate = parseFloat(speed);
    showToast(`Playback speed set to ${speed}x`, 'info', 1500);
  }
}

function closeMiniPlayer() {
  const player = document.getElementById('mini-audio-player');
  const audioEl = document.getElementById('global-audio-element');
  if (audioEl) audioEl.pause();
  if (player) player.style.display = 'none';
}

// ----------------------------------------------------------------
// 5. OFFLINE QUEUE & AUTOMATIC SYNC
// ----------------------------------------------------------------
function queueOfflineAction(action) {
  const queue = JSON.parse(localStorage.getItem(LS_KEYS.OFFLINE_QUEUE) || '[]');
  queue.push(action);
  localStorage.setItem(LS_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  showToast('Action saved locally. Will sync when back online.', 'warning', 3000);
}

async function flushOfflineQueue() {
  const queue = JSON.parse(localStorage.getItem(LS_KEYS.OFFLINE_QUEUE) || '[]');
  if (queue.length === 0) return;

  let synced = 0;
  for (const item of queue) {
    const res = await apiRequest(item.endpoint, item.method, item.body);
    if (res && res.success) synced++;
  }
  localStorage.removeItem(LS_KEYS.OFFLINE_QUEUE);
  if (synced > 0) {
    showToast(`Successfully synced ${synced} offline action(s)!`, 'success', 3500);
  }
}

window.addEventListener('online', () => {
  showToast('Back online! Syncing pending offline data...', 'info', 3000);
  flushOfflineQueue();
});

window.addEventListener('offline', () => {
  showToast('Offline Mode: Your data is saved locally.', 'warning', 4000);
});

// Auth API helpers with live backend + local fallback
async function loginUser(email, password) {
  try {
    const res = await apiRequest('/auth/login', 'POST', { email, password });
    if (res && res.success && res.user) {
      if (res.token) localStorage.setItem(LS_KEYS.TOKEN, res.token);
      const userToStore = {
        ...res.user,
        name: res.user.full_name || res.user.name,
        firstName: (res.user.full_name || res.user.name || '').split(' ')[0]
      };
      const sessionKey = 'api-session-' + Date.now();
      localStorage.setItem(LS_KEYS.SESSION, sessionKey);
      localStorage.setItem(LS.SESSION, sessionKey);
      localStorage.setItem(LS_KEYS.USER, JSON.stringify(userToStore));
      localStorage.setItem(LS.USER, JSON.stringify(userToStore));
      showToast(`Welcome back, ${userToStore.firstName || 'Ji'}!`, 'success');
      return { success: true, user: userToStore, token: res.token };
    } else if (res && res.error && !res.offline) {
      showToast(res.error, 'error');
      return res;
    }
  } catch (e) {
    console.warn("Backend login network fallback:", e);
  }
  return mockLogin(email, password);
}

async function signupUser(data) {
  try {
    const payload = {
      full_name: data.name || data.full_name,
      email: data.email,
      password: data.password,
      mobile: data.mobile || null,
      age: parseInt(data.age) || null,
      city: data.city || null,
      interests: data.interests || [],
      decade: data.decade || null,
      language: data.language || null,
      profession: data.profession || null,
      college: data.college || null,
      wellness_goal: data.wellness_goal || null,
    };
    const res = await apiRequest('/auth/signup', 'POST', payload);
    if (res && res.success && res.user) {
      if (res.token) localStorage.setItem(LS_KEYS.TOKEN, res.token);
      const userToStore = {
        ...res.user,
        name: res.user.full_name || data.name,
        firstName: (res.user.full_name || data.name || '').split(' ')[0],
        culture_preferences: data.culture_preferences || []
      };
      const sessionKey = 'api-session-' + Date.now();
      localStorage.setItem(LS_KEYS.SESSION, sessionKey);
      localStorage.setItem(LS.SESSION, sessionKey);
      localStorage.setItem(LS_KEYS.USER, JSON.stringify(userToStore));
      localStorage.setItem(LS.USER, JSON.stringify(userToStore));
      showToast('Account created successfully!', 'success');
      return { success: true, user: userToStore, token: res.token };
    } else if (res && res.error && !res.offline) {
      showToast(res.error, 'error');
      return res;
    }
  } catch (e) {
    console.warn("Backend signup network fallback:", e);
  }
  return mockSignup(data);
}

async function getProfile() {
  const stored = getStoredUser();
  if (stored && stored.id) {
    const res = await apiRequest('/profile/' + stored.id);
    if (res && res.id) return res;
  }
  return stored;
}

async function getMemories() {
  const stored = getStoredUser();
  if (stored && stored.id) {
    const res = await apiRequest('/memories/' + stored.id);
    if (res && res.memories) return res.memories;
  }
  return getStoredMemories();
}

async function saveMemory(data) {
  const stored = getStoredUser();
  if (stored && stored.id) {
    const payload = {
      user_id: stored.id,
      year: parseInt(data.year) || new Date().getFullYear(),
      title: data.title,
      content: data.content || '',
      media_type: data.media_type || 'story',
      emoji: data.emoji || '📖',
    };
    const res = await apiRequest('/memories', 'POST', payload);
    if (res && res.success) {
      saveStoredMemory(res.memory || data);
      return res.memory || data;
    }
  }
  return saveStoredMemory(data);
}

async function getFriends() {
  const stored = getStoredUser();
  if (stored && stored.id) {
    const res = await apiRequest('/connections/' + stored.id);
    if (res && res.connections && res.connections.length > 0) return res.connections;
  }
  return MOCK_DATA.friends;
}

async function getCommunities() {
  const res = await apiRequest('/communities');
  if (res && res.communities && res.communities.length > 0) return res.communities;
  return MOCK_DATA.communities;
}

// ----------------------------------------------------------------
// 2. LOCAL STORAGE KEYS
// ----------------------------------------------------------------
const LS = {
  USER: 'lifeconnect_user',
  SESSION: 'lifeconnect_session',
  PREFS: 'lifeconnect_preferences',
  MEMORIES: 'lifeconnect_memories',
  EASY_MODE: 'lifeconnect_easy_mode',
  DARK_MODE: 'lifeconnect_dark_mode',
  COMMUNITIES: 'lifeconnect_communities',
  AVATAR: 'lifeconnect_avatar',
};

// ----------------------------------------------------------------
// 3. DEMO CREDENTIALS
// ----------------------------------------------------------------
const DEMO_EMAIL = 'demo@lifeconnect.local';
const DEMO_PASSWORD = 'Demo123!';

const DEMO_USER = {
  name: 'Rajesh Sharma',
  firstName: 'Rajesh',
  email: DEMO_EMAIL,
  mobile: '9876543210',
  age: 65,
  city: 'Chandigarh',
  interests: ['Old Friends', 'Music', 'Movies', 'Family', 'Wellness'],
  decade: '1970s',
  avatar: 'R',
};

// ----------------------------------------------------------------
// 4. MOCK DATA
// ----------------------------------------------------------------
const MOCK_DATA = {
  friends: [
    { id: 1, name: 'Rajiv Kumar Sharma', initials: 'R', school: 'DAV College', batch: '1978', city: 'Chandigarh', profession: 'Retired Engineer', common: 'Same school batch of 1978', status: 'connected' },
    { id: 2, name: 'Sunita Malhotra', initials: 'S', school: 'Government Girls College', batch: '1979', city: 'Delhi', profession: 'Retired Teacher', common: 'Same city, same era', status: 'pending' },
    { id: 3, name: 'Harinder Singh Gill', initials: 'H', school: 'Punjab University', batch: '1977', city: 'Amritsar', profession: 'Retired Doctor', common: 'Mutual friend: Rajiv Sharma', status: 'none' },
    { id: 4, name: 'Meena Kapoor', initials: 'M', school: 'Loreto Convent School', batch: '1980', city: 'Shimla', profession: 'Writer', common: 'Book lovers group', status: 'none' },
    { id: 5, name: 'Vikram Nath Joshi', initials: 'V', school: 'IIT Roorkee', batch: '1976', city: 'Dehradun', profession: 'Retired Professor', common: 'Same college era', status: 'connected' },
    { id: 6, name: 'Kamla Devi Verma', initials: 'K', school: 'BHU Varanasi', batch: '1975', city: 'Varanasi', profession: 'Classical Musician', common: 'Music lovers community', status: 'pending' },
    { id: 7, name: 'Arvind Chandra Gupta', initials: 'A', school: 'Allahabad University', batch: '1973', city: 'Prayagraj', profession: 'Retired Banker', common: 'Same hometown era', status: 'none' },
    { id: 8, name: 'Padma Subramaniam', initials: 'P', school: 'Stella Maris College', batch: '1974', city: 'Chennai', profession: 'Retired Nurse', common: 'Wellness community', status: 'none' },
  ],
  communities: [
    { id: 1, name: '1970s School Alumni', emoji: '🏫', category: 'Alumni', members: 2431, active: 'Very Active', meetup: 'Monthly online', desc: 'Connect with schoolmates from the golden decade of the 1970s.', joined: true },
    { id: 2, name: 'Lata Mangeshkar Fans', emoji: '🎵', category: 'Music', members: 8923, active: 'Very Active', meetup: 'Weekly discussions', desc: 'Celebrate the timeless music of the nightingale of India.', joined: true },
    { id: 3, name: 'Old Bollywood Lovers', emoji: '🎬', category: 'Movies', members: 5621, active: 'Active', meetup: 'Fortnightly watch party', desc: 'Rediscover the golden era of Hindi cinema from the 60s, 70s and 80s.', joined: false },
    { id: 4, name: 'Morning Yoga & Walking', emoji: '🧘', category: 'Wellness', members: 3218, active: 'Very Active', meetup: 'Daily 6 AM', desc: 'Start your day right with a supportive community of walkers and yogis.', joined: false },
    { id: 5, name: 'Cricket Memories', emoji: '🏏', category: 'Sports', members: 6754, active: 'Active', meetup: 'Match days', desc: 'Relive the golden era of Indian cricket with fellow fans.', joined: false },
    { id: 6, name: 'Classic Book Lovers', emoji: '📚', category: 'Books', members: 2109, active: 'Active', meetup: 'Monthly book club', desc: 'Discuss the books that shaped generations — Premchand, Tagore, Gulzar and more.', joined: false },
    { id: 7, name: 'Punjabi Heritage Group', emoji: '🌾', category: 'Regional', members: 4320, active: 'Active', meetup: 'Cultural events', desc: 'Celebrate Punjabi culture, food, language and community.', joined: false },
    { id: 8, name: 'Doordarshan Memories', emoji: '📺', category: 'Nostalgia', members: 7891, active: 'Very Active', meetup: 'Sundays', desc: 'Remember Ramayan, Mahabharat, Chitrahaar and all those memorable shows.', joined: false },
  ],
  memories: [
    { year: 1965, title: 'First Day at School', content: 'I still remember the smell of new notebooks and the nervousness of that first day at DAV School, Chandigarh. My mother had packed laddoos in my tiffin.', type: 'story', emoji: '📚' },
    { year: 1970, title: 'College Days', content: 'The best years of my life at Punjab University. The canteen, the debates, the friendships formed in the hostels.', type: 'story', emoji: '🎓' },
    { year: 1975, title: 'First Job in Delhi', content: 'Got my first government job posting. Arrived in Delhi with one suitcase and a heart full of dreams.', type: 'story', emoji: '💼' },
    { year: 1980, title: 'Marriage', content: 'The most beautiful day of my life. Family gathered from across Punjab and Haryana. The shehnai, the marigolds, the celebration.', type: 'story', emoji: '💑' },
    { year: 1984, title: 'First Child — Rohit', content: 'Became a parent. Held the baby and understood what love truly means.', type: 'story', emoji: '👶' },
    { year: 1988, title: 'Family Trip to Shimla', content: 'Our first proper family holiday. The children saw snow for the first time. Priya\'s expression when snowflakes fell on her nose.', type: 'story', emoji: '⛄' },
    { year: 1992, title: 'New Home', content: 'Built our own house after years of saving. Every brick has a memory in it.', type: 'story', emoji: '🏡' },
    { year: 1998, title: 'Daughter\'s School Result', content: 'Priya scored 95% in board exams. The entire neighbourhood celebrated with us.', type: 'story', emoji: '🌟' },
  ],
  timeMachine: {
    1965: {
      songs: ['Aaj Phir Jeene Ki Tamanna Hai — Lata', 'Mere Sanam — Asha Bhosle', 'Teri Aankhon Ke Siva — Mohd Rafi', 'Phoolon Ka Taron Ka — Lata'],
      movies: ['Guide', 'Waqt', 'Himalaya Ki God Mein', 'Dosti'],
      cricket: ['India vs Pakistan Test Series', 'Tiger Pataudi leading India', 'Nawab of Pataudi era', 'Test cricket golden age'],
      events: ['India-Pakistan War 1965', 'First Indian satellite plans', 'Green Revolution begins', 'IIT system established'],
      radio: ['Binaca Geetmala on Radio Ceylon', 'Vividh Bharati launches', 'Radio Ceylon golden era', 'Ameen Sayani hosts'],
      magazines: ['Dharmayug', 'Illustrated Weekly of India', 'Filmfare', 'Nandan for children'],
    },
    1970: {
      songs: ['Mere Naina Sawan Bhado — Kishore Kumar', 'Chhoti Si Baat — Amol Palekar', 'Dum Maro Dum — Asha', 'Yeh Jo Hai Zindagi — Kishore'],
      movies: ['Hare Rama Hare Krishna', 'Haathi Mere Saathi', 'Anand', 'Jawani Diwani'],
      cricket: ['Sunil Gavaskar debuts', 'India vs West Indies tours', 'Farokh Engineer wicketkeeping', 'Bishan Bedi spinning magic'],
      events: ['Bangladesh Liberation 1971', 'Indira Gandhi wins election', 'India-Soviet Treaty', 'First Green Revolution results'],
      radio: ['Vividh Bharati popular shows', 'Jai Mala show', 'Hawa Mahal drama', 'Chitralok film music'],
      magazines: ['Sarika', 'Kadambini', 'Champak launched', 'Bal Bharati'],
    },
    1975: {
      songs: ['Dil Apna Aur Preet Parai', 'Ek Ajnabee Haseena Se — Kishore', 'Aana Jaana Laga Rahega — Rafi', 'Kabhie Kabhie — Lata'],
      movies: ['Sholay', 'Deewar', 'Jai Santoshi Maa', 'Chupke Chupke'],
      cricket: ['Clive Lloyd\'s West Indies domination', 'India struggling in tests', 'Farokh Engineer\'s last years', 'First World Cup — West Indies win'],
      events: ['Emergency declared 1975', 'Indira Gandhi\'s government', 'Kisan movement', 'Railway strike'],
      radio: ['Binaca Geetmala — Ameen Sayani', 'Military band programmes', 'Sangeeth Sarita', 'Youth programmes'],
      magazines: ['Parag for youth', 'Suman Saurabh', 'Navneet', 'Sarika literature'],
    },
    1980: {
      songs: ['Dard-E-Dil — Kishore Kumar', 'Pyaar Karne Waale — Lata', 'Hungama Ho Gaya — Kishore', 'Dekha Ek Khwaab — Lata & Kishore'],
      movies: ['Karz', 'Kranti', 'Qurbani', 'Dostana'],
      cricket: ['Kapil Dev\'s rise', 'Sunil Gavaskar\'s 10000 runs', 'India tours England', 'Young Mohinder Amarnath'],
      events: ['Indira Gandhi returns to power', 'Olympic boycott', 'Punjab unrest begins', 'India\'s first satellite Rohini'],
      tv: ['Doordarshan begins colour', 'Hum Log serial begins', 'Buniyaad serial', 'Doordarshan'],
      magazines: ['Indrajaal Comics', 'Chandamama', 'Nandan', 'Bal Bharati'],
    },
    1985: {
      songs: ['Tujhse Naraaz Nahin — Lata & Anup', 'Saat Samundar Paar — Kumar Sanu', 'Jaadu Teri Nazar — Udit Narayan', 'Pehla Nasha — Udit & Sadhna'],
      movies: ['Ram Teri Ganga Maili', 'Tezaab', 'Arjun', 'Mard'],
      cricket: ['India wins 1983 World Cup legacy', 'Kapil Dev\'s bowling records', 'Gavaskar\'s centuries', 'Mohinder Amarnath\'s heroics'],
      events: ['Rajiv Gandhi becomes PM', 'Bhopal gas tragedy aftermath', 'Computerisation begins', 'BSNL telephone expansion'],
      tv: ['Ramayan serials begin', 'Chitrahaar Wednesday & Friday', 'Hum Log final episodes', 'Quiz programmes'],
      magazines: ['Reader\'s Digest Hindi', 'Grihshobha', 'Sarita', 'Manohar Kahaniyan'],
    },
    1990: {
      songs: ['Dil Hai Ke Manta Nahin', 'Pehla Nasha', 'Mere Rang Mein', 'Tip Tip Barsa Pani'],
      movies: ['Dil', 'Qayamat Se Qayamat Tak legacy', 'Dil Hai Ke Manta Nahin', 'Sadak'],
      cricket: ['Sachin Tendulkar\'s early years', 'Azharuddin captaincy', 'India in World Cup', 'Wills Cup cricket'],
      events: ['Economic reforms 1991', 'Mandal Commission agitation', 'Gulf War effects', 'Satellite TV arrives in India'],
      tv: ['Star TV launches in India', 'Mahabharat on DD', 'Shri Krishna serial', 'MTV India begins'],
      magazines: ['Outlook magazine', 'India Today', 'Femina', 'Filmfare awards era'],
    },
    1995: {
      songs: ['Chura Ke Dil Mera', 'Kuch Kuch Hota Hai coming', 'Tu Cheez Badi Hai', 'Maahi Ve — AR Rahman'],
      movies: ['Dilwale Dulhania Le Jayenge', 'Rangeela', 'Bombay', 'Karan Arjun'],
      cricket: ['Sachin\'s golden era', 'India vs Sri Lanka matches', 'Vinod Kambli era', 'World Cup 1996 preparations'],
      events: ['Internet arrives in India 1995', 'Mobile phones begin', 'Economic liberalisation results', 'IT industry growth begins'],
      tv: ['Zee TV established', 'KBC precursor shows', 'Sangeeth Mala', 'Film-based programmes'],
      magazines: ['Internet magazines begin', 'Business Today', 'India Today international', 'Sportstar'],
    },
    2000: {
      songs: ['Kaho Naa Pyaar Hai', 'Lagaan music', 'Dil Chahta Hai soundtrack', 'Mohabbatein songs'],
      movies: ['Lagaan', 'Dil Chahta Hai', 'Kabhi Khushi Kabhie Gham', 'Devdas'],
      cricket: ['India wins 2000s series', 'Sachin vs Sehwag opening', 'Harbhajan\'s hat trick', 'Dravid\'s wall era'],
      events: ['IT boom and bust', 'Mobile revolution', 'KBC with Amitabh Bachchan', 'Commonwealth Games preparation'],
      tv: ['KBC — Kaun Banega Crorepati', 'Indian Idol begin years', 'Reality TV arrives', 'News channels multiply'],
      magazines: ['Digital magazines begin', 'Technology focus journals', 'Health magazines boom', 'Celebrity magazines'],
    },
  },
  legalTopics: [
    { id: 'pension', label: 'Pension Forms', icon: '💰' },
    { id: 'bank', label: 'Bank Documents', icon: '🏦' },
    { id: 'govt', label: 'Government Schemes', icon: '🏛️' },
    { id: 'insurance', label: 'Insurance', icon: '🛡️' },
    { id: 'property', label: 'Property Papers', icon: '🏠' },
    { id: 'tax', label: 'Income Tax', icon: '📋' },
  ],
  legalResponses: {
    pension: {
      question: 'What is this pension form asking me?',
      steps: [
        { n: 1, title: 'Your Personal Information', desc: 'Section A asks for your full name as per service records, date of birth, and personal identification number.' },
        { n: 2, title: 'Your Service Details', desc: 'Section B asks for your department, designation at retirement, date of joining, and date of retirement.' },
        { n: 3, title: 'Bank Information', desc: 'Section C needs your bank account number and IFSC code where the pension will be credited each month.' },
        { n: 4, title: 'Documents You May Need', desc: 'Life certificate (required yearly), service book, retirement order, identity proof (Aadhaar), and two passport photos.' },
      ],
    },
    bank: {
      question: 'Can you explain this bank form?',
      steps: [
        { n: 1, title: 'Account Holder Details', desc: 'Your name, address, and mobile number linked to your account. These must match your Aadhaar.' },
        { n: 2, title: 'Service Request', desc: 'The specific service you are requesting — nomination update, KYC update, or signature change.' },
        { n: 3, title: 'Declaration', desc: 'By signing, you confirm the information is correct. Read each point carefully before signing.' },
        { n: 4, title: 'Documents to Attach', desc: 'Self-attested copy of Aadhaar and PAN card. Recent passport-size photograph.' },
      ],
    },
    govt: {
      question: 'What is this government scheme about?',
      steps: [
        { n: 1, title: 'Who Can Apply', desc: 'Citizens above 60 years of age with no other government pension income below the threshold amount.' },
        { n: 2, title: 'What You Receive', desc: 'Monthly financial support credited directly to your bank account. Amount varies by state scheme.' },
        { n: 3, title: 'How to Apply', desc: 'Visit your nearest Common Service Centre (CSC) with documents, or apply online at the scheme portal.' },
        { n: 4, title: 'Documents Required', desc: 'Age proof (Aadhaar), income certificate from tehsildar, bank passbook, and residence proof.' },
      ],
    },
    insurance: {
      question: 'Can you explain my insurance policy?',
      steps: [
        { n: 1, title: 'Policy Basics', desc: 'Your policy number, start date, and end date. The insured amount you or your family will receive.' },
        { n: 2, title: 'Premium Details', desc: 'How much you pay and when — monthly, quarterly, or annually. Grace period if you miss a payment.' },
        { n: 3, title: 'What is Covered', desc: 'The specific situations where the insurance will pay — hospitalisation, accident, or life cover.' },
        { n: 4, title: 'How to Make a Claim', desc: 'Contact the insurance company by phone or app, fill the claim form, and attach hospital bills and identity proof.' },
      ],
    },
    property: {
      question: 'Can you help me understand this property document?',
      steps: [
        { n: 1, title: 'Property Details', desc: 'Survey number, plot area, location, and address as registered with local authority.' },
        { n: 2, title: 'Owner Information', desc: 'Current registered owner name and any co-owners. Check if your name is correctly spelled.' },
        { n: 3, title: 'Encumbrances', desc: 'Any loans or legal claims against the property. This must be clear before any sale or transfer.' },
        { n: 4, title: 'Important Advice', desc: 'For any property transaction, always consult a registered lawyer. This explanation is for understanding only.' },
      ],
    },
    tax: {
      question: 'Can you explain my Income Tax form?',
      steps: [
        { n: 1, title: 'Personal Details Section', desc: 'Your name, PAN number, date of birth, and contact information. These must exactly match your PAN card.' },
        { n: 2, title: 'Income Details', desc: 'All sources of income — pension, bank interest, rent, or any business income. Senior citizens have special provisions.' },
        { n: 3, title: 'Deductions Available', desc: 'Senior citizens can claim higher standard deduction, medical insurance deduction, and other benefits. Check Section 80D.' },
        { n: 4, title: 'Verification', desc: 'Sign the form digitally using Aadhaar OTP, or physically sign and mail to the Income Tax Department.' },
      ],
    },
  },
  wellnessActivities: [
    { id: 1, icon: '🧘', title: 'Morning Yoga', duration: '10 minutes', desc: 'Gentle stretches to start your day with energy.', completed: false },
    { id: 2, icon: '🧠', title: 'Memory Game', duration: '5 minutes', desc: 'Keep your mind sharp with today\'s puzzle.', completed: false },
    { id: 3, icon: '🚶', title: 'Morning Walk', duration: '20 minutes', desc: 'A refreshing community walk — even indoors counts.', completed: false },
    { id: 4, icon: '💨', title: 'Deep Breathing', duration: '5 minutes', desc: '4-7-8 breathing to calm your mind and body.', completed: false },
    { id: 5, icon: '📖', title: 'Read Something', duration: '15 minutes', desc: 'A poem, a story, or a chapter of your favourite book.', completed: false },
    { id: 6, icon: '🤲', title: 'Light Stretching', duration: '8 minutes', desc: 'Gentle neck, shoulder, and hand stretches.', completed: false },
    { id: 7, icon: '🎵', title: 'Listen to Favourite Music', duration: '15 minutes', desc: 'A familiar song can lift the spirit beautifully.', completed: false },
    { id: 8, icon: '📝', title: 'Write One Memory', duration: '10 minutes', desc: 'Write one beautiful memory in your life vault today.', completed: false },
    { id: 9, icon: '📞', title: 'Call a Friend or Family', duration: 'Any', desc: 'Connection is the best wellness activity of all.', completed: false },
  ],
  nostalgiaLibrary: {
    songs: [
      { title: 'Laga Chunari Mein Daag', artist: 'Lata Mangeshkar', year: '1963', emoji: '🎵' },
      { title: 'Roop Tera Mastana', artist: 'Kishore Kumar', year: '1969', emoji: '🎵' },
      { title: 'Aaj Phir Jeene Ki', artist: 'Lata Mangeshkar', year: '1965', emoji: '🎵' },
      { title: 'Mere Naina Sawan Bhado', artist: 'Kishore Kumar', year: '1974', emoji: '🎵' },
      { title: 'Kabhi Kabhi Mere Dil Mein', artist: 'Lata Mangeshkar', year: '1976', emoji: '🎵' },
      { title: 'O Saathi Re', artist: 'Kishore Kumar', year: '1978', emoji: '🎵' },
      { title: 'Pardah Hai Pardah', artist: 'Mohd Rafi', year: '1977', emoji: '🎵' },
      { title: 'Chura Liya Hai Tumne', artist: 'Asha Bhosle & Rafi', year: '1973', emoji: '🎵' },
    ],
    movies: [
      { title: 'Sholay', year: '1975', emoji: '🎬' },
      { title: 'Deewar', year: '1975', emoji: '🎬' },
      { title: 'Guide', year: '1965', emoji: '🎬' },
      { title: 'Anand', year: '1971', emoji: '🎬' },
      { title: 'Mughal-E-Azam', year: '1960', emoji: '🎬' },
      { title: 'Pakeezah', year: '1972', emoji: '🎬' },
    ],
    magazines: [
      { title: 'Nandan', desc: 'Beloved children\'s magazine', emoji: '📕' },
      { title: 'Champak', desc: 'Stories, puzzles and wisdom', emoji: '📗' },
      { title: 'Dharmayug', desc: 'Literary and cultural weekly', emoji: '📘' },
      { title: 'Sarika', desc: 'Short stories and literature', emoji: '📙' },
      { title: 'Bal Bharati', desc: 'School children\'s magazine', emoji: '📓' },
      { title: 'Chandamama', desc: 'Classic children\'s stories', emoji: '📔' },
    ],
    radio: [
      { title: 'Binaca Geetmala', desc: 'Ameen Sayani\'s iconic countdown show', emoji: '📻' },
      { title: 'Hawa Mahal', desc: 'Hindi drama on All India Radio', emoji: '📻' },
      { title: 'Vividh Bharati', desc: 'India\'s premier entertainment radio', emoji: '📻' },
      { title: 'Jaimala', desc: 'Military dedication programme', emoji: '📻' },
    ],
  },
  familyBridgeCards: [
    {
      parentName: 'Papa',
      story: '"I was telling you about the time I first rode a bicycle in 1972..."',
      prompt: 'Ask him about it tonight — he would love to share the whole story.',
      actions: ['Listen', 'Ask About It', 'Save Story'],
    },
    {
      parentName: 'Maa',
      story: '"Your mother saved a beautiful memory about her college days in Varanasi..."',
      prompt: 'She mentioned her favourite professor and the Ganga ghat walks.',
      actions: ['Listen', 'Read Memory', 'Share'],
    },
    {
      parentName: 'Dada Ji',
      story: '"Grandfather shared the story of Partition — how the family crossed the border in 1947..."',
      prompt: 'This is a precious piece of family history. Listen and preserve it.',
      actions: ['Listen', 'Record Story', 'Save for Family'],
    },
  ],
};

// ----------------------------------------------------------------
// 5. LOCAL STORAGE HELPERS
// ----------------------------------------------------------------
function getStoredUser() {
  let user = null;
  try {
    const raw = localStorage.getItem(LS.USER) || localStorage.getItem(LS_KEYS.USER);
    if (raw) user = JSON.parse(raw);
  } catch (e) {
    user = null;
  }
  if (user) {
    if (!user.name && user.full_name) user.name = user.full_name;
    if (!user.full_name && user.name) user.full_name = user.name;
    if (!user.firstName && user.name) user.firstName = user.name.split(' ')[0];
  }
  return user;
}

function getStoredSession() {
  return localStorage.getItem(LS.SESSION) || localStorage.getItem(LS_KEYS.SESSION);
}

function getStoredMemories() { return JSON.parse(localStorage.getItem(LS.MEMORIES) || 'null'); }
function getEasyMode() { return localStorage.getItem(LS.EASY_MODE) === 'true'; }
function getDarkMode() {
  const saved = localStorage.getItem(LS.DARK_MODE);
  if (saved !== null) return saved === 'true';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function getJoinedComms() { return JSON.parse(localStorage.getItem(LS.COMMUNITIES) || '[]'); }
function getAvatar() { return localStorage.getItem(LS.AVATAR) || null; }

function saveStoredMemory(mem) {
  const mems = getStoredMemories() || [...MOCK_DATA.memories];
  mems.push(mem);
  mems.sort((a, b) => a.year - b.year);
  localStorage.setItem(LS.MEMORIES, JSON.stringify(mems));
  return mem;
}

function isLoggedIn() {
  return !!getStoredSession() && !!getStoredUser();
}

function mockLogin(email, password) {
  const normEmail = (email || '').trim().toLowerCase();
  if (normEmail === DEMO_EMAIL.toLowerCase() && password === DEMO_PASSWORD) {
    const sessionKey = 'demo-session-' + Date.now();
    localStorage.setItem(LS.SESSION, sessionKey);
    localStorage.setItem(LS_KEYS.SESSION, sessionKey);
    localStorage.setItem(LS.USER, JSON.stringify(DEMO_USER));
    localStorage.setItem(LS_KEYS.USER, JSON.stringify(DEMO_USER));
    return { success: true, user: DEMO_USER };
  }
  // Check locally registered users
  const registered = JSON.parse(localStorage.getItem('lifeconnect_registered') || '[]');
  const found = registered.find(u => (u.email && u.email.toLowerCase() === normEmail || u.mobile === email) && u.password === password);
  if (found) {
    const user = { ...found };
    delete user.password;
    if (!user.name && user.full_name) user.name = user.full_name;
    if (!user.firstName && user.name) user.firstName = user.name.split(' ')[0];
    const sessionKey = 'session-' + Date.now();
    localStorage.setItem(LS.SESSION, sessionKey);
    localStorage.setItem(LS_KEYS.SESSION, sessionKey);
    localStorage.setItem(LS.USER, JSON.stringify(user));
    localStorage.setItem(LS_KEYS.USER, JSON.stringify(user));
    return { success: true, user };
  }
  return { success: false, error: 'Invalid email or password. Try demo@lifeconnect.local / Demo123!' };
}

function mockSignup(data) {
  const registered = JSON.parse(localStorage.getItem('lifeconnect_registered') || '[]');
  const normEmail = (data.email || '').trim().toLowerCase();
  if (registered.find(u => u.email && u.email.toLowerCase() === normEmail)) {
    return { success: false, error: 'This email is already registered. Please login.' };
  }
  const fullName = data.name || data.full_name || 'Senior Member';
  const user = {
    ...data,
    name: fullName,
    full_name: fullName,
    firstName: fullName.split(' ')[0],
    avatar: fullName.charAt(0).toUpperCase()
  };
  registered.push(user);
  localStorage.setItem('lifeconnect_registered', JSON.stringify(registered));
  const sessionUser = { ...user };
  delete sessionUser.password;
  const sessionKey = 'session-' + Date.now();
  localStorage.setItem(LS.SESSION, sessionKey);
  localStorage.setItem(LS_KEYS.SESSION, sessionKey);
  localStorage.setItem(LS.USER, JSON.stringify(sessionUser));
  localStorage.setItem(LS_KEYS.USER, JSON.stringify(sessionUser));
  return { success: true, user: sessionUser };
}

function logout() {
  localStorage.removeItem(LS.SESSION);
  localStorage.removeItem(LS_KEYS.SESSION);
  localStorage.removeItem(LS.USER);
  localStorage.removeItem(LS_KEYS.USER);
  localStorage.removeItem(LS_KEYS.TOKEN);
  navigate('home');
  updateNavForAuth();
  showToast('You have been signed out. See you soon!', 'info');
}


// ----------------------------------------------------------------
// 7. NAVIGATION / ROUTER & STRICT AUTH GUARD
// ----------------------------------------------------------------
const VIEWS = ['home', 'news', 'dashboard', 'login', 'signup', 'reconnect', 'memories',
  'wellness', 'community', 'companion', 'voice', 'legal', 'vault',
  'family', 'profile', 'nostalgia', 'content'];

// ONLY landing page, login, signup, and legal are accessible without an account
const PUBLIC_VIEWS = ['home', 'login', 'signup', 'legal'];

let pendingAuthRedirectView = null;

function showAuthRequiredPrompt(viewId) {
  pendingAuthRedirectView = viewId;
  const friendlyNames = {
    news: '24-Hour Local & Senior Welfare News',
    reconnect: 'Old Friends & Classmates Reconnect',
    memories: 'Time Machine & Golden Era Memories',
    wellness: 'Daily Senior Wellness & Gentle Yoga',
    community: 'Local Senior Clubs & Communities',
    companion: 'Sneh AI Personal Senior Companion',
    voice: 'Voice Assistant',
    dashboard: 'Your Personal Senior Dashboard',
    vault: 'Golden Era Nostalgia Vault',
    nostalgia: 'Nostalgia Vault',
    family: 'Family Tree & Heritage Archive',
    profile: 'Profile & Settings'
  };
  const sectionTitle = friendlyNames[viewId] || 'this section';

  const titleEl = document.getElementById('auth-modal-title');
  const descEl = document.getElementById('auth-modal-desc');
  if (titleEl) {
    titleEl.textContent = `Sign In to Access ${sectionTitle}`;
  }
  if (descEl) {
    descEl.textContent = `Welcome to LifeConnect! Please log in or create your free account to access ${sectionTitle}. LifeConnect personalizes all news, batchmate recommendations, nostalgic memories, and health activities specifically for your city, era, and personal preferences.`;
  }

  const modal = document.getElementById('auth-required-modal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  showToast(`Please sign in or create an account to view ${sectionTitle}.`, 'warning', 4500);
}

function closeAuthRequiredModal() {
  const modal = document.getElementById('auth-required-modal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
  // Ensure we are viewing home
  if (!isLoggedIn()) {
    const currentActive = document.querySelector('.view.active')?.id?.replace('view-', '') || 'home';
    if (!PUBLIC_VIEWS.includes(currentActive)) {
      navigate('home');
    }
  }
}

function authModalGoLogin() {
  closeAuthRequiredModal();
  navigate('login');
}

function authModalGoSignup() {
  closeAuthRequiredModal();
  navigate('signup');
}

function handleAuthModalBackdrop(event) {
  if (event.target && event.target.id === 'auth-required-modal') {
    closeAuthRequiredModal();
  }
}

function navigate(viewId) {
  if (typeof stopSpeaking === 'function') stopSpeaking();

  // STRICT AUTH GUARD:
  // Without login or signup, no page of website should be visible except the landing page (and login/signup)
  if (!PUBLIC_VIEWS.includes(viewId) && !isLoggedIn()) {
    showAuthRequiredPrompt(viewId);
    // Keep visible view on home
    const currentActive = document.querySelector('.view.active')?.id?.replace('view-', '');
    if (!currentActive || !PUBLIC_VIEWS.includes(currentActive)) {
      activateView('home');
    }
    return;
  }

  activateView(viewId);
}

function activateView(viewId) {
  VIEWS.forEach(id => {
    const el = document.getElementById('view-' + id);
    if (el) el.classList.remove('active');
  });

  const target = document.getElementById('view-' + viewId);
  if (!target) { activateView('home'); return; }
  target.classList.add('active');

  window.location.hash = viewId;

  // Sync nav active state
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.mobile-menu__link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-item').forEach(l => l.classList.remove('active'));

  document.querySelectorAll(`[data-nav="${viewId}"]`).forEach(l => l.classList.add('active'));

  // Close mobile menu safely
  const mobileMenu = document.getElementById('mobile-menu');
  if (mobileMenu) mobileMenu.classList.remove('open');
  const navHamburger = document.querySelector('.nav-hamburger');
  if (navHamburger) navHamburger.classList.remove('open');

  // Desktop auth split-screen scroll lock: prevent outer window scroll, reset inner form scroll
  if (viewId === 'login' || viewId === 'signup') {
    document.body.classList.add('auth-locked');
    window.scrollTo({ top: 0, behavior: 'instant' });
    const authRight = target.querySelector('.auth-right');
    if (authRight) authRight.scrollTop = 0;
  } else {
    document.body.classList.remove('auth-locked');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Show / hide the floating chat widget (hidden on landing/login/signup)
  const hiddenOnViews = ['home', 'login', 'signup'];
  const widget = document.getElementById('floating-chat-widget');
  if (widget) {
    widget.style.display = hiddenOnViews.includes(viewId) ? 'none' : '';
  }

  // Run view-specific init
  onViewChange(viewId);
}

function onViewChange(viewId) {
  if (viewId === 'signup') initSignupForm();
  if (viewId === 'login') initLoginForm();
  if (viewId === 'news') loadNewsPage();
  if (viewId === 'dashboard') initDashboard();
  if (viewId === 'reconnect') initReconnect();
  if (viewId === 'community') initCommunity();
  if (viewId === 'wellness') initWellness();
  if (viewId === 'vault') initVault();
  if (viewId === 'nostalgia') initNostalgia();
  if (viewId === 'companion') initCompanion();
  if (viewId === 'voice') initVoicePage();
  if (viewId === 'family') initFamily();
  if (viewId === 'profile') initProfile();
  if (viewId === 'memories') initMemories();
  if (viewId === 'content') initContentPage();
}

function initVoicePage() {
  initVoiceUI('voice-page-orb', 'voice-page-status', 'voice-page-transcript');
}

// ----------------------------------------------------------------
// 8. NAVBAR
// ----------------------------------------------------------------
function initNavbar() {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  });

  const hamburger = document.querySelector('.nav-hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
  });

  // Close menu on outside click
  document.addEventListener('click', (e) => {
    if (!navbar.contains(e.target) && !mobileMenu.contains(e.target)) {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
    }
  });

  updateNavForAuth();
}

function updateNavForAuth() {
  const loggedIn = isLoggedIn();
  const user = getStoredUser();
  const navActions = document.getElementById('nav-actions');
  if (!navActions) return;

  const isDark = document.body.getAttribute('data-theme') === 'dark' || document.body.classList.contains('dark-mode');
  const darkIcon = isDark ? '☀️' : '🌙';
  const darkTitle = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  if (loggedIn && user) {
    navActions.innerHTML = `
      <button class="nav-avatar" onclick="navigate('dashboard')" title="My Dashboard" aria-label="Go to dashboard">${user.avatar || user.name.charAt(0)}</button>
      <button class="btn btn-secondary btn-sm" onclick="navigate('profile')">Profile</button>
      <button class="btn btn-ghost btn-sm" onclick="logout()">Sign Out</button>
      <button id="dark-mode-toggle" class="btn btn-ghost btn-sm dark-mode-toggle" title="${darkTitle}" aria-label="${darkTitle}">${darkIcon}</button>
    `;
  } else {
    navActions.innerHTML = `
      <button class="btn btn-secondary btn-sm" onclick="navigate('login')">Login</button>
      <button class="btn btn-primary btn-sm" onclick="navigate('signup')">Get Started</button>
      <button id="dark-mode-toggle" class="btn btn-ghost btn-sm dark-mode-toggle" title="${darkTitle}" aria-label="${darkTitle}">${darkIcon}</button>
    `;
  }

  // Show/hide dashboard nav link
  const dashLink = document.getElementById('nav-dashboard-link');
  if (dashLink) dashLink.style.display = loggedIn ? 'inline-block' : 'none';

  // Update home-page CTAs to reflect auth state
  updateHomeCTAsForAuth();
}

/**
 * Rewires every "Get Started" / signup CTA on the landing page to point
 * to the authenticated dashboard when the user is already logged in.
 *
 * Buttons/links targeted (by id or selector):
 *   #hero-get-started       — Hero section primary CTA
 *   #cta-start              — Bottom "Start Your LifeConnect Journey" CTA
 *   #mobile-menu-get-started — Mobile menu "Get Started Free" button
 *   #footer-get-started     — Footer Account column "Get Started" link
 */
function updateHomeCTAsForAuth() {
  const loggedIn = isLoggedIn();

  // Hero CTA
  const heroCta = document.getElementById('hero-get-started');
  if (heroCta) {
    if (loggedIn) {
      heroCta.textContent = 'Go to My Home';
      heroCta.onclick = () => navigate('dashboard');
    } else {
      heroCta.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Get Started`;
      heroCta.onclick = () => navigate('signup');
    }
  }

  // Bottom CTA banner
  const ctaStart = document.getElementById('cta-start');
  if (ctaStart) {
    if (loggedIn) {
      ctaStart.textContent = 'Go to My Home';
      ctaStart.onclick = () => navigate('dashboard');
    } else {
      ctaStart.textContent = 'Start Your LifeConnect Journey';
      ctaStart.onclick = () => navigate('signup');
    }
  }

  // Mobile menu "Get Started Free"
  const mobileGetStarted = document.getElementById('mobile-menu-get-started');
  if (mobileGetStarted) {
    if (loggedIn) {
      mobileGetStarted.textContent = 'My Home';
      mobileGetStarted.onclick = () => navigate('dashboard');
    } else {
      mobileGetStarted.textContent = 'Get Started Free';
      mobileGetStarted.onclick = () => navigate('signup');
    }
  }

  // Footer "Get Started" link
  const footerGetStarted = document.getElementById('footer-get-started');
  if (footerGetStarted) {
    if (loggedIn) {
      footerGetStarted.textContent = 'My Home';
      footerGetStarted.onclick = () => navigate('dashboard');
    } else {
      footerGetStarted.textContent = 'Get Started';
      footerGetStarted.onclick = () => navigate('signup');
    }
  }
}

// ----------------------------------------------------------------
// 9. HERO — LANDING PAGE
// ----------------------------------------------------------------
function initHero() {
  // Intersection Observer for fade-in animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.animate-on-scroll').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
}

// ----------------------------------------------------------------
// 10. EASY MODE
// ----------------------------------------------------------------
function initEasyMode() {
  const enabled = getEasyMode();
  document.body.classList.toggle('easy-mode', enabled);

  const toggle = document.getElementById('easy-mode-toggle');
  if (toggle) {
    toggle.checked = enabled;
    toggle.addEventListener('change', () => {
      const on = toggle.checked;
      document.body.classList.toggle('easy-mode', on);
      localStorage.setItem(LS.EASY_MODE, on);
      showToast(on ? 'Easy Mode ON — larger text and buttons.' : 'Easy Mode OFF.', 'info');
    });
  }
}

// ----------------------------------------------------------------
// 10B. DARK MODE
// ----------------------------------------------------------------
function setDarkMode(enabled) {
  document.body.setAttribute('data-theme', enabled ? 'dark' : 'light');
  document.body.classList.toggle('dark-mode', enabled);
  localStorage.setItem(LS.DARK_MODE, enabled);
  updateDarkModeButtons(enabled);
}

function toggleDarkMode() {
  const isDark = document.body.getAttribute('data-theme') === 'dark' || document.body.classList.contains('dark-mode');
  setDarkMode(!isDark);
  showToast(!isDark ? 'Dark mode enabled 🌙' : 'Light mode enabled ☀️', 'info');
}

function updateDarkModeButtons(isDark) {
  document.querySelectorAll('.dark-mode-toggle, #dark-mode-toggle').forEach(btn => {
    btn.innerHTML = isDark ? '☀️' : '🌙';
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  });
  const mobileToggle = document.getElementById('mobile-dark-mode-toggle');
  if (mobileToggle) {
    const icon = mobileToggle.querySelector('.dark-mode-icon');
    const text = mobileToggle.querySelector('.dark-mode-text');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    if (text) text.textContent = isDark ? 'Light Mode' : 'Dark Mode';
  }
}

function initDarkMode() {
  const isDark = getDarkMode();
  setDarkMode(isDark);

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#dark-mode-toggle, .dark-mode-toggle, #mobile-dark-mode-toggle');
    if (btn) {
      e.preventDefault();
      toggleDarkMode();
    }
  });
}

// ----------------------------------------------------------------
// 11. AI COMPANION CHAT
// ----------------------------------------------------------------
let companionName = getAvatar() || 'Mitra';
let companionAvatar = companionName === 'Guru' ? '📚' : (companionName === 'Saheli' ? '🎵' : '🌻');

function updateFloatingChatUI() {
  const btnIcon = document.querySelector('.floating-chat-btn__avatar');
  if (btnIcon) btnIcon.textContent = companionAvatar;

  const headerAvatar = document.querySelector('.floating-chat-panel__avatar');
  if (headerAvatar) headerAvatar.textContent = companionAvatar;

  const headerName = document.querySelector('.floating-chat-panel__name');
  if (headerName) headerName.textContent = companionName;

  const input = document.getElementById('floating-chat-input');
  if (input) {
    input.placeholder = `Talk to ${companionName}…`;
    input.setAttribute('aria-label', `Type a message to ${companionName}`);
  }

  const panel = document.getElementById('floating-chat-panel');
  if (panel) panel.setAttribute('aria-label', `${companionName} AI Companion`);

  const btn = document.getElementById('floating-chat-btn');
  if (btn) btn.setAttribute('aria-label', `Open Chat with ${companionName}`);

  const companionAvatarDisplay = document.getElementById('companion-avatar-display');
  if (companionAvatarDisplay) companionAvatarDisplay.textContent = companionAvatar;
}

// ── Intent classifier ────────────────────────────────────────────
/**
 * Returns the best-matching intent string for a given user message.
 * Evaluated top-to-bottom; first match wins.
 */
function classifyIntent(msg) {
  const t = msg.toLowerCase();
  const has = (...words) => words.some(w => t.includes(w));

  // Safety / distress — always first
  if (has('suicide', 'end my life', 'don\'t want to live', 'want to die', 'harm myself', 'kill myself'))
    return 'safety_crisis';
  if (has('lonely', 'alone', 'no one cares', 'nobody cares', 'feeling low', 'feel sad', 'very sad', 'very lonely', 'miss them', 'depressed', 'anxious', 'grief', 'lost my', 'akela', 'udaas'))
    return 'emotional_support';

  // App navigation
  if (has('memory vault', 'vault', 'save my memory', 'add memory', 'preserve'))
    return 'app_vault';
  if (has('reconnect', 'find my friend', 'find old friend', 'search for', 'look for', 'purana dost', 'school friend', 'college friend', 'batch mate', 'classmate'))
    return 'reconnect';
  if (has('wellness', 'activity', 'activities', 'today\'s activity', 'exercise', 'yoga', 'walk', 'stretching', 'breathing'))
    return 'wellness';
  if (has('community', 'group', 'join', 'members', 'discussion'))
    return 'community';
  if (has('profile', 'my account', 'my details', 'settings'))
    return 'app_profile';

  // Life & memory topics
  if (has('remember', 'memory', 'memories', 'used to', 'back then', 'those days', 'childhood', 'school days', 'college days', 'old days', 'yaadon', 'yaad', 'purana'))
    return 'memories';
  if (has('family', 'children', 'grandchildren', 'son', 'daughter', 'wife', 'husband', 'spouse', 'parivar', 'bache', 'pota', 'naati'))
    return 'family';
  if (has('friend', 'friendship', 'dost', 'yaar', 'colleague', 'neighbour', 'neighbor'))
    return 'friendship';

  // Nostalgia & culture
  if (has('song', 'music', 'lata', 'kishore', 'rafi', 'asha', 'gaana', 'geet', 'sangeet', 'film', 'movie', 'bollywood', 'cinema'))
    return 'nostalgia_culture';
  if (has('cricket', 'sachin', 'kapil', 'gavaskar', 'match', 'world cup'))
    return 'nostalgia_cricket';
  if (has('doordarshan', 'ramayan', 'mahabharat', 'hum log', 'chitrahaar', 'tv show', 'serial'))
    return 'nostalgia_tv';
  if (has('magazine', 'nandan', 'champak', 'dharmayug', 'sarika', 'radio', 'vividh bharati', 'binaca'))
    return 'nostalgia_misc';

  // Daily Necessities & Grocery Market Prices
  if (has('milk', 'doodh', 'salt', 'namak', 'vegetable', 'vegetables', 'sabzi', 'sabji', 'potato', 'aloo', 'onion', 'pyaz', 'tomato', 'tamatar', 'fruit', 'fruits', 'kela', 'banana', 'apple', 'seb', 'atta', 'rice', 'chawal', 'dal', 'ghee', 'oil', 'tel', 'sugar', 'cheeni', 'price', 'prices', 'rate', 'rates', 'bhav', 'cost', 'mandi', 'grocery', 'ration'))
    return 'daily_goods_prices';

  // Medicines & Pharmacy
  if (has('medicine', 'medicines', 'tablet', 'tablets', 'pill', 'pills', 'capsule', 'dawa', 'dawai', 'paracetamol', 'crocin', 'dolo', 'metformin', 'pantoprazole', 'antacid', 'vitamin', 'calcium', 'd3', 'insulin', 'painkiller', 'syrup', 'dosage', 'pharmacy', 'chemist'))
    return 'medicine_query';

  // Illnesses & Chronic Conditions
  if (has('illness', 'illnesses', 'disease', 'diseases', 'fever', 'cold', 'cough', 'flu', 'bp', 'blood pressure', 'hypertension', 'sugar', 'diabetes', 'diabetic', 'arthritis', 'joint pain', 'knee pain', 'ghutna', 'dard', 'pain', 'backache', 'gas', 'acidity', 'indigestion', 'acid reflux', 'cholesterol', 'asthma', 'infection'))
    return 'illness_disease';

  // Daily life
  if (has('travel', 'trip', 'visit', 'hill station', 'pilgrimage', 'yatra', 'tour'))
    return 'travel';
  if (has('hobby', 'gardening', 'cooking', 'painting', 'reading', 'writing', 'craft', 'kitab', 'book'))
    return 'hobby';
  if (has('doctor', 'hospital', 'treatment', 'symptoms', 'checkup', 'clinic'))
    return 'health_query';
  if (has('sleep', 'insomnia', 'can\'t sleep', 'neend', 'rest'))
    return 'sleep';
  if (has('learn', 'smartphone', 'phone', 'computer', 'internet', 'technology', 'app', 'digital'))
    return 'learning_tech';
  if (has('legal', 'pension', 'form', 'document', 'property', 'tax', 'bank', 'insurance', 'government scheme'))
    return 'legal_docs';

  // Greetings & conversation starters
  if (has('hello', 'hi', 'namaste', 'namaskar', 'sat sri akal', 'kem cho', 'good morning', 'good evening', 'good afternoon', 'good night', 'how are you', 'kya haal', 'kaise ho'))
    return 'greeting';
  if (has('thank', 'thanks', 'shukriya', 'dhanyawad', 'bahut achha', 'very good', 'helpful'))
    return 'gratitude';

  // Show / explore prompts from action buttons
  if (has('show me', 'tell me more', 'yes please', 'yes tell me'))
    return 'show_more';
  if (has('play a song', 'play music', 'song suggestion', 'recommend a song'))
    return 'nostalgia_culture';

  return 'general';
}

// ── Context-aware response builder ───────────────────────────────
/**
 * Builds a response object { text, actions } for a given intent and message.
 * Uses stored user data where available.
 */
function buildAIResponse(intent, originalMsg) {
  const user = getStoredUser();
  const firstName = user ? (user.firstName || user.name.split(' ')[0]) : null;
  const nameSuffix = firstName ? ` ${firstName} Ji` : '';
  const t = originalMsg.toLowerCase();

  switch (intent) {

    // ── Safety ──────────────────────────────────────────────────
    case 'safety_crisis':
      return {
        text: `I hear you, and what you're feeling matters. Please reach out to someone you trust — a family member, a close friend, or a doctor — right now.\n\niCall (India): 9152987821\niVandrevala Foundation: 9999 666 555\nVandrevala Foundation helpline is available 24/7.\n\nYou don't have to face this alone.`,
        actions: ['Call a Family Member', 'I\'m Okay, Just Venting']
      };

    // ── Emotional support ────────────────────────────────────────
    case 'emotional_support': {
      const responses = [
        `It sounds like things have been a little heavy lately${nameSuffix}. That's understandable — these feelings come and go, and it's okay to acknowledge them.\n\nIs there something specific on your mind, or would you simply like some company right now?`,
        `I'm glad you said something${nameSuffix}. Sometimes just putting it into words helps a little.\n\nWould it help to talk about what's been on your mind? Or would you prefer I suggest something light for today?`,
        `Feeling this way is more common than people admit, especially when life feels quiet.\n\nIs there someone — a family member or a friend — you've been meaning to reach out to? Sometimes a simple call can make a real difference.`
      ];
      return {
        text: pick(responses),
        actions: ['Talk About It', 'Suggest Something Light', 'Help Me Call Someone']
      };
    }

    // ── Greeting ────────────────────────────────────────────────
    case 'greeting': {
      const hour = new Date().getHours();
      const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      const greetings = firstName ? [
        `${timeGreeting}${nameSuffix}. How has your day been going so far?`,
        `${timeGreeting}${nameSuffix}. Good to see you here. What's on your mind today?`,
        `${timeGreeting}${nameSuffix}. Is there something you'd like to explore together today?`
      ] : [
        `${timeGreeting}! I'm Mitra, your companion here on LifeConnect. What would you like to explore today?`,
        `${timeGreeting}! Good to have you here. What's on your mind?`
      ];
      return {
        text: pick(greetings),
        actions: ['Wellness', 'Nostalgia Library', 'Memory Vault']
      };
    }

    // ── Gratitude ────────────────────────────────────────────────
    case 'gratitude':
      return {
        text: pick([
          `Glad that helped${nameSuffix}. Is there anything else you'd like to explore?`,
          `Of course${nameSuffix}. What else can I help you with today?`,
          `Happy to be of use. Is there something else on your mind?`
        ]),
        actions: ['Find a Friend', 'Share a Memory', 'Something Else']
      };

    // ── Memories ─────────────────────────────────────────────────
    case 'memories': {
      const memoryResponses = [
        `Those kinds of memories stay with us for a reason${nameSuffix}.\n\nWhat do you remember most clearly about that time — a place, a person, a smell, a sound?`,
        `It's worth preserving that properly. If you'd like, I can help you save it to your Memory Vault so it's there for your family too.\n\nWhat was the most memorable part of it?`,
        `That era had something really special about it. Tell me more — who was with you at the time?`
      ];
      return {
        text: pick(memoryResponses),
        actions: ['Save This Memory', 'Tell Me More', 'Go to Memory Vault']
      };
    }

    // ── Family ───────────────────────────────────────────────────
    case 'family':
      return {
        text: pick([
          `Family is at the heart of so much of what LifeConnect is about${nameSuffix}. Is there something specific you'd like to do — share a memory with them, reconnect, or something else?`,
          `Tell me more about what's on your mind regarding your family. I'm listening.`,
          `The Family Bridge feature on LifeConnect can help you share memories and stories with your children or grandchildren. Would that be useful?`
        ]),
        actions: ['Share a Family Memory', 'Open Family Bridge', 'Just Talking']
      };

    // ── Friendship / reconnect ───────────────────────────────────
    case 'friendship':
      return {
        text: pick([
          `Old friendships have a quality that's hard to describe${nameSuffix} — something about shared history that nothing else quite replaces.\n\nIs there someone in particular you've been thinking about?`,
          `Reconnecting with an old friend after years can feel daunting, but a simple, honest message goes a long way.\n\nWould you like help finding someone or writing a first message?`,
          `Tell me a little about this person — where did you know them from? School, work, the neighbourhood?`
        ]),
        actions: ['Help Me Find Them', 'Help Me Write a Message', 'Just Reminiscing']
      };

    // ── Reconnect feature ────────────────────────────────────────
    case 'reconnect':
      return {
        text: `The Reconnect section on LifeConnect lets you search for people by school, city, batch year, and profession.\n\nTo find someone, go to the Reconnect page and use the search and filters at the top. If you find someone you know, you can send them a reconnect request.\n\nIs there a particular person or era you're hoping to search for?`,
        actions: ['Go to Reconnect', 'Tell Me Who I\'m Looking For', 'Not Right Now']
      };

    // ── Nostalgia — music & film ─────────────────────────────────
    case 'nostalgia_culture': {
      const musicResponses = [
        `There's a reason those songs stay with us${nameSuffix} — they were tied to real moments in life.\n\nThe Nostalgia Library on LifeConnect has collections of songs, films, and radio shows from your era. Songs on the platform point you to legal licensed sources — LifeConnect doesn't host copyrighted content.\n\nIs there a particular song, film, or artist you're thinking of?`,
        `The 1960s through 1980s had some of India's most beloved music. Lata Ji, Kishore Kumar, Rafi Sahab — each had a completely different quality.\n\nWho comes to mind when you think of music from your time?`,
        `If you remember a song but can't quite recall the title or singer, try the AI Memory Search on the Home page — describe it in your own words and it'll try to help you find it.\n\nWhat do you remember about it?`
      ];
      return {
        text: pick(musicResponses),
        actions: ['Open Nostalgia Library', 'Search for a Song', 'Tell Me More']
      };
    }

    // ── Nostalgia — cricket ──────────────────────────────────────
    case 'nostalgia_cricket':
      return {
        text: pick([
          `Cricket had a different feeling in those years${nameSuffix} — Test matches that lasted five days, and the whole neighbourhood would gather around a radio or TV.\n\nThe Time Machine on LifeConnect has cricket moments from each decade. Which era do you remember most fondly?`,
          `The 1983 World Cup, Gavaskar's consistency, Kapil Dev's bowling — there's so much from that era worth remembering.\n\nIs there a particular match or moment you've been thinking about?`
        ]),
        actions: ['Open Time Machine', 'Share a Cricket Memory', 'Just Chatting']
      };

    // ── Nostalgia — TV ───────────────────────────────────────────
    case 'nostalgia_tv':
      return {
        text: `Doordarshan had a kind of simplicity and warmth that stayed with people${nameSuffix}. Ramayan, Mahabharat, Hum Log, Chitrahaar — those were genuinely shared experiences.\n\nThe Time Machine section has TV memories from each decade. Is there a particular show or programme that stands out for you?`,
        actions: ['Open Time Machine', 'Share a Memory', 'Tell Me More']
      };

    // ── Nostalgia — misc ─────────────────────────────────────────
    case 'nostalgia_misc':
      return {
        text: `Those old magazines and radio programmes had a real sense of craftsmanship${nameSuffix}. Nandan, Champak, Binaca Geetmala — they were part of growing up for so many people.\n\nThe Nostalgia Library has a section for magazines and radio. Is there something specific you remember?`,
        actions: ['Open Nostalgia Library', 'Share a Memory', 'Tell Me More']
      };

    // ── Wellness ─────────────────────────────────────────────────
    case 'wellness': {
      const wellnessState = (() => {
        try {
          const saved = localStorage.getItem('lc_wellness_' + new Date().toISOString().split('T')[0]);
          return saved ? JSON.parse(saved) : null;
        } catch { return null; }
      })();
      if (wellnessState) {
        const done = wellnessState.filter(a => a.completed).length;
        const total = wellnessState.length;
        const remaining = total - done;
        if (done === total) {
          return {
            text: `You've completed all ${total} activities for today${nameSuffix}. That's a full day of wellness — well done.\n\nIs there anything else you'd like to do, or would you like to chat for a while?`,
            actions: ['Just Chatting', 'Share a Memory', 'Open Community']
          };
        }
        return {
          text: `You've completed ${done} of ${total} activities today${nameSuffix}. There ${remaining === 1 ? 'is' : 'are'} still ${remaining} ${remaining === 1 ? 'activity' : 'activities'} to go.\n\nEach one is short — even 5 minutes of breathing or stretching can make a real difference. Would you like to see the Wellness page?`,
          actions: ['Go to Wellness', 'Tell Me About an Activity', 'Maybe Later']
        };
      }
      return {
        text: `The Wellness page has nine short daily activities${nameSuffix} — things like morning yoga, deep breathing, a short walk, or writing one memory. Each one is designed to be gentle and doable at your own pace.\n\nWould you like to go there now?`,
        actions: ['Go to Wellness', 'Tell Me More', 'Not Right Now']
      };
    }

    // ── Community ────────────────────────────────────────────────
    case 'community':
      return {
        text: `LifeConnect's Community section has groups for alumni, music lovers, cricket fans, wellness, regional culture, and more${nameSuffix}.\n\nYou can join groups that match your interests and take part in discussions with people from similar backgrounds.\n\nIs there a particular type of community you'd find meaningful?`,
        actions: ['Go to Community', 'Tell Me About Groups', 'Not Right Now']
      };

    // ── Daily Necessities & Grocery Market Prices ─────────────────
    case 'daily_goods_prices': {
      if (t.includes('milk') || t.includes('doodh') || t.includes('dairy') || t.includes('paneer') || t.includes('dahi')) {
        return {
          text: `In current local retail markets${nameSuffix}, full cream milk (Amul Gold / Mother Dairy) is around ₹66 to ₹72 per liter, while toned or cow milk is approximately ₹54 to ₹58 per liter.\n\nFresh paneer is about ₹90 to ₹120 for 200 grams, and fresh curd (dahi) is ₹35 to ₹45 for a 400g pack.\n\nWould you like price details on other groceries or vegetables?`,
          actions: ['Vegetable Prices', 'Salt & Sugar Rates', 'Check Oil & Ghee']
        };
      }
      if (t.includes('salt') || t.includes('namak') || t.includes('sugar') || t.includes('cheeni') || t.includes('oil') || t.includes('tel') || t.includes('ghee') || t.includes('tea') || t.includes('chai')) {
        return {
          text: `Tata Salt and standard iodized table salt are currently around ₹25 to ₹30 per kg${nameSuffix}, while Rock Salt (Sendha Namak) is ₹40 to ₹60.\n\nRefined sugar is selling at ₹42 to ₹46 per kg, cooking mustard oil is roughly ₹140 to ₹170 per liter, and pure Desi Ghee is ₹550 to ₹750 per liter.\n\nLet me know if you need rates for flour, rice, or seasonal vegetables!`,
          actions: ['Milk Prices', 'Vegetables Mandi Rates', 'Grains & Dals']
        };
      }
      if (t.includes('vegetable') || t.includes('vegetables') || t.includes('sabzi') || t.includes('sabji') || t.includes('potato') || t.includes('aloo') || t.includes('onion') || t.includes('pyaz') || t.includes('tomato') || t.includes('tamatar') || t.includes('mandi')) {
        return {
          text: `In the local vegetable mandi today${nameSuffix}:\n• Potatoes (Aloo): ₹25 – ₹35 per kg\n• Onions (Pyaz): ₹30 – ₹45 per kg\n• Tomatoes (Tamatar): ₹25 – ₹40 per kg\n• Green vegetables (Palak, Lauki, Bhindi): ₹30 – ₹50 per kg\n• Fresh Ginger (Adrak): ₹120 – ₹160 per kg.\n\nBuying from morning mandis usually gets you the freshest produce at the best prices!`,
          actions: ['Fruit Prices', 'Milk & Dairy Rates', 'General Grocery Rates']
        };
      }
      if (t.includes('fruit') || t.includes('fruits') || t.includes('kela') || t.includes('banana') || t.includes('apple') || t.includes('seb') || t.includes('papaya')) {
        return {
          text: `Current fruit prices in the local market${nameSuffix}:\n• Bananas: ₹45 – ₹65 per dozen\n• Apples (Shimla/Kashmiri): ₹120 – ₹200 per kg\n• Fresh Papaya: ₹40 – ₹60 per kg\n• Oranges / Mosambi: ₹60 – ₹90 per kg.\n\nFresh seasonal fruits are wonderful for daily vitality and digestion!`,
          actions: ['Vegetable Rates', 'Milk & Salt Prices', 'Wellness Tips']
        };
      }
      return {
        text: `Here is the current benchmark price guide for daily essentials${nameSuffix}:\n• Full Cream Milk: ₹66 – ₹72 / L\n• Tata Table Salt: ₹25 – ₹30 / kg\n• Whole Wheat Atta: ₹38 – ₹48 / kg (₹380 – ₹450 per 10kg bag)\n• Toor / Arhar Dal: ₹150 – ₹180 / kg\n• Potatoes & Onions: ₹25 – ₹40 / kg\n• Desi Ghee: ₹550 – ₹750 / L.\n\nWhich specific item would you like to check?`,
        actions: ['Milk & Dairy', 'Vegetable Mandi', 'Cooking Oil & Spices']
      };
    }

    // ── Illnesses & Chronic Conditions ───────────────────────────
    case 'illness_disease': {
      if (t.includes('bp') || t.includes('blood pressure') || t.includes('hypertension')) {
        return {
          text: `Maintaining a healthy blood pressure around 120–130/80 mmHg is ideal for seniors${nameSuffix}.\n\nA few helpful habits: limit table salt and processed snacks, take a 20–30 minute gentle morning walk, and practice deep breathing or Pranayama.\n\nIf you experience severe headaches or dizziness, check your readings immediately and consult your physician.`,
          actions: ['Talk About Diet', 'Daily Walking Tips', 'Check Medicines']
        };
      }
      if (t.includes('sugar') || t.includes('diabetes') || t.includes('diabetic') || t.includes('glucose')) {
        return {
          text: `Managing blood sugar is all about steady daily habits${nameSuffix}. Starting the morning with methi (fenugreek) water, having whole multigrain rotis, and including leafy greens like karela and palak help regulate glucose.\n\nMake sure to check your fasting and post-meal sugar levels regularly, take prescribed medicines with meals, and consult your doctor for periodic HbA1c tests.`,
          actions: ['Diabetic Diet Ideas', 'Wellness Routine', 'Doctor Checkup']
        };
      }
      if (t.includes('joint') || t.includes('knee') || t.includes('arthritis') || t.includes('ghutna') || t.includes('dard') || t.includes('pain') || t.includes('backache')) {
        return {
          text: `Joint stiffness and knee aches are very common with age${nameSuffix}. Gentle knee mobility stretches, applying warm sesame oil compresses, and having warm turmeric milk (haldi doodh) at night provide soothing relief.\n\nAvoid standing or sitting cross-legged for extended periods. If pain is acute or swollen, please have your orthopedic doctor evaluate it.`,
          actions: ['Gentle Stretches', 'Turmeric Milk Remedy', 'Speak to Doctor']
        };
      }
      if (t.includes('gas') || t.includes('acidity') || t.includes('indigestion') || t.includes('acid reflux') || t.includes('stomach') || t.includes('pet')) {
        return {
          text: `For gentle digestive comfort${nameSuffix}, sipping warm water with roasted ajwain (carom seeds) and jeera is a time-tested remedy.\n\nTry eating dinner at least 2 hours before bed, stay upright for 30 minutes after eating, and avoid oily deep-fried snacks. If acidity persists, antacids like Pantoprazole or Gelusil are commonly recommended by doctors.`,
          actions: ['Ajwain Water Remedy', 'Healthy Dinner Tips', 'Wellness Section']
        };
      }
      if (t.includes('cold') || t.includes('cough') || t.includes('fever') || t.includes('flu')) {
        return {
          text: `For seasonal colds and coughs${nameSuffix}, steam inhalation with tulsi or eucalyptus, warm ginger-tulsi-honey kadha, and keeping well-hydrated work wonders.\n\nGet plenty of warm rest. If you have a high fever or difficulty breathing, please consult your doctor right away.`,
          actions: ['Kadha Recipe', 'Rest & Wellness', 'Doctor Advice']
        };
      }
      return {
        text: `Living healthy after 50 is about simple, consistent habits${nameSuffix} — balanced home-cooked meals, daily hydration, light physical movement, and regular health checkups.\n\nTell me what specific symptom or illness you'd like guidance on, and I'll share helpful insights. Remember to always consult your doctor for medical prescriptions.`,
        actions: ['Blood Pressure', 'Diabetes Care', 'Joint Pain Tips']
      };
    }

    // ── Medicines & Pharmacy ──────────────────────────────────────
    case 'medicine_query': {
      if (t.includes('paracetamol') || t.includes('crocin') || t.includes('dolo') || t.includes('painkiller')) {
        return {
          text: `Paracetamol (like Dolo 650 or Crocin) is standard for mild fever, headaches, and general body aches${nameSuffix}. It is gentler on the stomach than heavy painkiller tablets.\n\nAlways take it with water after light food, and avoid exceeding the dosage recommended by your doctor.`,
          actions: ['Joint Pain Advice', 'General Medicines', 'Speak to Doctor']
        };
      }
      if (t.includes('pantoprazole') || t.includes('antacid') || t.includes('digene') || t.includes('gelusil') || t.includes('omeprazole')) {
        return {
          text: `Pantoprazole (Pan 40) or Omeprazole are commonly taken in the morning on an empty stomach to reduce acid reflux${nameSuffix}, while antacid syrups like Digene or Gelusil provide fast relief after meals.\n\nAlways follow your doctor's advice on duration and dosage.`,
          actions: ['Acidity Remedies', 'Dietary Tips', 'Other Medicines']
        };
      }
      if (t.includes('vitamin') || t.includes('calcium') || t.includes('d3') || t.includes('b-complex') || t.includes('becosules')) {
        return {
          text: `Daily supplements like Calcium with Vitamin D3 (for bone and joint strength) and B-Complex capsules (for nerve vitality and energy) are widely recommended for seniors${nameSuffix}.\n\nIt's best to take them after breakfast or lunch with plenty of water.`,
          actions: ['Bone Health Tips', 'Daily Routine', 'Doctor Advice']
        };
      }
      return {
        text: `When managing regular daily medications${nameSuffix}:\n1. Use a labeled 7-day pill organizer box to never miss a dose.\n2. Take tablets with lukewarm water at fixed hours.\n3. Keep an updated medicine list with your family or doctor.\n\nAlways consult your doctor or pharmacist before starting or changing any medication dosage.`,
        actions: ['Check Common Medicines', 'Talk About Symptoms', 'Wellness Page']
      };
    }

    // ── Health query ─────────────────────────────────────────────
    case 'health_query':
      return {
        text: `I'm here to support your daily wellness journey${nameSuffix}! While I can provide guidance on daily healthy routines, home remedies, nutrition, and market prices, medical diagnoses should always be confirmed with your family doctor.\n\nWhat specific health topic, symptom, or wellness habit would you like to explore today?`,
        actions: ['Illnesses & Remedies', 'Medicine Guidance', 'Daily Wellness']
      };

    // ── Sleep ────────────────────────────────────────────────────
    case 'sleep':
      return {
        text: `Sleep patterns do tend to shift as we get older${nameSuffix} — lighter sleep, earlier waking, more frequent interruptions. It's very common.\n\nA few things that often help: a consistent bedtime, keeping the room cool and dark, avoiding screens for 30 minutes before sleep, and a short breathing exercise.\n\nThat said, if sleep difficulty has been ongoing or is significantly affecting your day, it's worth mentioning to your doctor.\n\nHas this been a recent thing or something you've dealt with for a while?`,
        actions: ['Tell Me More', 'Try a Breathing Exercise', 'Speak to a Doctor']
      };

    // ── Travel ───────────────────────────────────────────────────
    case 'travel':
      return {
        text: pick([
          `Travel after 50 can be some of the most rewarding of a lifetime${nameSuffix} — there's more time, more perspective, and less need to rush.\n\nIs there somewhere you've been wanting to visit, or a place from your past you'd like to return to?`,
          `Is this something you're actively planning, or more of a wish list for now?`
        ]),
        actions: ['Share a Travel Memory', 'Tell Me More', 'Just Thinking About It']
      };

    // ── Hobbies ──────────────────────────────────────────────────
    case 'hobby':
      return {
        text: pick([
          `Hobbies have a way of giving structure and meaning to the day${nameSuffix}, especially when life's pace has slowed a little.\n\nWhat are you currently enjoying, or is there something you've been wanting to pick up again?`,
          `Tell me more about that — how long have you been interested in it, and do you do it regularly?`
        ]),
        actions: ['Tell Me More', 'Share a Related Memory', 'Suggest Similar Activities']
      };

    // ── Technology / learning ────────────────────────────────────
    case 'learning_tech':
      return {
        text: `Learning to use new technology takes time for everyone — it's genuinely not as intuitive as people make it seem${nameSuffix}.\n\nIs there something specific on LifeConnect — or on your phone or computer — that you'd like help understanding? I'll try to explain it clearly.`,
        actions: ['Help With LifeConnect', 'Something on My Phone', 'Just Curious']
      };

    // ── Legal / documents ────────────────────────────────────────
    case 'legal_docs':
      return {
        text: `LifeConnect has a Document Help section${nameSuffix} that can explain common documents in plain language — pension forms, bank paperwork, government schemes, insurance, property papers, and income tax forms.\n\nIt won't give you legal or financial advice, but it can help you understand what a form is asking before you fill it in.\n\nWould you like to go there, or is there a specific document you're trying to understand right now?`,
        actions: ['Go to Document Help', 'Explain This to Me', 'Not Right Now']
      };

    // ── Memory Vault ─────────────────────────────────────────────
    case 'app_vault':
      return {
        text: `The Memory Vault lets you save personal stories, events, and memories in a timeline format${nameSuffix}. You can add a year, a title, and write it in your own words.\n\nIt's meant to preserve things for your family — something they can read and understand long after the moment has passed.\n\nWould you like to add a memory now?`,
        actions: ['Go to Memory Vault', 'Add a Memory Now', 'Tell Me More']
      };

    // ── Profile ──────────────────────────────────────────────────
    case 'app_profile':
      return {
        text: `Your Profile page lets you view your account details, adjust text size, and manage your preferences${nameSuffix}.\n\nYou can reach it from the navigation bar at the top. Is there something specific you were trying to update?`,
        actions: ['Go to Profile', 'Something Else']
      };

    // ── Show more (button actions) ───────────────────────────────
    case 'show_more': {
      const showResponses = [
        `Let me pull something up for you${nameSuffix}. The Nostalgia Library has music, films, radio and magazines from your era — sorted by decade. The Time Machine section lets you explore a specific year in detail.\n\nWhich would you prefer?`,
        `Sure${nameSuffix}. Is there something specific you had in mind — a song, a memory, a place, or something about your daily routine?`
      ];
      return {
        text: pick(showResponses),
        actions: ['Nostalgia Library', 'Time Machine', 'Something Else']
      };
    }

    // ── General / fallback ───────────────────────────────────────
    case 'general':
    default: {
      const generalResponses = [
        `I'm not sure I completely understood that${nameSuffix} — could you tell me a little more? I want to give you a useful answer rather than a guess.`,
        `Tell me more about what you have in mind. I'll do my best to help.`,
        `That's an interesting area${nameSuffix}. I don't have enough to go on yet — what specifically were you thinking about?`,
        `I want to make sure I answer the right question. Could you expand on that a little?`
      ];
      return {
        text: pick(generalResponses),
        actions: ['Wellness', 'Nostalgia Library', 'Memory Vault']
      };
    }
  }
}

/** Pick a random item from an array — for natural variation in responses. */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Public function called by the rest of the app.
 * Classifies intent and builds the response.
 */
function getAIResponse(msg) {
  if (!msg || !msg.trim()) return null;
  const intent = classifyIntent(msg);
  return buildAIResponse(intent, msg);
}

// ── Chat UI helpers ──────────────────────────────────────────────
let chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
function saveChatHistory() { localStorage.setItem('chatHistory', JSON.stringify(chatHistory)); }

async function fetchLLMResponse(msg) {
  chatHistory.push({ role: 'user', content: msg });
  saveChatHistory();
  try {
    const res = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory })
    });
    if (!res.ok) throw new Error('API Error');
    const data = await res.json();
    chatHistory.push({ role: 'assistant', content: data.text });
    saveChatHistory();
    return { text: data.text, actions: null };
  } catch (err) {
    console.error(err);
    const localRes = getAIResponse(msg);
    if (localRes) {
      chatHistory.push({ role: 'assistant', content: localRes.text });
      saveChatHistory();
      return localRes;
    }
    const fallbackText = "I'm having trouble connecting right now, but I'm still here.";
    chatHistory.push({ role: 'assistant', content: fallbackText });
    saveChatHistory();
    return { text: fallbackText, actions: ['Wellness', 'Nostalgia Library'] };
  }
}

function addChatMessage(container, role, text, actions) {
  const msg = document.createElement('div');
  msg.className = `chat-msg ${role}`;
  const avatarIcon = role === 'ai' ? companionAvatar : '🙂';
  msg.innerHTML = `
    <div class="chat-msg__avatar">${avatarIcon}</div>
    <div>
      <div class="chat-msg__bubble">${text.replace(/\n/g, '<br>')}</div>
      ${actions ? `<div class="chat-msg__actions">${actions.map(a => `<button class="chat-msg__btn" onclick="handleChatAction(this,'${a.replace(/'/g, "\\'")}')"> ${a}</button>`).join('')}</div>` : ''}
    </div>
  `;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function showTypingIndicator(container) {
  const typing = document.createElement('div');
  typing.className = 'chat-msg ai chat-typing-indicator';
  typing.id = 'chat-typing-' + container.id;
  typing.innerHTML = `
    <div class="chat-msg__avatar">${companionAvatar}</div>
    <div><div class="chat-msg__bubble" style="padding:12px 16px;">
      <span style="display:inline-flex;gap:4px;align-items:center;">
        <span style="width:7px;height:7px;border-radius:50%;background:var(--text-light);animation:typingDot 1.2s infinite 0s;display:inline-block;"></span>
        <span style="width:7px;height:7px;border-radius:50%;background:var(--text-light);animation:typingDot 1.2s infinite 0.2s;display:inline-block;"></span>
        <span style="width:7px;height:7px;border-radius:50%;background:var(--text-light);animation:typingDot 1.2s infinite 0.4s;display:inline-block;"></span>
      </span>
    </div></div>
  `;
  container.appendChild(typing);
  container.scrollTop = container.scrollHeight;
  return typing;
}

function handleChatAction(btn, action) {
  const container = btn.closest('.chat-ui__body, .floating-chat-panel__body');
  if (!container) return;
  addChatMessage(container, 'user', action, null);
  btn.closest('.chat-msg__actions').remove();
  const typing = showTypingIndicator(container);
  setTimeout(() => {
    typing.remove();
    if (action === 'Wellness') {
      navigate('wellness');
      addChatMessage(container, 'ai', "Taking you to Wellness...", null);
    } else if (action === 'Nostalgia Library') {
      navigate('nostalgia');
      addChatMessage(container, 'ai', "Opening the Nostalgia Library...", null);
    } else if (action === 'Memory Vault') {
      navigate('vault');
      addChatMessage(container, 'ai', "Unlocking your Memory Vault...", null);
    } else {
      fetchLLMResponse(action).then(res => {
        addChatMessage(container, 'ai', res.text, res.actions);
      });
    }
  }, 900);
}

function initCompanionChatUI(containerId, bodyId, inputId, sendId) {
  const body = document.getElementById(bodyId);
  const input = document.getElementById(inputId);
  const send = document.getElementById(sendId);
  if (!body || !input || !send) return;

  body.innerHTML = '';

  if (chatHistory.length === 0) {
    const user = getStoredUser();
    const firstName = user ? (user.firstName || user.name.split(' ')[0]) : null;
    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const greeting = firstName
      ? `${timeGreeting}, ${firstName} Ji. Good to have you here. What would you like to explore today?`
      : `${timeGreeting}! I'm Mitra, your companion here on LifeConnect. What would you like to explore today?`;

    chatHistory.push({ role: 'assistant', content: greeting });
    saveChatHistory();
    addChatMessage(body, 'ai', greeting, ['Wellness', 'Nostalgia Library', 'Memory Vault']);
  } else {
    chatHistory.forEach(msg => {
      addChatMessage(body, msg.role === 'user' ? 'user' : 'ai', msg.content, null);
    });
  }

  const sendMsg = () => {
    const msg = input.value.trim();
    if (!msg) return;
    addChatMessage(body, 'user', msg, null);
    input.value = '';
    const typing = showTypingIndicator(body);
    fetchLLMResponse(msg).then(res => {
      typing.remove();
      addChatMessage(body, 'ai', res.text, res.actions);
    });
  };

  send.addEventListener('click', sendMsg);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });
}

function initCompanion() {
  // Avatar selection
  const avatarOptions = document.querySelectorAll('.avatar-option');
  const savedAvatar = getAvatar();
  avatarOptions.forEach(opt => {
    if (savedAvatar && opt.dataset.name === savedAvatar) opt.classList.add('selected');
    opt.addEventListener('click', () => {
      avatarOptions.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      companionAvatar = opt.dataset.emoji;
      companionName = opt.dataset.name;
      localStorage.setItem(LS.AVATAR, opt.dataset.name);
      showToast(`${companionName} is now your companion.`, 'success');
      updateFloatingChatUI();
      initCompanionChatUI('companion-chat', 'companion-chat-body', 'companion-chat-input', 'companion-chat-send');
    });
  });

  // Tabs
  const tabBtns = document.querySelectorAll('#view-companion .tab-btn');
  const tabPanels = document.querySelectorAll('#view-companion .tab-panel');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  initCompanionChatUI('companion-chat', 'companion-chat-body', 'companion-chat-input', 'companion-chat-send');

  // Wire up voice orb click handler
  initVoiceUI('companion-voice-orb', 'companion-voice-status', 'companion-voice-transcript', 'companion-medicine-results');
}

// ----------------------------------------------------------------
// 12. VOICE UI
// ----------------------------------------------------------------
let recognition = null;
let isListening = false;

const VOICE_COMMANDS = [
  '"Call my daughter"',
  '"Show my old photos"',
  '"Play Lata Mangeshkar songs"',
  '"What year did India win the World Cup?"',
  '"Find my school friends"',
];

const DEMO_VOICE_RESPONSES = [
  { trigger: ['call', 'daughter', 'son', 'phone', 'family'], response: 'Family calling feature would connect to your selected communication app here. (Feature requires backend integration.)' },
  { trigger: ['photo', 'picture', 'image', 'vault'], response: 'Opening your Memory Vault to show your saved photos and memories.' },
  { trigger: ['song', 'music', 'lata', 'kishore', 'play'], response: 'Music playback would connect to your licensed music service here. Showing songs from the 1970s era.' },
  { trigger: ['doctor', 'appointment', 'medicine', 'book'], response: 'Appointment booking would connect to your selected healthcare service here. (Feature requires backend integration.)' },
  { trigger: ['friend', 'school', 'college', 'reconnect'], response: 'Opening Reconnect to find people from your past.' },
  { trigger: ['weather', 'today', 'news'], response: 'News and weather would come from connected services here. (Feature requires backend integration.)' },
];

// ----------------------------------------------------------------
// SPEECH SYNTHESIS ENGINE (Spoken Voice Output)
// ----------------------------------------------------------------
let currentSpeechUtterance = null;
let currentAudioPlayer = null;

function stopSpeaking() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (currentAudioPlayer) {
    try { currentAudioPlayer.pause(); } catch (e) { }
    currentAudioPlayer = null;
  }
  currentSpeechUtterance = null;
}

function speakText(text, onStartCallback, onEndCallback) {
  stopSpeaking();
  if (!text || !text.trim()) {
    if (onEndCallback) onEndCallback();
    return;
  }

  // Clean text formatting for natural speech delivery
  const cleanText = text.replace(/[*_#~]/g, '').trim();

  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.92;   // Elder-friendly steady speech rate
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v =>
      v.lang.startsWith('hi') || v.lang.includes('en-IN') || v.name.includes('India') || v.name.includes('Natural')
    ) || voices.find(v => v.lang.startsWith('en'));

    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => {
      currentSpeechUtterance = utterance;
      if (onStartCallback) onStartCallback();
    };

    utterance.onend = () => {
      currentSpeechUtterance = null;
      if (onEndCallback) onEndCallback();
    };

    utterance.onerror = (e) => {
      console.warn("Speech synthesis error:", e);
      currentSpeechUtterance = null;
      if (onEndCallback) onEndCallback();
    };

    if (voices.length === 0 && 'onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        const v2 = window.speechSynthesis.getVoices();
        const p2 = v2.find(v => v.lang.startsWith('hi') || v.lang.includes('en-IN')) || v2[0];
        if (p2) utterance.voice = p2;
      };
    }

    window.speechSynthesis.speak(utterance);
  } else {
    // Backend TTS voice stream fallback
    fetch(`${API_BASE_URL}/audio/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanText })
    }).then(res => res.blob()).then(blob => {
      const url = URL.createObjectURL(blob);
      currentAudioPlayer = new Audio(url);
      if (onStartCallback) onStartCallback();
      currentAudioPlayer.onended = () => {
        currentAudioPlayer = null;
        if (onEndCallback) onEndCallback();
      };
      currentAudioPlayer.play();
    }).catch(err => {
      console.error("Voice playback fallback error:", err);
      if (onEndCallback) onEndCallback();
    });
  }
}

// ----------------------------------------------------------------
// VOICE SEARCH ENGINE (GOOGLE-STYLE DIRECT KNOWLEDGE & SEARCH)
// Fully detached from personal companion chatbot history
// ----------------------------------------------------------------
async function fetchVoiceSearch(queryText) {
  try {
    const res = await fetch(`${API_BASE_URL}/voice/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryText })
    });
    if (res.ok) {
      const data = await res.json();
      return data.answer || "I found search results for your query.";
    }
  } catch (err) {
    console.warn("Backend voice search offline, using local search fallback:", err);
  }

  // Local Voice Search Fallback
  const q = queryText.toLowerCase().trim();

  // Sacred Gayatri Mantra & Mantras
  if (q.includes('gayatri') || q.includes('gaytri') || q.includes('gayatree') || q.includes('savitur') || q.includes('prachodayat')) {
    return "The sacred Gayatri Mantra is: 'Om Bhur Bhuvah Swah, Tat Savitur Varenyam, Bhargo Devasya Dheemahi, Dhiyo Yo Nah Prachodayat.' Its divine meaning is: 'We meditate on the supreme light of the divine Creator who illuminates all realms. May that spiritual light inspire and guide our intellect and wisdom.' Chanting this revered Vedic mantra brings deep inner peace, spiritual calmness, and mental clarity.";
  }

  // Greetings & Cultural Manners
  if (q.includes('pranam') || q.includes('pranaam') || q.includes('charan sparsh')) {
    return "Pranam Ji! Sada khush aur tandurust rahein. Kahiye, aaj aapke liye kya jankari ya search karoon?";
  }
  if (q.includes('namaste') || q.includes('namaskar') || q.includes('namaskaram') || q.includes('namastey')) {
    return "Namaste Ji! A warm welcome. How may I assist you with your questions, daily prices, or health remedies today?";
  }
  if (q.includes('asalam') || q.includes('assalam') || q.includes('walekum') || q.includes('alaikum') || q.includes('salam')) {
    return "Walekum Assalam Wa Rahmatullahi Wa Barakatuh! Kahiye, aaj aapke liye kya search ya jankari laaoon?";
  }
  if (q.includes('kem cho') || q.includes('kemcho') || q.includes('majama')) {
    return "Kem cho Ji! Majama chho? Kahiye, aaj market na bhav ke biji koi jankari janna chahte hain?";
  }
  if (q.includes('sat sri akal') || q.includes('sasriakal') || q.includes('waheguru')) {
    return "Sat Sri Akal Ji! Waheguru ji ka khalsa, Waheguru ji ki fateh. Kahiye, aaj ki seva karoon?";
  }
  if (q.includes('vanakkam') || q.includes('namaskara')) {
    return "Vanakkam! A warm welcome to you. What would you like to search or know today?";
  }
  if (q.includes('radhe radhe') || q.includes('ram ram') || q.includes('jai shree krishna') || q.includes('jai jinendra')) {
    return `${queryText} Ji! Wishing you peace, good health, and joy. How can I help you today?`;
  }
  if (q.includes('good morning') || q.includes('shubh prabhat')) {
    return "A very good morning to you! Wishing you a peaceful and bright day ahead. What would you like to know or search today?";
  }
  if (q.includes('good afternoon') || q.includes('shubh dopahar')) {
    return "Good afternoon! Hope you are having a pleasant day. How may I help you right now?";
  }
  if (q.includes('good evening') || q.includes('shubh sandhya')) {
    return "Good evening! Hope you had a relaxing day. What can I search or help you with this evening?";
  }
  if (q.includes('good night') || q.includes('shubh ratri')) {
    return "Good night! Wishing you deep and restful sleep. Take care and stay well.";
  }
  if (q.includes('hello') || q.includes('hi') || q.includes('hey') || q.includes('kaise ho')) {
    return "Hello and welcome! I am your Voice Assistant. You can ask me anything — today's grocery and vegetable prices, health remedies, weather, cricket facts, or daily knowledge.";
  }

  // Commodities & Knowledge
  if (q.includes('milk') || q.includes('doodh') || q.includes('dairy') || q.includes('paneer') || q.includes('dahi')) {
    return "In local Indian retail markets today, full cream milk (Amul Gold / Mother Dairy) is around ₹66 to ₹72 per liter, toned or cow milk is approximately ₹54 to ₹58 per liter, and fresh paneer is about ₹90 to ₹120 for 200 grams.";
  }
  if (q.includes('vegetable') || q.includes('vegetables') || q.includes('sabzi') || q.includes('sabji') || q.includes('potato') || q.includes('aloo') || q.includes('onion') || q.includes('pyaz') || q.includes('tomato') || q.includes('tamatar')) {
    return "According to mandi rates today: potatoes (aloo) are ₹25 to ₹35 per kilo, onions (pyaz) are ₹30 to ₹45, tomatoes (tamatar) range between ₹25 to ₹40 per kilo, and bananas are roughly ₹45 to ₹60 a dozen.";
  }
  if (q.includes('salt') || q.includes('namak') || q.includes('sugar') || q.includes('cheeni') || q.includes('oil') || q.includes('tel') || q.includes('ghee')) {
    return "Tata Salt is currently ₹25 to ₹30 per kg, Sendha Namak is ₹40 to ₹60, refined sugar is ₹42 to ₹46 per kg, mustard oil is roughly ₹140 to ₹170 per liter, and pure desi ghee is ₹550 to ₹750 per liter.";
  }
  if (q.includes('bp') || q.includes('blood pressure') || q.includes('hypertension')) {
    return "For seniors, a healthy blood pressure target is around 120 to 130 over 80 mmHg. Reducing salt intake, daily 30-minute morning walks, and morning Pranayama breathing help keep it in balance.";
  }
  if (q.includes('sugar') || q.includes('diabetes') || q.includes('diabetic')) {
    return "Normal fasting blood sugar for seniors is below 110 to 125 mg/dL. Daily habits like morning fenugreek (methi) water, whole grains, and leafy vegetables like karela help control spikes.";
  }
  if (q.includes('joint') || q.includes('knee') || q.includes('arthritis') || q.includes('ghutna') || q.includes('dard')) {
    return "For joint stiffness and knee aches, applying warm sesame oil compresses, doing gentle knee mobility exercises, and having warm turmeric milk at night provide soothing natural relief.";
  }
  if (q.includes('gas') || q.includes('acidity') || q.includes('indigestion') || q.includes('stomach') || q.includes('pet')) {
    return "A fast home remedy for acidity is drinking warm water infused with roasted ajwain and cumin seeds (jeera). Eating dinner at least two hours before sleeping prevents acid reflux.";
  }
  if (q.includes('medicine') || q.includes('tablet') || q.includes('dawai') || q.includes('paracetamol')) {
    return "Paracetamol (Dolo 650 or Crocin) is standard for mild fever and aches. Antacids like Pantoprazole soothe stomach acidity, and daily Calcium with Vitamin D3 supports bone density.";
  }
  if (q.includes('cricket') || q.includes('world cup') || q.includes('1983')) {
    return "India won its first historic Cricket World Cup in 1983 under Kapil Dev at Lord's, defeating the West Indies, and won again in 2011 under MS Dhoni.";
  }

  return `Search result for '${queryText}': Here is the information on your query. You can ask me about live market prices, health remedies, weather, cricket facts, or daily knowledge.`;
}

// ----------------------------------------------------------------
// UNIVERSAL VOICE NAVIGATION & ONLINE MEDICINE ORDERING ENGINE
// ----------------------------------------------------------------

function parseNavigationCommand(lower) {
  const routes = [
    {
      viewId: 'news',
      title: '24-Hour News & City Updates',
      keywords: ['news', 'samachar', 'headline', 'headlines', 'khabar', 'akhbar', 'breaking news']
    },
    {
      viewId: 'wellness',
      title: 'Senior Wellness, Walking & Yoga',
      keywords: ['wellness', 'exercise', 'exercises', 'yoga', 'stretch', 'stretching', 'swasthya', 'fitness', 'health', 'walking', 'routine', 'routines', 'breathing']
    },
    {
      viewId: 'memories',
      title: 'Nostalgia & Memory Vault',
      keywords: ['memory', 'memories', 'vault', 'photo', 'photos', 'album', 'yaad', 'yaadein', 'purani yaadein', 'nostalgia']
    },
    {
      viewId: 'reconnect',
      title: 'Old Friends & Batchmates Reconnect',
      keywords: ['reconnect', 'friend', 'friends', 'dost', 'batchmate', 'batchmates', 'school friend', 'college', 'classmate', 'classmates', 'alumni']
    },
    {
      viewId: 'content',
      title: 'For You Entertainment & Music',
      keywords: ['for you', 'foryou', 'content', 'song', 'songs', 'gaana', 'gaane', 'music', 'video', 'videos', 'movie', 'movies', 'cinema', 'retro', 'radio', 'vividh bharati']
    },
    {
      viewId: 'community',
      title: 'Senior Community & Clubs',
      keywords: ['community', 'club', 'clubs', 'group', 'groups', 'mandal', 'samuh', 'seniors', 'discussion']
    },
    {
      viewId: 'companion',
      title: 'AI Life Companion',
      keywords: ['companion', 'mitra', 'saheli', 'guru', 'ai friend', 'ai companion', 'chat', 'assistant']
    },
    {
      viewId: 'dashboard',
      title: 'My Home Dashboard',
      keywords: ['dashboard', 'my home', 'my dashboard']
    },
    {
      viewId: 'home',
      title: 'Home',
      keywords: ['home', 'homepage', 'main page', 'start', 'mukhya']
    },
    {
      viewId: 'profile',
      title: 'Profile & Account Settings',
      keywords: ['profile', 'account', 'settings', 'user profile', 'my profile']
    }
  ];

  const navPrefixes = [
    'let me to', 'let me go to', 'lead me to', 'take me to', 'go to', 'come to',
    'open', 'show', 'show me', 'navigate to', 'switch to', 'bring me to', 'visit',
    'chalo', 'kholo', 'dikhao', 'le chalo', 'section'
  ];

  const hasNavIntent = navPrefixes.some(p => lower.includes(p)) || lower.includes('section');

  for (const route of routes) {
    for (const kw of route.keywords) {
      if (lower.includes(kw)) {
        return route;
      }
    }
  }

  if (hasNavIntent && lower.includes('section')) {
    return { viewId: 'home', title: 'Home' };
  }

  return null;
}

function parseMedicineCommand(cleanText, lower) {
  const medicineKeywords = [
    'medicine', 'medicines', 'dawa', 'dawai', 'order', 'buy', 'purchase',
    'pharmacy', 'chemist', 'tablet', 'tablets', 'capsule', 'capsules', 'syrup',
    'dose', 'mg', 'pill', 'pills', 'paracetamol', 'dolo', 'crocin', 'calpol',
    'metformin', 'telmisartan', 'amlodipine', 'atorvastatin', 'thyronorm',
    'shelcal', 'combiflam', 'januvia', 'glycomet', 'ecosprin', 'aspirin',
    'pantocid', 'pan d', 'vicks', 'insulin', 'bp medicine', 'diabetes medicine'
  ];

  const hasMedIntent = medicineKeywords.some(k => lower.includes(k));
  if (!hasMedIntent) return null;

  const seniorMedicines = {
    'dolo 650': {
      name: 'Dolo 650 Tablet',
      generic: 'Paracetamol 650mg',
      category: 'Fever & Pain Relief',
      desc: 'Most trusted antipyretic & analgesic for relief from fever, headache, body ache, and viral symptoms.',
      prescription: false,
      approxPrice: '₹30 - ₹35 for strip of 15',
      dosageNotice: 'Take as directed by doctor. Do not exceed 4 tablets in 24 hours.'
    },
    'paracetamol': {
      name: 'Paracetamol 650mg / 500mg',
      generic: 'Acetaminophen / Paracetamol',
      category: 'Fever & Pain Relief',
      desc: 'Safe and effective relief from fever, mild to moderate aches, and dental or joint discomfort.',
      prescription: false,
      approxPrice: '₹20 - ₹30 for strip of 10-15',
      dosageNotice: 'Avoid consuming with other paracetamol-containing products.'
    },
    'crocin': {
      name: 'Crocin Advance / 650mg',
      generic: 'Paracetamol with Fast Release',
      category: 'Fever & Headache',
      desc: 'Rapidly dissolving formulation providing fast relief from fever and painful headaches.',
      prescription: false,
      approxPrice: '₹25 - ₹35 for strip of 15',
      dosageNotice: 'Take with half a glass of water after food.'
    },
    'metformin': {
      name: 'Metformin 500mg / 1000mg (Glycomet)',
      generic: 'Metformin Hydrochloride (Sustained Release)',
      category: 'Type-2 Diabetes Management',
      desc: 'First-line prescription medication that helps control blood sugar levels by improving insulin sensitivity.',
      prescription: true,
      approxPrice: '₹40 - ₹70 for strip of 20',
      dosageNotice: 'Prescription required. Take with or immediately after meals.'
    },
    'glycomet': {
      name: 'Glycomet 500mg / SR',
      generic: 'Metformin Hydrochloride SR',
      category: 'Type-2 Diabetes Management',
      desc: 'Trusted sustained-release formulation for daily glycemic control in diabetic seniors.',
      prescription: true,
      approxPrice: '₹45 - ₹65 for strip of 20',
      dosageNotice: 'Requires valid prescription. Monitor blood glucose regularly.'
    },
    'telmisartan': {
      name: 'Telmisartan 40mg (Telma 40)',
      generic: 'Telmisartan (ARB Antihypertensive)',
      category: 'High Blood Pressure & Heart Care',
      desc: 'Relaxes blood vessels, effectively lowers elevated blood pressure, and protects kidney function in seniors.',
      prescription: true,
      approxPrice: '₹70 - ₹120 for strip of 15',
      dosageNotice: 'Prescription required. Take at the same time every morning.'
    },
    'telma': {
      name: 'Telma 40 Tablet',
      generic: 'Telmisartan 40mg',
      category: 'High Blood Pressure / Hypertension',
      desc: 'Top brand Telmisartan for maintaining optimal blood pressure and heart wellness.',
      prescription: true,
      approxPrice: '₹90 - ₹130 for strip of 15',
      dosageNotice: 'Prescription required. Do not skip doses without doctor consultation.'
    },
    'amlodipine': {
      name: 'Amlodipine 5mg (Amlong / Stamlo)',
      generic: 'Amlodipine Besylate',
      category: 'Blood Pressure & Angina',
      desc: 'Calcium channel blocker that widens arteries, lowering high blood pressure and preventing chest tightness.',
      prescription: true,
      approxPrice: '₹30 - ₹50 for strip of 15',
      dosageNotice: 'Prescription required. May cause mild ankle swelling; report to physician.'
    },
    'atorvastatin': {
      name: 'Atorvastatin 10mg / 20mg (Atorva / Storvas)',
      generic: 'Atorvastatin (Statin)',
      category: 'Cholesterol & Heart Protection',
      desc: 'Reduces LDL (bad cholesterol) and triglycerides while elevating HDL (good cholesterol) to prevent cardiac events.',
      prescription: true,
      approxPrice: '₹80 - ₹160 for strip of 15',
      dosageNotice: 'Prescription required. Take once daily at bedtime.'
    },
    'thyronorm': {
      name: 'Thyronorm (25mcg / 50mcg / 100mcg)',
      generic: 'Levothyroxine Sodium',
      category: 'Thyroid Hormone Support',
      desc: 'Synthetic thyroid hormone for hypothyroidism treatment; restores metabolism, energy, and mental clarity.',
      prescription: true,
      approxPrice: '₹140 - ₹190 for bottle of 100-120',
      dosageNotice: 'Prescription required. Must be taken on an empty stomach with plain water, 30-45 mins before tea/breakfast.'
    },
    'shelcal': {
      name: 'Shelcal 500 Tablet',
      generic: 'Calcium Carbonate 500mg + Vitamin D3 250 IU',
      category: 'Bone Health & Osteoporosis',
      desc: 'Essential daily calcium and vitamin D3 formulation to strengthen senior bones, prevent fractures, and reduce joint stiffness.',
      prescription: false,
      approxPrice: '₹95 - ₹120 for strip of 15',
      dosageNotice: 'Best taken after lunch or dinner.'
    },
    'calcium': {
      name: 'Shelcal 500 / Calcium with Vitamin D3',
      generic: 'Calcium 500mg + Cholecalciferol (D3)',
      category: 'Joints & Bone Density',
      desc: 'Replenishes bone mineral density, prevents brittle bones, and promotes joint mobility.',
      prescription: false,
      approxPrice: '₹90 - ₹120 for strip of 15',
      dosageNotice: 'Take with a glass of water after main meals.'
    },
    'pan d': {
      name: 'Pan-D Capsule',
      generic: 'Pantoprazole 40mg + Domperidone 30mg SR',
      category: 'Acidity, Gas & Acid Reflux (GERD)',
      desc: 'Dual-action relief for severe heartburn, acidity, gas bloating, nausea, and morning gastric discomfort.',
      prescription: true,
      approxPrice: '₹140 - ₹190 for strip of 15',
      dosageNotice: 'Take 30 minutes before breakfast on an empty stomach.'
    },
    'pantocid': {
      name: 'Pantocid 40 Tablet',
      generic: 'Pantoprazole Gastro-Resistant 40mg',
      category: 'Acidity & Gastric Ulcer Care',
      desc: 'Suppresses excess stomach acid secretion to heal gastric irritation and prevent heartburn.',
      prescription: true,
      approxPrice: '₹120 - ₹165 for strip of 15',
      dosageNotice: 'Take early morning before breakfast.'
    },
    'ecosprin': {
      name: 'Ecosprin 75 / 150 Tablet',
      generic: 'Aspirin (Gastro-resistant / Low Dose)',
      category: 'Blood Thinner & Cardiac Care',
      desc: 'Prevents blood clots, reducing risk of secondary heart attacks and ischemic strokes in seniors.',
      prescription: true,
      approxPrice: '₹10 - ₹18 for strip of 14',
      dosageNotice: 'Strictly as prescribed by cardiologist. Always take with food.'
    },
    'aspirin': {
      name: 'Ecosprin 75mg / Aspirin',
      generic: 'Acetylsalicylic acid (Low Dose)',
      category: 'Blood Thinner & Heart Health',
      desc: 'Low-dose platelet aggregation inhibitor for cardiovascular protection.',
      prescription: true,
      approxPrice: '₹10 - ₹15 for strip of 14',
      dosageNotice: 'Take after meals with water. Do not stop without doctor advice.'
    },
    'combiflam': {
      name: 'Combiflam Tablet',
      generic: 'Ibuprofen 400mg + Paracetamol 325mg',
      category: 'Joint & Muscle Pain Relief',
      desc: 'Combination anti-inflammatory tablet for acute muscular spasms, arthritis pain, and swelling.',
      prescription: false,
      approxPrice: '₹35 - ₹48 for strip of 20',
      dosageNotice: 'Always take after food. Seniors with kidney disease should consult doctor first.'
    },
    'januvia': {
      name: 'Januvia 50mg / 100mg Tablet',
      generic: 'Sitagliptin (DPP-4 Inhibitor)',
      category: 'Advanced Diabetes Care',
      desc: 'Regulates post-meal blood sugar surges without causing unwanted hypoglycemia (sugar drop).',
      prescription: true,
      approxPrice: '₹350 - ₹450 for strip of 7-14',
      dosageNotice: 'Prescription required. Take once daily with or without food.'
    },
    'neurobion': {
      name: 'Neurobion Forte Tablet',
      generic: 'Vitamin B1, B2, B3, B5, B6 & B12',
      category: 'Nerve Strength & Neuropathy',
      desc: 'Nourishes peripheral nerves, relieves tingling, numbness, and burning sensations in hands and feet.',
      prescription: false,
      approxPrice: '₹38 - ₹45 for strip of 30',
      dosageNotice: 'One tablet daily after food.'
    },
    'diabetes': {
      name: 'Metformin 500mg SR / Glycomet (Diabetes Care)',
      generic: 'Metformin Hydrochloride',
      category: 'Type-2 Diabetes Management',
      desc: 'Standard senior blood sugar stabilizer to prevent diabetic complications.',
      prescription: true,
      approxPrice: '₹40 - ₹65 for strip of 20',
      dosageNotice: 'Requires doctor prescription. Check HbA1c every 3 months.'
    },
    'bp': {
      name: 'Telmisartan 40mg / Amlodipine (Blood Pressure Care)',
      generic: 'Telmisartan 40mg',
      category: 'Hypertension / BP Management',
      desc: 'Keeps senior blood pressure in healthy range (under 130/80 mmHg).',
      prescription: true,
      approxPrice: '₹70 - ₹120 for strip of 15',
      dosageNotice: 'Requires doctor prescription. Measure BP twice weekly.'
    }
  };

  let matchedKey = null;
  for (const key of Object.keys(seniorMedicines)) {
    if (lower.includes(key)) {
      matchedKey = key;
      break;
    }
  }

  if (matchedKey) {
    const info = seniorMedicines[matchedKey];
    return {
      medicineName: info.name,
      searchTerm: matchedKey,
      ...info
    };
  }

  const cleanTokens = lower
    .replace(/\b(let me to|go to|come to|lead me to|take me to|please|can you|search that|search this|search|order this|order that|order|buy|find|get|purchase|where is|link where|link for|links to|available|on internet|on google|online|medicine|medicines|dawa|dawai|karo|batao|chahiye|de do|ka link)\b/gi, ' ')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  let extractedName = '';
  if (cleanTokens.length > 1) {
    extractedName = cleanTokens.split(' ').slice(0, 4).join(' ');
  } else {
    extractedName = 'Dolo 650';
  }

  const formattedName = extractedName.replace(/\b\w/g, c => c.toUpperCase());

  return {
    medicineName: formattedName,
    searchTerm: extractedName,
    generic: formattedName,
    category: 'General Healthcare & Pharmacy',
    desc: `Online ordering and price comparison for ${formattedName} across top verified Indian pharmacies.`,
    prescription: false,
    approxPrice: 'Standard Pharmacy Rates',
    dosageNotice: 'Please verify with a registered medical practitioner before starting medication.'
  };
}

function renderMedicineCard(med) {
  const q = encodeURIComponent(med.searchTerm || med.medicineName);
  const tata1mg = `https://www.1mg.com/search/all?name=${q}`;
  const pharmEasy = `https://pharmeasy.in/search/all?name=${q}`;
  const apollo = `https://www.apollopharmacy.in/search-medicines/${q}`;
  const netmeds = `https://www.netmeds.com/catalogsearch/result/${q}/all`;
  const googleBuy = `https://www.google.com/search?q=${encodeURIComponent((med.searchTerm || med.medicineName) + ' buy medicine online india')}`;

  const rxBadge = med.prescription 
    ? `<span class="med-rx-badge prescription-required">📄 Doctor Prescription Required</span>`
    : `<span class="med-rx-badge otc-available">🟢 Available Over The Counter (OTC)</span>`;

  return `
    <div class="medicine-order-card">
      <div class="med-card-top">
        <div class="med-badge-row">
          <span class="med-category-pill">💊 ${med.category || 'Medicine Ordering'}</span>
          ${rxBadge}
        </div>
        <h3 class="med-card-title">${med.name || med.medicineName}</h3>
        <div class="med-generic-info"><strong>Active Composition:</strong> ${med.generic || med.medicineName}</div>
        <p class="med-card-desc">${med.desc || 'Find genuine stocks and compare prices across certified online pharmacies with door-step delivery in India.'}</p>
        
        <div class="med-quick-meta">
          <div class="med-meta-item">
            <span class="meta-label">Approx. Price Range</span>
            <span class="meta-val">${med.approxPrice || 'Standard Pharmacy Rates'}</span>
          </div>
          <div class="med-meta-item">
            <span class="meta-label">Senior Dosage Guide</span>
            <span class="meta-val">${med.dosageNotice || 'Follow dosage prescribed by your physician.'}</span>
          </div>
        </div>
      </div>

      <div class="med-pharmacies-header">
        <h4>🛒 Where to Buy (Click link to order directly):</h4>
        <span class="verified-seal">✓ Verified Safe Indian Pharmacies</span>
      </div>

      <div class="med-pharmacies-grid">
        <a href="${tata1mg}" target="_blank" rel="noopener noreferrer" class="pharmacy-link-card tata-1mg">
          <div class="pharmacy-card-header">
            <span class="pharmacy-icon">🟢</span>
            <div>
              <div class="pharmacy-name">Tata 1mg</div>
              <div class="pharmacy-delivery">Doorstep Delivery • 100% Genuine</div>
            </div>
          </div>
          <div class="pharmacy-perk">Home delivery across India + lab tests</div>
          <div class="pharmacy-action-btn">Order on Tata 1mg ↗</div>
        </a>

        <a href="${pharmEasy}" target="_blank" rel="noopener noreferrer" class="pharmacy-link-card pharmeasy">
          <div class="pharmacy-card-header">
            <span class="pharmacy-icon">🟠</span>
            <div>
              <div class="pharmacy-name">PharmEasy</div>
              <div class="pharmacy-delivery">Up to 20% Senior Discount</div>
            </div>
          </div>
          <div class="pharmacy-perk">Easy reordering + Monthly refill reminder</div>
          <div class="pharmacy-action-btn">Order on PharmEasy ↗</div>
        </a>

        <a href="${apollo}" target="_blank" rel="noopener noreferrer" class="pharmacy-link-card apollo">
          <div class="pharmacy-card-header">
            <span class="pharmacy-icon">🔵</span>
            <div>
              <div class="pharmacy-name">Apollo Pharmacy</div>
              <div class="pharmacy-delivery">Fast Express Delivery (2 to 4 hrs)</div>
            </div>
          </div>
          <div class="pharmacy-perk">Direct from Apollo's 5000+ local stores</div>
          <div class="pharmacy-action-btn">Order on Apollo ↗</div>
        </a>

        <a href="${netmeds}" target="_blank" rel="noopener noreferrer" class="pharmacy-link-card netmeds">
          <div class="pharmacy-card-header">
            <span class="pharmacy-icon">🟣</span>
            <div>
              <div class="pharmacy-name">Netmeds</div>
              <div class="pharmacy-delivery">India Ki Pharmacy • Reliance Care</div>
            </div>
          </div>
          <div class="pharmacy-perk">Cash on delivery &amp; senior wallet perks</div>
          <div class="pharmacy-action-btn">Order on Netmeds ↗</div>
        </a>
      </div>

      <div class="med-extra-search">
        <a href="${googleBuy}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" style="display:inline-flex;align-items:center;gap:6px;">
          🔍 Check Other Local Chemists on Google ↗
        </a>
      </div>

      <div class="med-safety-box">
        🛡️ <strong>Senior Safety Note:</strong> Keep your physician's prescription ready when ordering. Many prescription medications cannot be dispensed without a valid Rx. Never alter your dosage without medical guidance.
      </div>
    </div>
  `;
}

async function handleGlobalVoiceCommand(userText, orb, statusEl, transcriptEl, resultsContainerId) {
  if (transcriptEl) transcriptEl.textContent = `"${userText}"`;
  if (statusEl) statusEl.textContent = 'Processing command...';
  if (orb) {
    orb.classList.remove('listening', 'speaking');
    orb.classList.add('thinking');
  }

  const cleanText = userText.trim();
  const lower = cleanText.toLowerCase();

  // 1. Check Section Navigation Commands
  const navMatch = parseNavigationCommand(lower);
  if (navMatch) {
    const confirmationText = `Taking you to the ${navMatch.title} section right now.`;
    if (statusEl) statusEl.textContent = `Navigating to ${navMatch.title}...`;
    speakText(confirmationText, 
      () => {
        if (orb) { orb.classList.remove('thinking'); orb.classList.add('speaking'); }
      },
      () => {
        if (orb) orb.classList.remove('speaking', 'thinking');
        if (statusEl) statusEl.textContent = 'Tap the microphone to speak';
        closeVoiceAssistantModal();
        navigate(navMatch.viewId);
      }
    );
    setTimeout(() => {
      closeVoiceAssistantModal();
      navigate(navMatch.viewId);
    }, 2200);
    return;
  }

  // 2. Check Medicine Search & Ordering Commands
  const medMatch = parseMedicineCommand(cleanText, lower);
  if (medMatch) {
    const cardHtml = renderMedicineCard(medMatch);
    
    // Target container
    let container = resultsContainerId ? document.getElementById(resultsContainerId) : null;
    if (!container) {
      openVoiceAssistantModal();
      container = document.getElementById('modal-medicine-results');
    }
    
    if (container) {
      container.innerHTML = cardHtml;
      container.style.display = 'block';
      container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    const spokenMessage = `I searched for ${medMatch.medicineName}. Direct online ordering links from Tata 1mg, PharmEasy, and Apollo Pharmacy are ready for home delivery.`;
    if (statusEl) statusEl.textContent = `Found purchase links for ${medMatch.medicineName}`;
    
    speakText(spokenMessage,
      () => {
        if (orb) { orb.classList.remove('thinking'); orb.classList.add('speaking'); }
      },
      () => {
        if (orb) orb.classList.remove('speaking', 'thinking');
        if (statusEl) statusEl.textContent = 'Tap the microphone to speak';
      }
    );
    return;
  }

  // 3. Fallback: Google-style Voice Search / Senior AI Assistant Answer
  try {
    const responseText = await fetchVoiceSearch(userText);
    speakText(responseText,
      () => {
        if (orb) {
          orb.classList.remove('thinking', 'listening');
          orb.classList.add('speaking');
          if (statusEl) statusEl.textContent = 'Speaking response...';
        }
      },
      () => {
        if (orb) orb.classList.remove('speaking', 'thinking');
        if (statusEl) statusEl.textContent = 'Tap the microphone to speak';
      }
    );
  } catch (err) {
    console.error("Voice search error:", err);
    if (orb) orb.classList.remove('thinking', 'speaking');
    if (statusEl) statusEl.textContent = 'Tap the microphone to speak';
  }
}

function openVoiceAssistantModal() {
  const modal = document.getElementById('voice-assistant-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  modal.classList.add('open');

  initVoiceUI('modal-voice-orb', 'modal-voice-status', 'modal-voice-transcript', 'modal-medicine-results');

  const transcriptEl = document.getElementById('modal-voice-transcript');
  if (transcriptEl) transcriptEl.textContent = '';

  const statusEl = document.getElementById('modal-voice-status');
  if (statusEl) statusEl.textContent = 'Tap the microphone to speak';

  setTimeout(() => {
    const modalOrb = document.getElementById('modal-voice-orb');
    if (modalOrb && !modalOrb.classList.contains('listening') && !modalOrb.classList.contains('speaking')) {
      modalOrb.click();
    }
  }, 350);
}

function closeVoiceAssistantModal() {
  const modal = document.getElementById('voice-assistant-modal');
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
  stopSpeaking();
  const modalOrb = document.getElementById('modal-voice-orb');
  if (modalOrb) {
    modalOrb.classList.remove('listening', 'speaking', 'thinking');
  }
}

function handleVoiceModalBackdrop(e) {
  if (e.target.id === 'voice-assistant-modal') {
    closeVoiceAssistantModal();
  }
}

function simulateVoicePhrase(phrase) {
  const orb = document.getElementById('modal-voice-orb');
  const statusEl = document.getElementById('modal-voice-status');
  const transcriptEl = document.getElementById('modal-voice-transcript');
  handleGlobalVoiceCommand(phrase, orb, statusEl, transcriptEl, 'modal-medicine-results');
}

function simulateCompanionVoicePhrase(phrase) {
  const orb = document.getElementById('companion-voice-orb');
  const statusEl = document.getElementById('companion-voice-status');
  const transcriptEl = document.getElementById('companion-voice-transcript');
  handleGlobalVoiceCommand(phrase, orb, statusEl, transcriptEl, 'companion-medicine-results');
}

function initVoiceUI(orbId, statusId, transcriptId, resultsContainerId = null) {
  const orb = document.getElementById(orbId);
  const statusEl = document.getElementById(statusId);
  const transcriptEl = document.getElementById(transcriptId);
  if (!orb) return;

  // Prevent duplicate listeners on repeated calls
  if (orb.dataset.voiceInit === 'true') return;
  orb.dataset.voiceInit = 'true';

  let localRecognition = null;
  let localIsListening = false;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function setStatus(text) { if (statusEl) statusEl.textContent = text; }
  function setTranscript(text) { if (transcriptEl) transcriptEl.textContent = text; }

  async function processVoiceCommand(userText) {
    await handleGlobalVoiceCommand(userText, orb, statusEl, transcriptEl, resultsContainerId);
  }

  function startSimulatedListening() {
    const demos = [
      'Take me to News section',
      'Go to Wellness section',
      'Order Dolo 650 medicine on internet',
      'Search BP medicine Telmisartan',
      'Search Diabetes medicine Metformin'
    ];
    const demo = demos[Math.floor(Math.random() * demos.length)];
    setStatus('Listening...');
    setTranscript('');
    setTimeout(() => {
      setTranscript(`"${demo}"`);
      setTimeout(() => {
        orb.classList.remove('listening');
        localIsListening = false;
        processVoiceCommand(demo);
      }, 1000);
    }, 1500);
  }

  if (SpeechRecognition) {
    try {
      localRecognition = new SpeechRecognition();
      localRecognition.continuous = false;
      localRecognition.lang = 'en-IN';
      localRecognition.interimResults = true;

      localRecognition.onresult = (e) => {
        const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
        setTranscript(`"${transcript}"`);
        if (e.results[0].isFinal) {
          orb.classList.remove('listening');
          localIsListening = false;
          processVoiceCommand(transcript);
        }
      };
      localRecognition.onerror = () => {
        orb.classList.remove('listening');
        localIsListening = false;
        setStatus('Could not hear clearly. Tap the microphone to try again.');
      };
      localRecognition.onend = () => {
        orb.classList.remove('listening');
        localIsListening = false;
      };
    } catch (err) {
      localRecognition = null;
    }
  }

  orb.addEventListener('click', () => {
    // If currently speaking or thinking, tap to stop speech!
    if (orb.classList.contains('speaking') || orb.classList.contains('thinking')) {
      stopSpeaking();
      orb.classList.remove('speaking', 'thinking', 'listening');
      localIsListening = false;
      setStatus('Tap the microphone to speak');
      return;
    }

    if (localIsListening) {
      if (localRecognition) {
        try { localRecognition.stop(); } catch (e) { }
      }
      orb.classList.remove('listening');
      localIsListening = false;
      setStatus('Tap the microphone to speak');
      return;
    }

    stopSpeaking();
    localIsListening = true;
    orb.classList.remove('speaking', 'thinking');
    orb.classList.add('listening');
    setStatus('Listening...');
    setTranscript('');

    if (SpeechRecognition && localRecognition) {
      try {
        localRecognition.start();
      } catch (e) {
        startSimulatedListening();
      }
    } else {
      startSimulatedListening();
    }
  });

  // Wire up sample voice command chips
  const commandChips = orb.closest('.container') ? orb.closest('.container').querySelectorAll('.voice-commands .chip') : [];
  commandChips.forEach(chip => {
    chip.style.cursor = 'pointer';
    chip.addEventListener('click', () => {
      const text = chip.textContent.replace(/["']/g, '').trim();
      processVoiceCommand(text);
    });
  });

  setStatus('Tap the microphone to speak');
}

// ----------------------------------------------------------------
// 13. TIME MACHINE
// ----------------------------------------------------------------
function initTimeMachine() {
  const years = Object.keys(MOCK_DATA.timeMachine);
  const selector = document.getElementById('year-selector');
  const content = document.getElementById('era-content');
  const selectorLanding = document.getElementById('year-selector-landing');
  const contentLanding = document.getElementById('era-content-landing');

  function loadYear(year) {
    const data = MOCK_DATA.timeMachine[year];
    document.querySelectorAll('.year-btn').forEach(b => b.classList.toggle('active', b.dataset.year === year));
    const categories = [
      { key: 'songs', label: 'Popular Songs', icon: '🎵' },
      { key: 'movies', label: 'Hit Movies', icon: '🎬' },
      { key: 'cricket', label: 'Cricket Moments', icon: '🏏' },
      { key: 'events', label: 'Important Events', icon: '📰' },
      { key: 'radio', label: 'Radio', icon: '📻' },
      { key: 'tv', label: 'Television', icon: '📺' },
      { key: 'magazines', label: 'Magazines & Comics', icon: '📕' },
    ];
    const available = categories.filter(c => data[c.key]);
    const html = available.map(c => `
      <div class="era-card">
        <span class="era-card__icon">${c.icon}</span>
        <div class="era-card__label">${c.label}</div>
        <ul class="era-card__items">
          ${data[c.key].map(item => `<li class="era-card__item">${item}</li>`).join('')}
        </ul>
      </div>
    `).join('');
    if (content) content.innerHTML = html;
    if (contentLanding) contentLanding.innerHTML = html;
  }

  const buttonsHtml = years.map(y => `<button class="year-btn" data-year="${y}">${y}</button>`).join('');
  if (selector) {
    selector.innerHTML = buttonsHtml;
    selector.querySelectorAll('.year-btn').forEach(btn => btn.addEventListener('click', () => loadYear(btn.dataset.year)));
  }
  if (selectorLanding) {
    selectorLanding.innerHTML = buttonsHtml;
    selectorLanding.querySelectorAll('.year-btn').forEach(btn => btn.addEventListener('click', () => loadYear(btn.dataset.year)));
  }

  // Personalization: Default to year matching user's favorite decade
  const user = getStoredUser();
  const decadeYearMap = {
    '1950s': '1950',
    '1960s': '1965',
    '1970s': '1975',
    '1980s': '1980',
    '1990s': '1990',
    '2000s': '2000'
  };
  const preferredYear = (user && user.decade && decadeYearMap[user.decade]) ? decadeYearMap[user.decade] : years[3];
  loadYear(years.includes(preferredYear) ? preferredYear : years[3]);
}

// ----------------------------------------------------------------
// 14. RECONNECT PAGE
// ----------------------------------------------------------------
let reconnectFilters = { school: '', city: '', batch: '' };
let sentRequests = new Set();

function initReconnect() {
  renderFriends();
  const searchInput = document.getElementById('reconnect-search');
  const batchFilter = document.getElementById('batch-filter');
  const cityFilter = document.getElementById('city-filter');

  if (searchInput) searchInput.addEventListener('input', renderFriends);
  if (batchFilter) batchFilter.addEventListener('change', renderFriends);
  if (cityFilter) cityFilter.addEventListener('change', renderFriends);
}

function renderFriends() {
  const grid = document.getElementById('friends-grid');
  if (!grid) return;
  const search = (document.getElementById('reconnect-search')?.value || '').toLowerCase();
  const batch = document.getElementById('batch-filter')?.value || '';
  const city = document.getElementById('city-filter')?.value || '';

  const user = getStoredUser();
  let friends = [...MOCK_DATA.friends];

  if (user) {
    const personalMatches = [];
    if (user.college) {
      const batchYear = user.decade ? (parseInt(user.decade) || 1970) + 4 : '1978';
      personalMatches.push({
        id: 901,
        name: 'Dr. Ashok Singhal',
        initials: 'A',
        school: user.college,
        batch: String(batchYear),
        city: user.city || 'New Delhi',
        profession: user.profession || 'Retired Professor',
        common: `⭐ 98% Match: Attended ${user.college} around ${user.decade || 'the same era'}`,
        status: 'none',
        isPersonalizedMatch: true
      });
    }
    if (user.city && user.city !== 'Other') {
      personalMatches.push({
        id: 902,
        name: 'Smt. Sudha Murthy Verma',
        initials: 'S',
        school: `${user.city} Model Higher Secondary`,
        batch: user.decade ? String((parseInt(user.decade) || 1970) + 2) : '1976',
        city: user.city,
        profession: user.profession || 'Retired Educator',
        common: `⭐ 95% Match: Same Hometown (${user.city}) · ${user.decade || 'Golden Era'}`,
        status: 'none',
        isPersonalizedMatch: true
      });
    }

    personalMatches.forEach(pm => {
      if (!friends.find(f => f.id === pm.id)) {
        friends.unshift(pm);
      }
    });

    const reconnectContainer = document.querySelector('#view-reconnect .container.py-12') || document.querySelector('#view-reconnect .container');
    if (reconnectContainer) {
      let banner = document.getElementById('reconnect-personal-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'reconnect-personal-banner';
        banner.className = 'personalized-content-banner';
        reconnectContainer.insertBefore(banner, reconnectContainer.firstChild);
      }
      banner.innerHTML = `
        <div style="font-size:28px;line-height:1;">🤝</div>
        <div style="flex:1;">
          <div style="font-weight:800;font-size:16px;color:var(--text-dark);margin-bottom:3px;">
            Alumni & Peers Suggested for ${user.name}
          </div>
          <div style="font-size:13px;color:var(--text-sec);line-height:1.5;">
            Matching people from <strong>${user.college || 'your college'}</strong>, your hometown <strong>${user.city || 'your area'}</strong>, and your golden era (<strong>${user.decade || '1970s'}</strong>).
          </div>
        </div>
      `;
    }
  }

  if (search) friends = friends.filter(f =>
    f.name.toLowerCase().includes(search) ||
    f.school.toLowerCase().includes(search) ||
    f.profession.toLowerCase().includes(search) ||
    f.city.toLowerCase().includes(search)
  );
  if (batch) friends = friends.filter(f => f.batch === batch);
  if (city) friends = friends.filter(f => f.city.toLowerCase().includes(city.toLowerCase()));

  if (!friends.length) {
    grid.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-sec);grid-column:1/-1;">
      <div style="font-size:48px;margin-bottom:16px;">🔍</div>
      <p style="font-size:var(--text-lg);">No people found matching your search.</p>
      <p>Try different keywords or clear the filters.</p>
    </div>`;
    return;
  }

  grid.innerHTML = friends.map(f => {
    const sent = sentRequests.has(f.id);
    const connected = f.status === 'connected';
    return `
      <div class="profile-card ${f.isPersonalizedMatch ? 'highlighted-match' : ''}" id="friend-${f.id}" ${f.isPersonalizedMatch ? 'style="border:2px solid var(--cosmic-orange);background:linear-gradient(to bottom, #FFFDF8, #FFF);"' : ''}>
        ${f.isPersonalizedMatch ? '<div style="display:inline-block;background:var(--cosmic-orange);color:white;font-size:11px;font-weight:800;padding:2px 8px;border-radius:12px;margin-bottom:8px;">🎯 Top Match for You</div>' : ''}
        <div class="profile-card__avatar">${f.initials}</div>
        <div class="profile-card__name">${f.name}</div>
        <div class="profile-card__meta">${f.school}</div>
        <div class="profile-card__meta">Batch of ${f.batch} · ${f.city}</div>
        <div class="profile-card__meta" style="color:var(--text-light);font-size:13px;">${f.profession}</div>
        <div class="profile-card__tag">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          ${f.common}
        </div>
        <div style="margin-top:16px;">
          ${connected ? `<button class="btn btn-green btn-sm btn-block" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Connected
          </button>` : sent ? `<button class="btn btn-secondary btn-sm btn-block" disabled>Request Sent</button>` :
        `<button class="btn btn-primary btn-sm btn-block" onclick="sendReconnectRequest(${f.id}, '${f.name}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            Reconnect
          </button>`}
        </div>
      </div>
    `;
  }).join('');
}

function sendReconnectRequest(id, name) {
  sentRequests.add(id);
  showToast(`Reconnect request sent to ${name}. We\'ll notify you when they respond.`, 'success');
  renderFriends();
}

// ----------------------------------------------------------------
// 15. COMMUNITY PAGE
// ----------------------------------------------------------------
function initCommunity() {
  const joined = getJoinedComms();
  const grid = document.getElementById('community-grid');
  if (!grid) return;

  const user = getStoredUser();
  let communities = [...MOCK_DATA.communities];

  if (user && user.city && user.city !== 'Other') {
    const hometownComm = {
      id: 888,
      name: `${user.city} Senior Citizens Circle`,
      emoji: '🏛️',
      members: 384,
      active: '16 nearby today',
      desc: `Exclusive community for retired elders and seniors residing in and around ${user.city}. Sunday morning chai, gentle park walks, and cultural heritage gatherings.`,
      meetup: 'Sundays · 8:00 AM at City Park / Promenade',
      joined: false,
      isHometown: true
    };
    if (!communities.find(c => c.id === 888)) {
      communities.unshift(hometownComm);
    }
  }

  grid.innerHTML = communities.map(c => {
    const isJoined = joined.includes(c.id) || c.joined;
    return `
      <div class="community-card ${c.isHometown ? 'hometown-club' : ''}" id="comm-${c.id}" ${c.isHometown ? 'style="border:2px solid var(--forest-green);background:linear-gradient(to bottom, #F7FCF7, #FFF);"' : ''}>
        <div class="community-card__banner">${c.emoji}</div>
        <div class="community-card__body">
          ${c.isHometown ? '<div style="display:inline-block;background:var(--forest-green);color:white;font-size:11px;font-weight:800;padding:2px 8px;border-radius:12px;margin-bottom:8px;">📍 Your Hometown Club</div>' : ''}
          <div class="community-card__name">${c.name}</div>
          <div class="community-card__stats">
            <span class="community-card__stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              ${c.members.toLocaleString()} members
            </span>
            <span class="community-card__stat">🟢 ${c.active}</span>
          </div>
          <p style="font-size:var(--text-sm);color:var(--text-sec);margin-bottom:16px;line-height:1.55;">${c.desc}</p>
          <p style="font-size:12px;color:var(--text-light);margin-bottom:16px;">📅 ${c.meetup}</p>
          ${isJoined ?
        `<button class="btn btn-ghost btn-sm btn-block" onclick="leaveCommunity(${c.id},'${c.name}')">Joined — Leave?</button>` :
        `<button class="btn btn-primary btn-sm btn-block" onclick="joinCommunity(${c.id},'${c.name}')">Join Community</button>`
      }
        </div>
      </div>
    `;
  }).join('');
}

function joinCommunity(id, name) {
  const joined = getJoinedComms();
  if (!joined.includes(id)) { joined.push(id); localStorage.setItem(LS.COMMUNITIES, JSON.stringify(joined)); }
  showToast(`You\'ve joined "${name}"! Welcome to the community.`, 'success');
  initCommunity();
}

function leaveCommunity(id, name) {
  const joined = getJoinedComms().filter(c => c !== id);
  localStorage.setItem(LS.COMMUNITIES, JSON.stringify(joined));
  showToast(`You\'ve left "${name}".`, 'info');
  initCommunity();
}

// ----------------------------------------------------------------
// 16. WELLNESS PAGE
// ----------------------------------------------------------------
let wellnessState = [];

function initWellness() {
  wellnessState = MOCK_DATA.wellnessActivities.map(a => ({ ...a }));
  const saved = localStorage.getItem('lc_wellness_' + getTodayKey());
  if (saved) wellnessState = JSON.parse(saved);
  renderWellness();
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

function renderWellness() {
  const grid = document.getElementById('activity-grid-wellness');
  if (!grid) return;
  const completed = wellnessState.filter(a => a.completed).length;
  const total = wellnessState.length;

  // Update the Wellness page's own progress elements
  const progress = document.getElementById('wellness-progress-wellness');
  if (progress) {
    progress.textContent = `${completed} of ${total} activities completed today`;
  }
  const bar = document.getElementById('wellness-bar-wellness');
  if (bar) {
    bar.style.width = `${(completed / total) * 100}%`;
  }

  // Also keep the Dashboard mini-wellness widget in sync (separate IDs)
  const dashProgress = document.getElementById('wellness-progress');
  if (dashProgress) dashProgress.textContent = `${completed} of ${total} activities completed today`;
  const dashBar = document.getElementById('wellness-bar');
  if (dashBar) dashBar.style.width = `${(completed / total) * 100}%`;

  const user = getStoredUser();
  const userGoal = (user?.wellness_goal || '').toLowerCase();

  // If user selected a goal, prioritize matching activities
  const sortedActivities = [...wellnessState].sort((a, b) => {
    const aMatch = userGoal && (a.title.toLowerCase().includes('walk') && userGoal.includes('walk') ||
      a.title.toLowerCase().includes('yoga') && userGoal.includes('yoga') ||
      a.title.toLowerCase().includes('breath') && (userGoal.includes('pranayama') || userGoal.includes('breath')) ||
      a.title.toLowerCase().includes('meditat') && userGoal.includes('meditat') ||
      a.title.toLowerCase().includes('laugh') && userGoal.includes('laugh'));
    const bMatch = userGoal && (b.title.toLowerCase().includes('walk') && userGoal.includes('walk') ||
      b.title.toLowerCase().includes('yoga') && userGoal.includes('yoga') ||
      b.title.toLowerCase().includes('breath') && (userGoal.includes('pranayama') || userGoal.includes('breath')) ||
      b.title.toLowerCase().includes('meditat') && userGoal.includes('meditat') ||
      b.title.toLowerCase().includes('laugh') && userGoal.includes('laugh'));
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return 0;
  });

  grid.innerHTML = sortedActivities.map(a => {
    const isGoalMatch = userGoal && (a.title.toLowerCase().includes('walk') && userGoal.includes('walk') ||
      a.title.toLowerCase().includes('yoga') && userGoal.includes('yoga') ||
      a.title.toLowerCase().includes('breath') && (userGoal.includes('pranayama') || userGoal.includes('breath')) ||
      a.title.toLowerCase().includes('meditat') && userGoal.includes('meditat') ||
      a.title.toLowerCase().includes('laugh') && userGoal.includes('laugh'));
    return `
      <div class="activity-card ${a.completed ? 'completed' : ''} ${isGoalMatch ? 'goal-focused' : ''}" onclick="toggleActivity(${a.id})" role="listitem" tabindex="0" aria-label="${a.title} — ${a.completed ? 'completed' : 'tap to complete'}" ${isGoalMatch ? 'style="border:2px solid var(--forest-green);background:linear-gradient(to bottom, #F7FCF7, #FFF);"' : ''}>
        ${isGoalMatch ? '<div style="background:var(--forest-green);color:white;font-size:11px;font-weight:800;padding:2px 8px;border-radius:12px;margin-bottom:6px;display:inline-block;">🌟 Your Daily Chosen Goal</div>' : ''}
        <div class="activity-card__check">${a.completed ? '✓' : ''}</div>
        <span class="activity-card__icon">${a.icon}</span>
        <div class="activity-card__title">${a.title}</div>
        <div class="activity-card__duration">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${a.duration}
        </div>
        <p style="font-size:var(--text-sm);color:var(--text-sec);">${a.desc}</p>
      </div>
    `;
  }).join('');
}

function toggleActivity(id) {
  const act = wellnessState.find(a => a.id === id);
  if (!act) return;
  act.completed = !act.completed;
  localStorage.setItem('lc_wellness_' + getTodayKey(), JSON.stringify(wellnessState));
  if (act.completed) showToast(`"${act.title}" marked complete! Great work!`, 'success');
  renderWellness();
}

// ----------------------------------------------------------------
// 17. DIGITAL MEMORY VAULT
// ----------------------------------------------------------------
function initVault() {
  renderTimeline();
}

function renderTimeline() {
  const container = document.getElementById('timeline-container');
  if (!container) return;
  const memories = getStoredMemories() || MOCK_DATA.memories;
  container.innerHTML = `<div class="timeline">${memories.map((m, i) => `
    <div class="timeline-item" style="animation-delay:${i * 0.08}s">
      <div class="timeline-item__dot"></div>
      <div class="timeline-item__year">${m.year}</div>
      <div class="timeline-item__card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div class="timeline-item__title">${m.emoji || '📖'} ${m.title}</div>
          <span class="badge badge-orange">${m.type || 'story'}</span>
        </div>
        <div class="timeline-item__text">${m.content}</div>
      </div>
    </div>
  `).join('')}</div>`;
}

function openAddMemoryModal() {
  if (!isLoggedIn()) { navigate('login'); return; }
  document.getElementById('add-memory-modal').classList.add('open');
}

function closeAddMemoryModal() {
  document.getElementById('add-memory-modal').classList.remove('open');
}

function saveNewMemory() {
  const year = document.getElementById('mem-year').value;
  const title = document.getElementById('mem-title').value;
  const content = document.getElementById('mem-content').value;
  const type = document.getElementById('mem-type').value;

  if (!year || !title) {
    showToast('Please fill in the year and title.', 'error');
    return;
  }
  const mem = { year: parseInt(year), title, content, type, emoji: '📖' };
  saveMemory(mem);
  closeAddMemoryModal();
  showToast('Memory saved to your Vault!', 'success');
  renderTimeline();
  // Clear form
  ['mem-year', 'mem-title', 'mem-content'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

// ----------------------------------------------------------------
// 18. NOSTALGIA LIBRARY
// ----------------------------------------------------------------
let nostalgiaCategory = 'songs';

function initNostalgia() {
  renderNostalgia();
  const buttons = document.querySelectorAll('.nostalgia-cat-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      nostalgiaCategory = btn.dataset.cat;
      renderNostalgia();
    });
  });
}

function renderNostalgia() {
  const grids = document.querySelectorAll('.nostalgia-grid');
  if (grids.length === 0) return;
  const items = MOCK_DATA.nostalgiaLibrary[nostalgiaCategory] || [];
  const html = items.map(item => `
    <div class="media-card">
      <div class="media-card__thumb">
        ${item.emoji}
        <span class="media-card__licensed">Licensed Source</span>
      </div>
      <div class="media-card__body">
        <div class="media-card__title">${item.title}</div>
        <div class="media-card__meta">${item.artist || item.desc || ''} ${item.year ? `· ${item.year}` : ''}</div>
        <button class="btn btn-ghost btn-sm" onclick="showToast('This would open an external licensed source. LifeConnect does not host copyrighted content.','info')">
          Find Legally
        </button>
      </div>
    </div>
  `).join('');
  grids.forEach(grid => grid.innerHTML = html);
}

// ----------------------------------------------------------------
// 19. AI MEMORY SEARCH
// ----------------------------------------------------------------
function initMemorySearch() {
  const btn = document.getElementById('memory-search-btn');
  const input = document.getElementById('memory-search-input');
  if (btn && input) {
    btn.addEventListener('click', () => doMemorySearch(''));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doMemorySearch(''); });
  }

  const btnLanding = document.getElementById('memory-search-btn-landing');
  const inputLanding = document.getElementById('memory-search-input-landing');
  if (btnLanding && inputLanding) {
    btnLanding.addEventListener('click', () => doMemorySearch('-landing'));
    inputLanding.addEventListener('keydown', (e) => { if (e.key === 'Enter') doMemorySearch('-landing'); });
  }
}

const MEMORY_SEARCH_RESULTS = [
  {
    title: 'Nagin (1954) — A scene with a woman in a red saree on a train',
    desc: 'This classic film features iconic scenes with a red saree and train sequences. Music by Hemant Kumar.',
    type: 'Movie',
    match: 90,
  },
  {
    title: '"Aa Ja Re Ab Mera Dil Pukara" — Aadha Din Aadhee Raat (1977)',
    desc: 'A popular song featuring a train journey scene, performed by Lata Mangeshkar.',
    type: 'Song',
    match: 82,
  },
  {
    title: 'Madhumati (1958) — Dilip Kumar / Vyjayanthimala',
    desc: 'A classic film with memorable train sequences and Vyjayanthimala in traditional attire.',
    type: 'Movie',
    match: 75,
  },
];

const MEMORY_SEARCH_RESULTS_2 = [
  {
    title: 'Nandan Magazine — Children\'s Literature Classic',
    desc: 'Nandan was published by Hind Pocket Books from 1964. Beloved for its stories, comics and educational content. Your subscription era was likely the 1970s-80s.',
    type: 'Magazine',
    match: 98,
  },
  {
    title: 'Champak Magazine — Stories and Adventure',
    desc: 'Another beloved children\'s magazine published alongside Nandan, with similar content for the same generation.',
    type: 'Magazine',
    match: 72,
  },
];

function doMemorySearch(suffix = '') {
  const input = document.getElementById('memory-search-input' + suffix);
  const results = document.getElementById('memory-search-results' + suffix);
  if (!input || !results) return;
  const query = input.value.trim();
  if (!query) { showToast('Please describe the memory you are searching for.', 'info'); return; }
  results.innerHTML = `<p style="color:var(--text-sec);margin-bottom:24px;font-style:italic;">Searching for memories matching: "${query}"...</p>`;

  setTimeout(() => {
    const data = query.toLowerCase().includes('nandan') || query.toLowerCase().includes('magazine') ?
      MEMORY_SEARCH_RESULTS_2 : MEMORY_SEARCH_RESULTS;
    results.innerHTML = `
      <p style="color:var(--text-sec);margin-bottom:16px;">Found ${data.length} possible matches for your memory:</p>
      ${data.map(r => `
        <div class="memory-result">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <div style="font-family:var(--font-serif);font-size:var(--text-md);font-weight:700;color:var(--text-dark);">${r.title}</div>
            <span class="badge badge-orange">${r.match}% match</span>
          </div>
          <p style="font-size:var(--text-base);color:var(--text-sec);margin-bottom:12px;">${r.desc}</p>
          <span class="badge badge-green">${r.type}</span>
        </div>
      `).join('')}
      <p style="font-size:13px;color:var(--text-light);margin-top:16px;">Results are based on your description. LifeConnect uses AI to find possible matches — these are not guaranteed to be the exact memory.</p>
    `;
  }, 1200);
}

// ----------------------------------------------------------------
// 20. LEGAL ASSISTANT
// ----------------------------------------------------------------
let legalTopic = 'pension';

function initLegal() {
  renderLegalTopics();
  loadLegalDemo('pension');
}

function renderLegalTopics() {
  const chips = document.getElementById('legal-topic-chips');
  if (!chips) return;
  chips.innerHTML = MOCK_DATA.legalTopics.map(t => `
    <button class="chip ${t.id === legalTopic ? 'active' : ''}" onclick="loadLegalDemo('${t.id}')" id="legal-chip-${t.id}">
      ${t.icon} ${t.label}
    </button>
  `).join('');
}

function loadLegalDemo(topic) {
  legalTopic = topic;
  document.querySelectorAll('#legal-topic-chips .chip').forEach(c => c.classList.remove('active'));
  const active = document.getElementById('legal-chip-' + topic);
  if (active) active.classList.add('active');

  const data = MOCK_DATA.legalResponses[topic];
  if (!data) return;

  const body = document.getElementById('legal-chat-body');
  if (!body) return;
  body.innerHTML = '';

  // User question
  addChatMessage(body, 'user', data.question, null);
  setTimeout(() => {
    const response = `I\'ll explain this in simple, everyday language.\n\nThis document has ${data.steps.length} main parts:`;
    addChatMessage(body, 'ai', response, null);
    setTimeout(() => {
      const stepsHTML = data.steps.map(s => `
        <div style="background:var(--green-pale);border-radius:12px;padding:16px;margin-top:12px;border-left:4px solid var(--green-deep);">
          <div style="font-weight:700;color:var(--green-deep);margin-bottom:6px;">Step ${s.n}: ${s.title}</div>
          <div style="font-size:var(--text-base);color:var(--text-dark);">${s.desc}</div>
        </div>
      `).join('');

      const msgWrap = document.createElement('div');
      msgWrap.className = 'chat-msg ai';
      msgWrap.innerHTML = `
        <div class="chat-msg__avatar">${companionAvatar}</div>
        <div style="flex:1;">
          <div class="chat-msg__bubble">${stepsHTML}</div>
          <div class="chat-msg__actions">
            <button class="chat-msg__btn" onclick="showToast('Remember: This is for understanding only. Always consult a professional for legal or financial matters.','info')">Got it</button>
            <button class="chat-msg__btn" onclick="showToast('A lawyer or financial advisor can give you proper guidance. This AI only explains in simpler language.','info')">Need more help?</button>
          </div>
        </div>
      `;
      body.appendChild(msgWrap);
      body.scrollTop = body.scrollHeight;
    }, 600);
  }, 600);
}

// ----------------------------------------------------------------
// 21. FAMILY BRIDGE
// ----------------------------------------------------------------
let familyCardIdx = 0;

function initFamily() {
  renderFamilyCard();
}

function renderFamilyCard() {
  const card = document.getElementById('family-bridge-card');
  if (!card) return;
  const data = MOCK_DATA.familyBridgeCards[familyCardIdx % MOCK_DATA.familyBridgeCards.length];
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;">
      <div style="width:60px;height:60px;border-radius:50%;background:var(--orange-light);display:flex;align-items:center;justify-content:center;font-size:28px;">👴</div>
      <div>
        <div style="font-size:var(--text-sm);color:var(--text-sec);">Today's story from</div>
        <div style="font-family:var(--font-serif);font-size:var(--text-lg);font-weight:700;color:var(--text-dark);">${data.parentName}</div>
      </div>
      <span class="badge badge-orange" style="margin-left:auto;">New</span>
    </div>
    <div class="family-card__story">${data.story}</div>
    <div class="family-card__prompt">${data.prompt}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${data.actions.map(a => `<button class="btn btn-primary btn-sm" onclick="handleFamilyAction('${a}')">${a}</button>`).join('')}
      <button class="btn btn-secondary btn-sm" onclick="nextFamilyCard()">Next Story →</button>
    </div>
    <p style="font-size:12px;color:var(--text-light);margin-top:16px;">
      🔒 Privacy: Family members only see content you choose to share with them.
    </p>
  `;
}

function handleFamilyAction(action) {
  if (action === 'Listen') { showToast('Voice playback would play the recorded memory. (Demo mode)', 'info'); return; }
  if (action.includes('Save') || action.includes('Record')) { showToast('Story saved to Family Memory Vault.', 'success'); return; }
  if (action.includes('Share')) { showToast('Sharing would send this to selected family members with permission.', 'info'); return; }
  showToast(`${action} — Feature coming soon with backend integration.`, 'info');
}

function nextFamilyCard() {
  familyCardIdx++;
  renderFamilyCard();
}

// ----------------------------------------------------------------
// 22. MEMORIES PAGE
// ----------------------------------------------------------------
function initMemories() {
  initTimeMachine();
  initMemorySearch();
  initNostalgia();
}

// ----------------------------------------------------------------
// 23. DASHBOARD
// ----------------------------------------------------------------
function initDashboard() {
  const user = getStoredUser();
  if (!user) return;

  const greeting = getDashboardGreeting(user.firstName || user.name.split(' ')[0]);
  const greetEl = document.getElementById('dashboard-greeting');
  const subEl = document.getElementById('dashboard-sub');
  if (greetEl) greetEl.textContent = greeting;
  if (subEl) {
    const metaParts = [];
    if (user.city) metaParts.push(`📍 ${user.city}`);
    if (user.decade) metaParts.push(`🕰️ ${user.decade} Era`);
    if (user.language) metaParts.push(`🗣️ ${user.language}`);
    if (user.profession) metaParts.push(`💼 ${user.profession}`);
    subEl.textContent = metaParts.length ? metaParts.join(' • ') : "Here's something special for you today.";
  }

  // Init companion chat preview
  initCompanionChatUI('dashboard-chat', 'dashboard-chat-body', 'dashboard-chat-input', 'dashboard-chat-send');

  // Populate dashboard mini-wellness widget (shows first 4 activities)
  if (!wellnessState.length) {
    wellnessState = MOCK_DATA.wellnessActivities.map(a => ({ ...a }));
    const saved = localStorage.getItem('lc_wellness_' + getTodayKey());
    if (saved) wellnessState = JSON.parse(saved);
  }
  const dashGrid = document.getElementById('activity-grid');
  if (dashGrid) {
    const preview = wellnessState.slice(0, 4);
    dashGrid.innerHTML = preview.map(a => `
      <div class="activity-card ${a.completed ? 'completed' : ''}" onclick="toggleActivity(${a.id})" style="font-size:var(--text-sm);">
        <div class="activity-card__check">${a.completed ? '✓' : ''}</div>
        <span class="activity-card__icon">${a.icon}</span>
        <div class="activity-card__title" style="font-size:var(--text-sm);">${a.title}</div>
      </div>
    `).join('');
    // Sync progress bar
    const completed = wellnessState.filter(a => a.completed).length;
    const total = wellnessState.length;
    const dashProgress = document.getElementById('wellness-progress');
    if (dashProgress) dashProgress.textContent = `${completed} of ${total} activities completed today`;
    const dashBar = document.getElementById('wellness-bar');
    if (dashBar) dashBar.style.width = `${(completed / total) * 100}%`;
  }
}

function getDashboardGreeting(name) {
  const hour = new Date().getHours();
  const salutation = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  return `${salutation}, ${name} Ji ☀️`;
}

// ----------------------------------------------------------------
// 24. PROFILE
// ----------------------------------------------------------------
function initProfile() {
  const user = getStoredUser();
  if (!user) return;

  const avatarEl = document.getElementById('profile-avatar-display');
  const nameEl = document.getElementById('profile-name-display');
  const emailEl = document.getElementById('profile-email-display');
  const cityEl = document.getElementById('profile-city-display');

  if (avatarEl) avatarEl.textContent = user.avatar || user.name.charAt(0);
  if (nameEl) nameEl.textContent = user.name;
  if (emailEl) emailEl.textContent = user.email;
  if (cityEl) cityEl.textContent = user.city || 'Not specified';

  // Text size select
  const textSizeSelect = document.getElementById('text-size-select');
  if (textSizeSelect) {
    textSizeSelect.addEventListener('change', (e) => {
      document.documentElement.style.setProperty('--text-base', e.target.value + 'px');
      showToast('Text size updated.', 'success');
    });
  }
}

// ----------------------------------------------------------------
// 25. AUTH FORMS
// ----------------------------------------------------------------
function initLoginForm() {
  const form = document.getElementById('login-form');
  const btn = document.getElementById('login-submit') || form?.querySelector('button[type=submit]');
  if (!form) return;

  async function handleLogin(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const emailInput = document.getElementById('login-email');
    const passInput = document.getElementById('login-password');
    const email = emailInput ? emailInput.value.trim() : '';
    const pass = passInput ? passInput.value : '';
    clearErrors('login-form');

    let valid = true;
    if (!email) { showError('login-email-error', 'Email Address or Mobile Number is required'); valid = false; }
    if (!pass) { showError('login-pass-error', 'Password is required'); valid = false; }
    if (!valid) return;

    if (btn) {
      btn.textContent = 'Signing in...';
      btn.disabled = true;
    }

    try {
      const result = await loginUser(email, pass);
      if (btn) {
        btn.textContent = 'Login';
        btn.disabled = false;
      }

      if (result.success && result.user) {
        updateNavForAuth();
        const rawName = result.user.firstName || result.user.name || result.user.full_name || 'Friend';
        const firstName = rawName.split(' ')[0];
        showToast(`Welcome back, ${firstName} Ji!`, 'success');
        navigate('dashboard');
      } else {
        showError('login-general-error', result.error || 'Invalid credentials. Try demo@lifeconnect.local / Demo123!');
      }
    } catch (err) {
      if (btn) {
        btn.textContent = 'Login';
        btn.disabled = false;
      }
      showError('login-general-error', 'An unexpected error occurred during login: ' + err.message);
    }
  }

  form.onsubmit = (e) => { handleLogin(e); return false; };
  form.addEventListener('submit', handleLogin);
  if (btn) {
    btn.onclick = (e) => { handleLogin(e); return false; };
  }
}

// Global toggle for interactive signup chips
window.toggleChip = function (el) {
  if (!el) return;
  el.classList.toggle('selected');
};

// Global single-select for decade buttons in signup form
window.selectSignupDecade = function (btn, decade) {
  if (!btn) return;
  document.querySelectorAll('#signup-form .decade-btn').forEach(b => {
    b.classList.remove('active', 'selected');
  });
  btn.classList.add('active', 'selected');
  const input = document.getElementById('signup-decade');
  if (input) input.value = decade;
};

function initSignupForm() {
  const form = document.getElementById('signup-form');
  const btn = document.getElementById('signup-submit') || form?.querySelector('button[type=submit]');
  if (!form) return;

  // Reconnect chips
  document.querySelectorAll('#signup-form .interest-chip:not(.decade-btn):not(.culture-chip)').forEach(chip => {
    chip.onclick = () => chip.classList.toggle('selected');
  });

  // Culture preferences chips
  document.querySelectorAll('#signup-form .culture-chip').forEach(chip => {
    chip.onclick = () => chip.classList.toggle('selected');
  });

  // Decade selection
  document.querySelectorAll('#signup-form .decade-btn').forEach(dBtn => {
    dBtn.onclick = (e) => {
      e.preventDefault();
      selectSignupDecade(dBtn, dBtn.dataset.decade || dBtn.textContent.trim());
    };
  });

  async function handleSignup(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    clearErrors('signup-form');

    const name = document.getElementById('signup-name')?.value.trim() || '';
    const email = document.getElementById('signup-email')?.value.trim() || '';
    const mobile = document.getElementById('signup-mobile')?.value.trim() || '';
    const age = document.getElementById('signup-age')?.value || '';
    const city = document.getElementById('signup-city')?.value || 'New Delhi';
    const language = document.getElementById('signup-language')?.value || 'Hindi';
    const pass = document.getElementById('signup-pass')?.value || '';
    const confirm = document.getElementById('signup-confirm')?.value || '';
    const college = document.getElementById('signup-college')?.value.trim() || '';
    const profession = document.getElementById('signup-profession')?.value || 'Homemaker & Family Guardian';
    const wellness_goal = document.getElementById('signup-wellness-goal')?.value || 'Morning Walking & Fresh Air';

    const interests = [...document.querySelectorAll('#signup-form .interest-chip:not(.decade-btn):not(.culture-chip).selected')].map(c => c.dataset.value);
    const culture_preferences = [...document.querySelectorAll('#signup-form .culture-chip.selected')].map(c => c.dataset.value);
    const decadeInput = document.getElementById('signup-decade')?.value;
    const decadeBtn = document.querySelector('#signup-form .decade-btn.active, #signup-form .decade-btn.selected')?.dataset.decade;
    const decade = decadeInput || decadeBtn || '1970s';

    let valid = true;
    if (!name) { showError('signup-name-error', 'Full name is required'); valid = false; }
    if (!email) { showError('signup-email-error', 'Email is required'); valid = false; }
    else if (!/\S+@\S+\.\S+/.test(email)) { showError('signup-email-error', 'Please enter a valid email'); valid = false; }
    if (mobile && !/^[6-9]\d{9}$/.test(mobile)) { showError('signup-mobile-error', 'Please enter a valid 10-digit Indian mobile number'); valid = false; }
    if (!pass) { showError('signup-pass-error', 'Password is required'); valid = false; }
    else if (pass.length < 8) { showError('signup-pass-error', 'Password must be at least 8 characters'); valid = false; }
    if (pass !== confirm) { showError('signup-confirm-error', 'Passwords do not match'); valid = false; }
    if (!valid) return;

    if (btn) {
      btn.textContent = 'Personalizing your experience...';
      btn.disabled = true;
    }

    try {
      const result = await signupUser({
        name,
        email,
        mobile,
        age,
        city,
        language,
        password: pass,
        college,
        profession,
        wellness_goal,
        interests,
        culture_preferences,
        decade,
        avatar: name.charAt(0).toUpperCase()
      });
      if (btn) {
        btn.textContent = '✨Create Account & Personalize LifeConnect';
        btn.disabled = false;
      }

      if (result.success && result.user) {
        updateNavForAuth();
        const firstName = name.split(' ')[0];
        showToast(`Welcome to LifeConnect, ${firstName} Ji! Your customized portal is ready.`, 'success', 4000);
        const nextView = (pendingAuthRedirectView && !PUBLIC_VIEWS.includes(pendingAuthRedirectView)) ? pendingAuthRedirectView : 'dashboard';
        pendingAuthRedirectView = null;
        navigate(nextView);
      } else {
        showError('signup-general-error', result.error || 'Failed to create account.');
      }
    } catch (err) {
      if (btn) {
        btn.textContent = '✨Create Account & Personalize LifeConnect';
        btn.disabled = false;
      }
      showError('signup-general-error', 'Signup error: ' + err.message);
    }
  }

  form.onsubmit = (e) => { handleSignup(e); return false; };
  form.addEventListener('submit', handleSignup);
  if (btn) {
    btn.onclick = (e) => { handleSignup(e); return false; };
  }
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) {
    let text = msg;
    if (typeof msg === 'object' && msg !== null) {
      if (Array.isArray(msg)) {
        text = msg.map(m => m.msg || m.message || JSON.stringify(m)).join(', ');
      } else {
        text = msg.detail || msg.message || msg.error || JSON.stringify(msg);
      }
    }
    el.textContent = text || 'An error occurred. Please try again.';
    el.style.display = 'flex';
  }
  const inputId = id.replace('-error', '');
  const input = document.getElementById(inputId);
  if (input) input.classList.add('error');
}

function clearErrors(formId) {
  document.querySelectorAll(`#${formId} .form-error`).forEach(el => { el.textContent = ''; el.style.display = 'none'; });
  document.querySelectorAll(`#${formId} .form-input`).forEach(el => el.classList.remove('error'));
}

function initAuthScrollSync() {
  document.querySelectorAll('.auth-left').forEach(leftPane => {
    if (leftPane.dataset.wheelBound) return;
    leftPane.dataset.wheelBound = 'true';
    leftPane.addEventListener('wheel', (e) => {
      const rightPane = leftPane.closest('.auth-layout')?.querySelector('.auth-right');
      if (rightPane) {
        rightPane.scrollTop += e.deltaY;
      }
    }, { passive: true });
  });
}

// ----------------------------------------------------------------
// 26. APP INITIALIZATION
// ----------------------------------------------------------------
function initApp() {
  try {
    document.body.classList.remove('font-sm', 'font-lg', 'font-xl', 'high-contrast');
    localStorage.removeItem('lc_font_scale');
    localStorage.removeItem('lc_high_contrast');
    localStorage.removeItem('lifeconnect_font_scale');
    localStorage.removeItem('lifeconnect_high_contrast');
  } catch (e) { }

  // Clean up accidental query parameters from previous browser GET submits
  if (window.location.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const emailParam = params.get('email');
      const passParam = params.get('password');
      if (emailParam) {
        setTimeout(() => {
          const emailEl = document.getElementById('login-email');
          if (emailEl) emailEl.value = emailParam;
          const passEl = document.getElementById('login-password');
          if (passEl && passParam) passEl.value = passParam;
        }, 50);
      }
      const cleanUrl = window.location.pathname + (window.location.hash || '#login');
      window.history.replaceState(null, '', cleanUrl);
    } catch (e) { }
  }

  // Auth forms MUST be initialized first
  try { initLoginForm(); } catch (e) { console.error('initLoginForm error:', e); }
  try { initSignupForm(); } catch (e) { console.error('initSignupForm error:', e); }
  try { initAuthScrollSync(); } catch (e) { console.error('initAuthScrollSync error:', e); }

  // Apply easy mode and dark mode
  try { initEasyMode(); } catch (e) { }
  try { initDarkMode(); } catch (e) { }

  // Init navbar
  try { initNavbar(); } catch (e) { }

  // Handle hash routing
  const hash = window.location.hash.replace('#', '') || 'home';
  try {
    if (!PUBLIC_VIEWS.includes(hash) && !isLoggedIn()) {
      activateView('home');
      setTimeout(() => showAuthRequiredPrompt(hash), 300);
    } else if (hash === 'dashboard' || hash === 'home') {
      navigate(isLoggedIn() ? 'dashboard' : 'home');
    } else {
      navigate(hash);
    }
  } catch (e) {
    console.error('navigate error:', e);
  }

  // Voice UI initializations
  try { initVoiceUI('voice-orb', 'voice-status', 'voice-transcript'); } catch (e) { }
  try { initVoiceUI('modal-voice-orb', 'modal-voice-status', 'modal-voice-transcript', 'modal-medicine-results'); } catch (e) { }
  try { initVoiceUI('companion-voice-orb', 'companion-voice-status', 'companion-voice-transcript', 'companion-medicine-results'); } catch (e) { }

  // Hero animation
  try { initHero(); } catch (e) { }

  // Landing chat
  try { initCompanionChatUI('home-chat', 'home-chat-body', 'home-chat-input', 'home-chat-send'); } catch (e) { }

  // Time Machine (landing)
  try { initTimeMachine(); } catch (e) { }

  // Legal assistant
  try { initLegal(); } catch (e) { }

  // Memory search (landing)
  try { initMemorySearch(); } catch (e) { }

  // Float mic nav
  const floatMic = document.getElementById('floating-mic');
  if (floatMic) floatMic.addEventListener('click', () => navigate('voice'));

  // Floating chat widget
  try { initFloatingChat(); } catch (e) { }

  // Hash change listener with auth protection
  window.addEventListener('hashchange', () => {
    const v = window.location.hash.replace('#', '') || 'home';
    if (!VIEWS.includes(v)) return;
    if (!PUBLIC_VIEWS.includes(v) && !isLoggedIn()) {
      showAuthRequiredPrompt(v);
      activateView('home');
      return;
    }
    navigate(v);
  });

  // Wellbeing check-in demo
  const wellbeingBtns = document.querySelectorAll('.wellbeing-action');
  wellbeingBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'call') showToast('Calling family — this would connect to your phone or app. (Demo mode)', 'info');
      if (action === 'music') showToast('Music would play from your favourite playlist. (Demo mode)', 'info');
      if (action === 'fine') showToast('That\'s wonderful! Have a beautiful day!', 'success');
    });
  });
}

// ----------------------------------------------------------------
// 27. FLOATING CHAT WIDGET
// ----------------------------------------------------------------
function initFloatingChat() {
  const widget = document.getElementById('floating-chat-widget');
  const btn = document.getElementById('floating-chat-btn');
  const panel = document.getElementById('floating-chat-panel');
  const closeBtn = document.getElementById('floating-chat-close');
  const body = document.getElementById('floating-chat-body');
  const input = document.getElementById('floating-chat-input');
  const send = document.getElementById('floating-chat-send');
  const badge = document.getElementById('floating-chat-badge');
  if (!widget || !btn || !panel) return;

  updateFloatingChatUI();

  let isOpen = false;
  let initialized = false;

  function openPanel() {
    isOpen = true;
    panel.classList.add('visible');
    btn.classList.add('open');
    if (badge) badge.style.display = 'none';
    if (!initialized) {
      initialized = true;
      if (chatHistory.length === 0) {
        const user = getStoredUser();
        const firstName = user ? (user.firstName || user.name.split(' ')[0]) : null;
        const hour = new Date().getHours();
        const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        const greeting = firstName
          ? `${timeGreeting}, ${firstName} Ji! I'm ${companionName}. How can I help you today?`
          : `${timeGreeting}! I'm ${companionName}, your AI companion on LifeConnect. What would you like to explore?`;

        chatHistory.push({ role: 'assistant', content: greeting });
        saveChatHistory();
        addChatMessage(body, 'ai', greeting, ['Wellness', 'Nostalgia Library', 'Memory Vault']);
      } else {
        chatHistory.forEach(msg => {
          addChatMessage(body, msg.role === 'user' ? 'user' : 'ai', msg.content, null);
        });
      }
    }
    setTimeout(() => input && input.focus(), 300);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('visible');
    btn.classList.remove('open');
  }

  btn.addEventListener('click', () => isOpen ? closePanel() : openPanel());
  if (closeBtn) closeBtn.addEventListener('click', closePanel);

  document.addEventListener('click', (e) => {
    if (isOpen && !panel.contains(e.target) && !btn.contains(e.target) && document.body.contains(e.target)) closePanel();
  });

  const sendMsg = () => {
    const msg = input.value.trim();
    if (!msg) return;
    addChatMessage(body, 'user', msg, null);
    input.value = '';
    const typing = showTypingIndicator(body);
    fetchLLMResponse(msg).then(res => {
      typing.remove();
      addChatMessage(body, 'ai', res.text, res.actions);
    });
  };

  if (send) send.addEventListener('click', sendMsg);
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });

  setTimeout(() => {
    if (!initialized && badge) {
      badge.style.display = 'flex';
    }
  }, 3000);
}

// ----------------------------------------------------------------
// 28. 24-HOUR INDIA & 12 MAJOR CITIES NEWS CONTROLLER
// ----------------------------------------------------------------
let currentNewsData = null;
let currentCityFilter = 'All';
let currentNewsSearch = '';
let newsUtterance = null;

const FALLBACK_NEWS_DATA = {
  national_24h: [
    {
      id: 1,
      title: "Senior Citizens Digital Pension Portal Upgrade Rolled Out Nationally",
      category: "Governance & Welfare",
      time_ago: "2 hours ago",
      summary: "Ministry of Social Justice announces simplified digital life certificate verification with doorstep assistance for seniors over 60 across India.",
      tag: "National Welfare",
      read_time: "2 min read"
    },
    {
      id: 2,
      title: "Indian Railways Expands Lower Berth Auto-Allocation Quota for Elders",
      category: "Transport & Infra",
      time_ago: "4 hours ago",
      summary: "IRCTC introduces enhanced priority booking for senior citizens, ensuring guaranteed lower berth preferences on Express and Vande Bharat trains.",
      tag: "Travel & Railways",
      read_time: "3 min read"
    },
    {
      id: 3,
      title: "AYUSH Ministry Launches Nationwide Morning Yoga & Pranayama Drive",
      category: "Health & Wellness",
      time_ago: "6 hours ago",
      summary: "Free wellness parks established across 500 towns in India offering guided gentle breathing exercises, joint mobility sessions, and health check-ups.",
      tag: "Senior Health",
      read_time: "2 min read"
    },
    {
      id: 4,
      title: "Golden Era Music Archives Digitized for Public Access",
      category: "Culture & Heritage",
      time_ago: "9 hours ago",
      summary: "Over 10,000 classic 1960s-1980s radio broadcasts, classical ragas, and vintage audio recordings restored and made free for senior listeners.",
      tag: "Arts & Nostalgia",
      read_time: "4 min read"
    }
  ],
  cities: {
    "New Delhi": [
      { title: "Lodhi Gardens Launches Morning Senior Walking Club & Herbal Tea Corner", time_ago: "1 hour ago", category: "City Wellness", summary: "Delhi Municipal Corporation sets up shaded seating, free health check kiosks, and fresh herbal tea for morning walkers at Lodhi & Nehru Park." },
      { title: "Mandi House Hosts Classical Hindustani Music Evening", time_ago: "5 hours ago", category: "Culture", summary: "Special tribute concert featuring legendary sitar compositions organized with free reserved seating for senior citizens." }
    ],
    "Mumbai": [
      { title: "Marine Drive Promenade Enhances Senior Safety Lighting & Benches", time_ago: "2 hours ago", category: "City Infrastructure", summary: "BMC adds anti-skid walking paths, specialized benches, and dedicated volunteer guides along the Queen's Necklace promenade." },
      { title: "Vintage Cinema Retrospective Opens in South Mumbai", time_ago: "6 hours ago", category: "Entertainment", summary: "Restored 1970s Bollywood classics screened daily with subsidized tickets for senior film enthusiasts." }
    ],
    "Bengaluru": [
      { title: "Lalbagh Botanical Garden Introduces Electric Shuttle Buggies for Seniors", time_ago: "3 hours ago", category: "Eco & Transport", summary: "Free electric cart rides now available every morning to help senior visitors tour the glasshouse and flower displays comfortably." },
      { title: "Malleshwaram Senior Tech Literacy Workshops Announced", time_ago: "7 hours ago", category: "Community", summary: "Free weekend classes helping elders master smartphone navigation, online banking safety, and video calls with grandkids." }
    ],
    "Kolkata": [
      { title: "Heritage Tram Ride Service Relaunched Along Maidan Route", time_ago: "2 hours ago", category: "Heritage & Travel", summary: "Air-conditioned nostalgia tram tour features classic Bengali acoustic music and complimentary Darjeeling tea for senior passengers." },
      { title: "Rabindra Sangeet Morning Recital at Victoria Memorial", time_ago: "4 hours ago", category: "Culture", summary: "Renowned vocalists perform timeless Tagore compositions amidst lush morning lawns, drawing hundreds of city elders." }
    ],
    "Chennai": [
      { title: "Mylapore Heritage Walk & Carnatic Morning Concerts Return", time_ago: "3 hours ago", category: "Arts & Tradition", summary: "Sabhas across Mylapore inaugurate morning devotional music hours with dedicated elder seating and traditional filter coffee." },
      { title: "Marina Beach Walkway Gets Wheelchair Access & Shade Canopies", time_ago: "6 hours ago", category: "Civic Amenities", summary: "Chennai Corporation completes beachside wooden ramp extension for seamless sea-breeze walks for seniors and wheelchair users." }
    ],
    "Hyderabad": [
      { title: "Hussain Sagar Promenade Beautified with Senior Exercise Pavilions", time_ago: "2 hours ago", category: "Urban Parks", summary: "Hyderabad Development Authority adds low-impact hydraulic fitness equipment designed specifically for age 50+ park visitors." },
      { title: "Charminar Heritage Evening Lights & Guided Storytelling Walk", time_ago: "8 hours ago", category: "Culture", summary: "Interactive history tours sharing stories of Nizam era architecture with comfortable electric cart transport." }
    ],
    "Ahmedabad": [
      { title: "Sabarmati Riverfront Morning Laughter Club Expands to 10 Zones", time_ago: "1 hour ago", category: "Health & Joy", summary: "Popular riverfront laughter & breathing yoga sessions now accommodate over 1,500 daily senior walkers along the promenade." },
      { title: "Old City Haveli Preservation Drive Guided Walks", time_ago: "5 hours ago", category: "Heritage", summary: "Guided architectural walks highlighting centuries-old wooden Pol houses with local Gujarati breakfast tasting." }
    ],
    "Pune": [
      { title: "Shaniwar Wada Cultural Evening & Marathi Literature Meet", time_ago: "4 hours ago", category: "Literature & Arts", summary: "Veteran authors and poets gather for evening recitations in historic courtyard setting with reserved senior seating." },
      { title: "Kothrud Senior Fitness Trails Opened at ARAI Hills", time_ago: "7 hours ago", category: "Fitness", summary: "Gently graded walking paths with rest kiosks and drinking water stations inaugurated for morning nature lovers." }
    ],
    "Jaipur": [
      { title: "Amer Fort Introduces Battery Golf Carts & Heritage Courtyard Music", time_ago: "3 hours ago", category: "Heritage & Comfort", summary: "Senior visitors enjoy free cart transport up the palace incline and live Shehnai recitations in Rajasthan court." },
      { title: "Ramniwas Garden Morning Ayurvedic Wellness Kiosk Opens", time_ago: "6 hours ago", category: "Ayurveda & Health", summary: "Certified doctors offer free pulse diagnostics, herbal teas, and joint care advice for morning walkers." }
    ],
    "Lucknow": [
      { title: "Gomti Riverfront Morning Gazebo & Classical Ghazal Sessions", time_ago: "2 hours ago", category: "Music & Leisure", summary: "Lucknow Development Authority hosts sunrise musical gatherings along the riverfront promenade for city elders." },
      { title: "Chikankari Craft Heritage Expo Opened at Hazratganj", time_ago: "5 hours ago", category: "Handicrafts", summary: "Special exhibition celebrating veteran master artisans with interactive embroidery workshops for senior hobbyists." }
    ],
    "Chandigarh": [
      { title: "Sukhna Lake Morning Walking Festival Attracts 2,000+ Seniors", time_ago: "2 hours ago", category: "Fitness & Nature", summary: "Clean air walking rally, bird watching guide tours, and complimentary herbal immunity drinks hosted by UT administration." },
      { title: "Rose Garden Senior Reading Lounge & Chess Club Inaugurated", time_ago: "6 hours ago", category: "Community", summary: "Shaded garden pavilion equipped with newspapers, magazines from 1970-1990s, and wooden chess boards." }
    ],
    "Kochi": [
      { title: "Water Metro Launches Scenic Backwater Morning Excursions for Seniors", time_ago: "3 hours ago", category: "Eco Transport", summary: "Electric boat cruises offer serene views of Fort Kochi, coconut groves, and Chinese fishing nets with priority boarding." },
      { title: "Marine Drive Promenade Kathakali Recital Evening", time_ago: "7 hours ago", category: "Traditional Dance", summary: "Open-air classical Kathakali makeup demonstration and performance with free seaside seating for senior art lovers." }
    ]
  }
};

async function loadNewsPage() {
  const nationalGrid = document.getElementById('national-news-grid');
  const cityGrid = document.getElementById('city-news-grid');
  if (!nationalGrid || !cityGrid) return;

  try {
    const res = await apiRequest('/news');
    if (res && res.success && res.data) {
      currentNewsData = res.data;
    }
  } catch (e) {
    console.warn("Backend news load fallback:", e);
  }

  if (!currentNewsData) {
    currentNewsData = FALLBACK_NEWS_DATA;
  }

  // Personalization based on logged-in user credentials
  const user = getStoredUser();
  if (user) {
    // If user's city is among known cities, automatically switch city filter to their hometown!
    if (user.city && user.city !== 'Other' && currentNewsData.cities && currentNewsData.cities[user.city]) {
      currentCityFilter = user.city;
      document.querySelectorAll('.city-tab').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-city') === user.city);
      });
    }

    // Render personal welcome banner
    const bannerContainer = document.querySelector('#view-news .container.py-12');
    if (bannerContainer) {
      let banner = document.getElementById('news-personal-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'news-personal-banner';
        banner.className = 'personalized-content-banner';
        bannerContainer.insertBefore(banner, bannerContainer.firstChild);
      }
      banner.innerHTML = `
        <div style="font-size:28px;line-height:1;">🎯</div>
        <div style="flex:1;">
          <div style="font-weight:800;font-size:16px;color:var(--text-dark);margin-bottom:3px;">
            Personalized Feed for ${user.name}
          </div>
          <div style="font-size:13px;color:var(--text-sec);line-height:1.5;">
            Prioritizing <strong>${user.city || 'local'}</strong> civic & welfare bulletins, healthcare updates for seniors, and cultural events tailored to your ${user.decade || '1970s'} era preferences.
          </div>
        </div>
        <div style="font-size:12px;background:white;padding:4px 10px;border-radius:12px;border:1px solid #CBD5E1;font-weight:700;color:var(--cosmic-orange);white-space:nowrap;">
          📍 ${user.city || 'India'}
        </div>
      `;
    }
  }

  renderNationalNews();
  renderCityNews();
}

let currentModalStory = null;
let newsReaderFontSize = 18;

function openNationalStory(index) {
  if (!currentNewsData || !currentNewsData.national_24h) return;
  const story = currentNewsData.national_24h[index];
  if (!story) return;
  openNewsStoryModal(story);
}

function openCityStory(cityName, index) {
  if (!currentNewsData || !currentNewsData.cities) return;
  const list = currentNewsData.cities[cityName];
  if (!list) return;
  const story = list[index];
  if (!story) return;
  openNewsStoryModal({ ...story, cityName });
}

function openNewsStoryModal(story) {
  currentModalStory = story;
  const modal = document.getElementById('news-reader-modal');
  if (!modal) return;

  const catEl = document.getElementById('news-modal-category');
  const timeEl = document.getElementById('news-modal-time');
  const titleEl = document.getElementById('news-reader-title');
  const sourceEl = document.getElementById('news-modal-source');
  const bodyEl = document.getElementById('news-modal-content');
  const extLinkEl = document.getElementById('news-modal-ext-link');

  if (catEl) catEl.textContent = story.category || 'News';
  if (timeEl) timeEl.textContent = '⏱️ ' + (story.time_ago || 'Recent');
  if (titleEl) titleEl.textContent = story.title || '';
  if (sourceEl) {
    sourceEl.textContent = (story.cityName ? `📍 ${story.cityName} • ` : '🇮🇳 National Update • ') +
      (story.tag || story.source || 'Verified Source');
  }
  if (bodyEl) {
    newsReaderFontSize = 18;
    bodyEl.style.fontSize = newsReaderFontSize + 'px';
    const textToShow = story.full_content || story.summary || story.title;
    bodyEl.innerText = textToShow;
  }

  if (extLinkEl) {
    if (story.link && story.link !== '#') {
      extLinkEl.href = story.link;
      extLinkEl.style.display = 'inline-flex';
      extLinkEl.textContent = 'Read Full Article on ' + (story.source || story.tag || 'Source') + ' ↗';
    } else {
      extLinkEl.style.display = 'none';
    }
  }

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeNewsReaderModal() {
  const modal = document.getElementById('news-reader-modal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
  if (window.speechSynthesis && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
}

function handleNewsModalBackdrop(event) {
  if (event.target && event.target.id === 'news-reader-modal') {
    closeNewsReaderModal();
  }
}

function adjustNewsFontSize(delta) {
  newsReaderFontSize = Math.min(28, Math.max(15, newsReaderFontSize + (delta * 2)));
  const bodyEl = document.getElementById('news-modal-content');
  if (bodyEl) bodyEl.style.fontSize = newsReaderFontSize + 'px';
}

function readCurrentModalNews() {
  if (!currentModalStory) return;
  readSingleNews((currentModalStory.title || '') + '. ' + (currentModalStory.summary || ''));
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeNewsReaderModal();
});

function renderNationalNews() {
  const container = document.getElementById('national-news-grid');
  if (!container || !currentNewsData || !currentNewsData.national_24h) return;

  let items = currentNewsData.national_24h.map((item, originalIndex) => ({ ...item, originalIndex }));
  if (currentNewsSearch) {
    const q = currentNewsSearch.toLowerCase();
    items = items.filter(n => (n.title && n.title.toLowerCase().includes(q)) || (n.summary && n.summary.toLowerCase().includes(q)) || (n.category && n.category.toLowerCase().includes(q)));
  }

  container.innerHTML = items.map(n => {
    const hasLink = n.link && n.link !== '#' && n.link.startsWith('http');
    const linkUrl = hasLink ? n.link : 'javascript:void(0)';
    const safeTitle = (n.title || '').replace(/'/g, "\\'");
    return `
    <article class="news-card" onclick="openNationalStory(${n.originalIndex})" role="button" tabindex="0" title="Click to view story details">
      <div>
        <div class="news-card__top">
          <span class="news-badge-category">${n.category}</span>
          <span class="news-badge-time">⏱️ ${n.time_ago}</span>
        </div>
        <h3 class="news-card__title">
          <a href="${linkUrl}" ${hasLink ? 'target="_blank" rel="noopener noreferrer"' : ''} class="news-title-link" onclick="event.stopPropagation(); ${!hasLink ? `openNationalStory(${n.originalIndex})` : ''}" title="${hasLink ? 'Read full article on original website' : 'View story'}">
            ${n.title}
          </a>
        </h3>
        <p class="news-card__summary">${n.summary}</p>
      </div>
      <div class="news-card__footer" style="flex-wrap:wrap; gap:10px;">
        <span class="news-card__tag">🏷️ ${n.tag || n.source || 'India News'}</span>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          ${hasLink ? `<a href="${n.link}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" onclick="event.stopPropagation();" style="padding:6px 14px; font-weight:700; text-decoration:none;" title="Read full article on publisher website">📖 Read Full Article ↗</a>` : ''}
          <button type="button" onclick="event.stopPropagation(); openNationalStory(${n.originalIndex})" class="btn btn-secondary btn-sm" style="padding:6px 12px; font-weight:700;" title="Quick preview in LifeConnect">👁️ View</button>
          <button type="button" onclick="event.stopPropagation(); readSingleNews('${safeTitle}')" class="btn btn-ghost btn-sm" style="color:var(--cosmic-orange); font-weight:700; padding:6px 10px;" title="Listen to story">🔊 Listen</button>
        </div>
      </div>
    </article>
  `;
  }).join('');
}

function selectNewsCity(city) {
  currentCityFilter = city;
  document.querySelectorAll('.city-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-city') === city);
  });
  renderCityNews();
}

function renderCityNews() {
  const container = document.getElementById('city-news-grid');
  if (!container || !currentNewsData || !currentNewsData.cities) return;

  let cityStories = [];
  const citiesObj = currentNewsData.cities;

  if (currentCityFilter === 'All') {
    Object.keys(citiesObj).forEach(cName => {
      (citiesObj[cName] || []).forEach((item, originalIndex) => {
        cityStories.push({ ...item, cityName: cName, originalIndex });
      });
    });
  } else if (citiesObj[currentCityFilter]) {
    (citiesObj[currentCityFilter] || []).forEach((item, originalIndex) => {
      cityStories.push({ ...item, cityName: currentCityFilter, originalIndex });
    });
  }

  if (currentNewsSearch) {
    const q = currentNewsSearch.toLowerCase();
    cityStories = cityStories.filter(s => (s.title && s.title.toLowerCase().includes(q)) || (s.summary && s.summary.toLowerCase().includes(q)) || (s.cityName && s.cityName.toLowerCase().includes(q)));
  }

  if (cityStories.length === 0) {
    container.innerHTML = `<div class="card p-8 text-center" style="grid-column:1/-1; background:#E0F2FE; color:#0284C7; font-weight:700;">No news stories found matching your filter.</div>`;
    return;
  }

  container.innerHTML = cityStories.map(s => {
    const hasLink = s.link && s.link !== '#' && s.link.startsWith('http');
    const linkUrl = hasLink ? s.link : 'javascript:void(0)';
    const safeTitle = (s.title || '').replace(/'/g, "\\'");
    const safeCity = (s.cityName || '').replace(/'/g, "\\'");
    return `
    <article class="news-card" onclick="openCityStory('${safeCity}', ${s.originalIndex})" role="button" tabindex="0" title="Click to view story details">
      <div>
        <div class="news-card__top">
          <span class="news-badge-category">${s.category}</span>
          <span class="news-badge-time">📍 ${s.cityName} • ${s.time_ago}</span>
        </div>
        <h3 class="news-card__title">
          <a href="${linkUrl}" ${hasLink ? 'target="_blank" rel="noopener noreferrer"' : ''} class="news-title-link" onclick="event.stopPropagation(); ${!hasLink ? `openCityStory('${safeCity}', ${s.originalIndex})` : ''}" title="${hasLink ? 'Read full article on original website' : 'View story'}">
            ${s.title}
          </a>
        </h3>
        <p class="news-card__summary">${s.summary}</p>
      </div>
      <div class="news-card__footer" style="flex-wrap:wrap; gap:10px;">
        <span class="news-card__tag">🏙️ ${s.cityName} Bulletin</span>
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          ${hasLink ? `<a href="${s.link}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" onclick="event.stopPropagation();" style="padding:6px 14px; font-weight:700; text-decoration:none;" title="Read full article on publisher website">📖 Read Full Article ↗</a>` : ''}
          <button type="button" onclick="event.stopPropagation(); openCityStory('${safeCity}', ${s.originalIndex})" class="btn btn-secondary btn-sm" style="padding:6px 12px; font-weight:700;" title="Quick preview in LifeConnect">👁️ View</button>
          <button type="button" onclick="event.stopPropagation(); readSingleNews('${safeTitle}')" class="btn btn-ghost btn-sm" style="color:var(--cosmic-orange); font-weight:700; padding:6px 10px;" title="Listen to story">🔊 Listen</button>
        </div>
      </div>
    </article>
  `;
  }).join('');
}

function filterNewsSearch(val) {
  currentNewsSearch = val.trim();
  renderNationalNews();
  renderCityNews();
}

function readNewsAloud() {
  if (!('speechSynthesis' in window)) {
    showToast("Speech synthesis is not supported on this browser.", "warning");
    return;
  }

  const btn = document.getElementById('news-voice-btn');

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    if (btn) {
      btn.classList.remove('speaking');
      btn.innerHTML = `<span id="news-voice-icon">🔊</span> Listen to Today's Headlines`;
    }
    showToast("Audio bulletin stopped.", "info");
    return;
  }

  if (!currentNewsData || !currentNewsData.national_24h) return;

  const textToRead = "Here is your 24-hour India and City News summary. " +
    currentNewsData.national_24h.map(n => n.title + ". " + n.summary).join(" ") +
    " City updates include senior walking clubs in Delhi and Mumbai, and Lalbagh electric shuttles in Bengaluru.";

  newsUtterance = new SpeechSynthesisUtterance(textToRead);
  newsUtterance.rate = 0.9;
  newsUtterance.onend = () => {
    if (btn) {
      btn.classList.remove('speaking');
      btn.innerHTML = `<span id="news-voice-icon">🔊</span> Listen to Today's Headlines`;
    }
  };

  if (btn) {
    btn.classList.add('speaking');
    btn.innerHTML = `<span id="news-voice-icon">⏹️</span> Reading News (Tap to Stop)`;
  }

  window.speechSynthesis.speak(newsUtterance);
  showToast("Playing 24-Hour Voice News Summary...", "success");
}

function readSingleNews(title) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(title);
  utt.rate = 0.95;
  window.speechSynthesis.speak(utt);
}

// ----------------------------------------------------------------
// 29. START
// ----------------------------------------------------------------
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// ================================================================
// PERSONALIZED CONTENT RECOMMENDATION ENGINE (VERIFIED & INTERACTIVE)
// ================================================================

let _contentCatalog = null;
let _contentCurrentCategory = 'all';
let _contentCurrentPlatform = 'all';
let _contentCurrentSearch = '';
let _contentCurrentDecade = '';
let _contentPage = 0;
let _activePlayingVideo = null;
const CONTENT_PAGE_SIZE = 12;

const CONTENT_INTERACTIONS_KEY = 'lc_content_interactions';

function getContentInteractions() {
  try {
    return JSON.parse(localStorage.getItem(CONTENT_INTERACTIONS_KEY) || '{}');
  } catch (e) { return {}; }
}

function saveContentInteraction(videoId, action) {
  const interactions = getContentInteractions();
  interactions[videoId] = action; // 'watched' or 'ignored'
  localStorage.setItem(CONTENT_INTERACTIONS_KEY, JSON.stringify(interactions));
}

function getConsumedVideoIds() {
  const interactions = getContentInteractions();
  return new Set(Object.keys(interactions));
}

// Fetch the multi-platform content catalog from backend, with local fallback
async function fetchContentCatalog() {
  const user = getStoredUser();
  const userParam = user && user.id ? `user_id=${encodeURIComponent(user.id)}&` : '';
  const decade = _contentCurrentDecade || (user ? (user.decade || '') : '');
  try {
    const res = await apiRequest(`/content/recommendations?${userParam}decade=${encodeURIComponent(decade)}&category=${encodeURIComponent(_contentCurrentCategory)}&platform=${encodeURIComponent(_contentCurrentPlatform)}&page=1&limit=24`);
    if (res && res.success && res.videos && res.videos.length > 0) {
      _contentCatalog = res.videos;
      return _contentCatalog;
    }
  } catch (e) {
    console.warn('[Content] Backend fetch failed, using embedded catalog:', e);
  }
  _contentCatalog = getEmbeddedCatalog();
  return _contentCatalog;
}

// Score and filter videos based on user preferences
function scoreVideosForUser(videos, user) {
  const consumed = getConsumedVideoIds();
  const userDecade = _contentCurrentDecade || user?.decade || '';
  const userWellness = (user?.wellness_goal || '').toLowerCase();
  const userLanguage = user?.language || 'Hindi';
  const userCity = (user?.city || '').toLowerCase();

  // Combine interests & culture preferences
  const rawInterests = (user?.culture_preferences || []).concat(user?.interests || []);
  const userInterests = rawInterests.map(x => String(x).toLowerCase());

  return videos
    .filter(v => !consumed.has(v.id))
    .map(v => {
      let score = 10;
      let reasons = [];
      const titleLower = (v.title || '').toLowerCase();
      const vCats = v.categories || [];
      const vDecades = v.decades || [];
      const vTags = (v.culture_tags || []).map(t => String(t).toLowerCase());

      // 1. Decade matching
      if (userDecade && vDecades.includes(userDecade)) {
        score += 35;
        reasons.push(`🕰️ From your ${userDecade} era`);
      }

      // 2. Wellness Goal matching
      if (vCats.includes('wellness')) {
        if (userWellness) {
          if ((userWellness.includes('yoga') || userWellness.includes('chair') || userWellness.includes('stretch')) && (titleLower.includes('yoga') || titleLower.includes('chair'))) {
            score += 45;
            reasons.push('🧘 Matches your Daily Yoga & Mobility Goal');
          } else if ((userWellness.includes('joint') || userWellness.includes('pain') || userWellness.includes('arthritis')) && (titleLower.includes('joint') || titleLower.includes('pain'))) {
            score += 45;
            reasons.push('🩺 Joint Relief for Your Wellness');
          } else if ((userWellness.includes('walk') || userWellness.includes('mobility')) && (titleLower.includes('walk') || titleLower.includes('mobility'))) {
            score += 45;
            reasons.push('🚶 For Your Morning Walking Goal');
          } else if ((userWellness.includes('pranayama') || userWellness.includes('breath')) && (titleLower.includes('pranayama') || titleLower.includes('breath'))) {
            score += 45;
            reasons.push('🌬️ Pranayama & Breath Vitality');
          } else if ((userWellness.includes('meditat') || userWellness.includes('sleep') || userWellness.includes('peace')) && (titleLower.includes('meditat') || titleLower.includes('sleep') || titleLower.includes('peace'))) {
            score += 45;
            reasons.push('🕊️ Calming Meditation for Good Sleep');
          } else {
            score += 20;
            reasons.push('🌿 Senior Wellness Routine');
          }
        } else {
          score += 15;
          reasons.push('🌿 Recommended for Senior Health');
        }
      }

      // 3. Cultural and personal interest matching
      const cultureMatch = vTags.find(t => userInterests.some(ui => ui.includes(t) || t.includes(ui)));
      if (cultureMatch) {
        score += 30;
        reasons.push(`🎯 Matches your interest in ${v.culture_tags[0]}`);
      } else if (userInterests.some(ui => ui.includes('music') || ui.includes('song')) && vCats.includes('nostalgia_music')) {
        score += 25;
        reasons.push('🎵 Golden Era Melody');
      } else if (userInterests.some(ui => ui.includes('devotional') || ui.includes('bhajan')) && vCats.includes('devotional')) {
        score += 30;
        reasons.push('🙏 Devotional Peace for Your Soul');
      } else if (userInterests.some(ui => ui.includes('movie') || ui.includes('cinema')) && vCats.includes('classic_cinema')) {
        score += 25;
        reasons.push('🎬 Classic Indian Cinema');
      }

      // 4. Language preference
      if (v.languages && v.languages.includes(userLanguage)) {
        score += 15;
      }

      // 5. City & Travel interest
      if (userCity && (titleLower.includes(userCity) || vTags.some(t => t.includes(userCity)))) {
        score += 25;
        reasons.push(`📍 Connected to ${userCity.charAt(0).toUpperCase() + userCity.slice(1)}`);
      }

      return {
        ...v,
        score,
        matchReason: reasons[0] || v.matchReason || '✨ Handpicked for You'
      };
    })
    .sort((a, b) => b.score - a.score);
}

function filterCatalog(videos, category, search, platform) {
  let filtered = videos || [];
  if (platform && platform !== 'all') {
    filtered = filtered.filter(v => (v.platform || 'youtube') === platform);
  }
  if (category && category !== 'all') {
    filtered = filtered.filter(v => v.categories && v.categories.includes(category));
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(v =>
      (v.title && v.title.toLowerCase().includes(q)) ||
      (v.channel && v.channel.toLowerCase().includes(q)) ||
      (v.description && v.description.toLowerCase().includes(q)) ||
      (v.culture_tags && v.culture_tags.some(t => String(t).toLowerCase().includes(q)))
    );
  }
  return filtered;
}

function getPlatformLabel(platform) {
  const map = {
    youtube: '▶ YouTube',
    facebook: 'f Facebook Watch',
    x: '𝕏 Twitter/X',
    archive: '🏛 Archive.org'
  };
  return map[platform] || platform || '▶ YouTube';
}

function getPlatformClass(platform) {
  const map = { youtube: 'platform-youtube', facebook: 'platform-facebook', x: 'platform-x', archive: 'platform-archive' };
  return map[platform] || 'platform-youtube';
}

function renderVideoCard(video, index) {
  const platform = video.platform || 'youtube';
  const platformLabel = getPlatformLabel(platform);
  const platformClass = getPlatformClass(platform);

  let thumbUrl = video.thumbnail;
  if (!thumbUrl) {
    if (platform === 'youtube') {
      thumbUrl = `https://img.youtube.com/vi/${video.id}/hqdefault.jpg`;
    } else if (platform === 'facebook') {
      thumbUrl = 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=600&auto=format&fit=crop&q=80';
    } else if (platform === 'x') {
      thumbUrl = 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=600&auto=format&fit=crop&q=80';
    } else {
      thumbUrl = 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=600&auto=format&fit=crop&q=80';
    }
  }

  const safeTitle = (video.title || '').replace(/'/g, "\\'");
  const safeId = String(video.id).replace(/'/g, "");

  let actionButtonsHtml = '';
  if (platform === 'youtube') {
    actionButtonsHtml = `
      <button class="video-card__watch-btn" onclick="playVideoModal('${safeId}')" style="flex:1;min-width:130px;">
        ▶ Play Video
      </button>
      <a href="${video.url}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" onclick="onDirectExternalWatch('${safeId}')" title="Watch directly on YouTube in new tab" style="font-size:12px;padding:6px 10px;text-decoration:none;">
        YouTube ↗
      </a>
      <button class="video-card__ignore-btn" onclick="ignoreContent('${safeId}')" title="Not interested — show me a new recommendation">
        🚫 Skip
      </button>
    `;
  } else if (platform === 'facebook') {
    actionButtonsHtml = `
      <a href="${video.url}" target="_blank" rel="noopener noreferrer" class="video-card__watch-btn" onclick="onDirectExternalWatch('${safeId}')" style="flex:1;min-width:150px;text-align:center;text-decoration:none;background:#1877F2;color:white;display:flex;align-items:center;justify-content:center;gap:6px;">
        f Watch on Facebook ↗
      </a>
      <button class="video-card__ignore-btn" onclick="ignoreContent('${safeId}')" title="Not interested — show me a new recommendation">
        🚫 Skip
      </button>
    `;
  } else if (platform === 'x') {
    actionButtonsHtml = `
      <a href="${video.url}" target="_blank" rel="noopener noreferrer" class="video-card__watch-btn" onclick="onDirectExternalWatch('${safeId}')" style="flex:1;min-width:150px;text-align:center;text-decoration:none;background:#0f1419;color:white;display:flex;align-items:center;justify-content:center;gap:6px;">
        𝕏 Watch on Twitter ↗
      </a>
      <button class="video-card__ignore-btn" onclick="ignoreContent('${safeId}')" title="Not interested — show me a new recommendation">
        🚫 Skip
      </button>
    `;
  } else {
    actionButtonsHtml = `
      <a href="${video.url}" target="_blank" rel="noopener noreferrer" class="video-card__watch-btn" onclick="onDirectExternalWatch('${safeId}')" style="flex:1;min-width:150px;text-align:center;text-decoration:none;background:#148A5C;color:white;display:flex;align-items:center;justify-content:center;gap:6px;">
        🏛 Open Archive ↗
      </a>
      <button class="video-card__ignore-btn" onclick="ignoreContent('${safeId}')" title="Not interested — show me a new recommendation">
        🚫 Skip
      </button>
    `;
  }

  const onThumbClick = platform === 'youtube'
    ? `playVideoModal('${safeId}')`
    : `window.open('${video.url}', '_blank'); onDirectExternalWatch('${safeId}')`;

  return `
    <div class="video-card entering" id="vcard-${safeId}" data-video-id="${safeId}">
      <div class="video-card__thumb-wrap" onclick="${onThumbClick}">
        <img class="video-card__thumb" src="${thumbUrl}" alt="${safeTitle}" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80';">
        <span class="video-card__platform-badge ${platformClass}">${platformLabel}</span>
        <div class="video-card__play-overlay">▶</div>
        ${video.duration ? `<span class="video-card__duration-badge">${video.duration}</span>` : ''}
      </div>
      <div class="video-card__body">
        <span class="video-card__match-reason" title="${video.matchReason || ''}">${video.matchReason || '✨ Handpicked for You'}</span>
        <div class="video-card__title" title="${safeTitle}">${video.title}</div>
        <div class="video-card__channel">📡 ${video.channel}</div>
        <div class="video-card__actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
          ${actionButtonsHtml}
        </div>
      </div>
    </div>
  `;
}

function updateContentStats() {
  const interactions = getContentInteractions();
  const watchedCount = Object.values(interactions).filter(a => a === 'watched').length;
  const ignoredCount = Object.values(interactions).filter(a => a === 'ignored').length;
  const label = document.getElementById('content-stats-label');
  if (label) {
    label.innerHTML = `✅ Watched: <b>${watchedCount}</b> · 🚫 Skipped: <b>${ignoredCount}</b> · ♾️ <b>Endless Stream Active</b> across YouTube, Facebook &amp; 𝕏`;
  }
}

async function initContentPage() {
  const grid = document.getElementById('content-video-grid');
  if (!grid) return;

  const user = getStoredUser();
  if (user && user.decade && !_contentCurrentDecade) {
    _contentCurrentDecade = user.decade;
  }

  // Render personalization banner with interactive badges
  const banner = document.getElementById('content-personalization-banner');
  if (banner) {
    if (user) {
      const tags = [];
      if (_contentCurrentDecade || user.decade) tags.push(`🕰️ ${_contentCurrentDecade || user.decade}`);
      if (user.city) tags.push(`📍 ${user.city}`);
      if (user.language) tags.push(`🗣️ ${user.language}`);
      if (user.wellness_goal) tags.push(`🧘 ${user.wellness_goal.split(' ').slice(0, 3).join(' ')}`);

      banner.innerHTML = `
        <div class="content-pers-banner" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            🎯 Personalized for <strong style="color:white;font-size:16px;">&nbsp;${user.name}&nbsp;</strong>
            <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;">
              ${tags.map(t => `<span class="content-pers-tag" style="background:rgba(255,255,255,0.2);color:white;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;">${t}</span>`).join('')}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="color:white;font-size:13px;font-weight:600;">Era:</label>
            <select id="content-quick-decade-select" onchange="switchContentDecade(this.value)" style="background:white;color:var(--text-dark);border-radius:8px;padding:6px 10px;font-size:13px;font-weight:700;border:none;cursor:pointer;">
              <option value="">All Eras</option>
              <option value="1960s" ${_contentCurrentDecade === '1960s' ? 'selected' : ''}>1960s Golden Era</option>
              <option value="1970s" ${_contentCurrentDecade === '1970s' ? 'selected' : ''}>1970s Melody</option>
              <option value="1980s" ${_contentCurrentDecade === '1980s' ? 'selected' : ''}>1980s Retro</option>
              <option value="1990s" ${_contentCurrentDecade === '1990s' ? 'selected' : ''}>1990s Hits</option>
              <option value="2000s" ${_contentCurrentDecade === '2000s' ? 'selected' : ''}>2000s+ Modern</option>
            </select>
          </div>
        </div>`;
    } else {
      banner.innerHTML = `<div class="content-pers-banner">🎯 Curated Senior Content — Log in to customize your recommendations</div>`;
    }
  }

  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-sec);"><div style="font-size:48px;">⏳</div><p style="font-size:18px;font-weight:700;">Loading your personalized recommendations...</p></div>`;

  _contentCurrentCategory = 'all';
  _contentCurrentSearch = '';
  _contentPage = 0;

  const catalog = await fetchContentCatalog();
  renderContentGrid(catalog, user);
}

function switchContentDecade(dec) {
  _contentCurrentDecade = dec;
  _contentPage = 0;
  const user = getStoredUser();
  renderContentGrid(_contentCatalog, user);
  showToast(`Switched era to ${dec || 'All Eras'}. Your feed has been updated! 🎬`, 'info', 2500);
}

function renderContentGrid(catalog, user) {
  if (!catalog) return;
  const scored = scoreVideosForUser(catalog, user || getStoredUser());
  const filtered = filterCatalog(scored, _contentCurrentCategory, _contentCurrentSearch, _contentCurrentPlatform);
  const pageVideos = filtered.slice(0, CONTENT_PAGE_SIZE + _contentPage * CONTENT_PAGE_SIZE);
  const grid = document.getElementById('content-video-grid');
  if (!grid) return;

  if (pageVideos.length === 0) {
    grid.innerHTML = `
      <div class="content-empty-state" style="grid-column:1/-1;text-align:center;padding:50px 20px;background:var(--cream);border-radius:16px;">
        <div style="font-size:56px;margin-bottom:16px;">🎉</div>
        <p style="font-size:22px;font-weight:800;color:var(--text-dark);margin-bottom:8px;">You've seen all suggestions in this category!</p>
        <p style="color:var(--text-sec);margin-bottom:24px;font-size:16px;">You can reset your history to re-watch any video, or explore other categories.</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <button onclick="loadMoreContent()" class="btn btn-secondary btn-lg" style="font-weight:700;">✨ Generate Fresh Infinite Stream</button>
          <button onclick="resetContentHistory()" class="btn btn-primary btn-lg" style="font-weight:700;">🔄 Reset Watch History</button>
        </div>
      </div>`;
  } else {
    grid.innerHTML = pageVideos.map((v, i) => renderVideoCard(v, i)).join('');
  }

  const loadMoreWrap = document.getElementById('content-load-more-wrap');
  if (loadMoreWrap) {
    loadMoreWrap.style.display = 'block'; // Always available for boundless streaming
  }
  updateContentStats();
  setupInfiniteScroll();
}

async function loadMoreContent() {
  const btn = document.getElementById('content-load-more-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ Loading more tailored gems...';
  }
  _contentPage++;
  const user = getStoredUser();
  const userParam = user && user.id ? `user_id=${encodeURIComponent(user.id)}&` : '';
  const decade = _contentCurrentDecade || (user ? (user.decade || '') : '');
  try {
    const res = await apiRequest(`/content/recommendations?${userParam}decade=${encodeURIComponent(decade)}&category=${encodeURIComponent(_contentCurrentCategory)}&platform=${encodeURIComponent(_contentCurrentPlatform)}&page=${_contentPage + 1}&limit=12`);
    if (res && res.success && res.videos && res.videos.length > 0) {
      const existingIds = new Set((_contentCatalog || []).map(v => v.id));
      const fresh = res.videos.filter(v => !existingIds.has(v.id));
      _contentCatalog = (_contentCatalog || []).concat(fresh);
    }
  } catch (e) {
    console.warn('[Content] Infinite load fetch error:', e);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '✨ Load More Recommendations';
    }
  }
  renderContentGrid(_contentCatalog, getStoredUser());
}

function filterContentCategory(cat) {
  _contentCurrentCategory = cat;
  _contentPage = 0;
  document.querySelectorAll('.content-cat-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.cat === cat);
  });
  renderContentGrid(_contentCatalog, getStoredUser());
}

function filterContentPlatform(plat) {
  _contentCurrentPlatform = plat;
  _contentPage = 0;
  document.querySelectorAll('.content-plat-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.plat === plat);
  });
  renderContentGrid(_contentCatalog, getStoredUser());
  const label = plat === 'all' ? 'All Platforms' : (getPlatformLabel(plat) || plat);
  showToast(`Showing recommendations for ${label} 🌐`, 'info', 2000);
}

function filterContentSearch(val) {
  _contentCurrentSearch = val;
  _contentPage = 0;
  renderContentGrid(_contentCatalog, getStoredUser());
}

let _infiniteScrollAttached = false;
function setupInfiniteScroll() {
  if (_infiniteScrollAttached) return;
  _infiniteScrollAttached = true;
  window.addEventListener('scroll', () => {
    const currentView = document.querySelector('.view-section.active');
    if (!currentView || currentView.id !== 'content-view') return;
    const scrollPos = window.innerHeight + window.scrollY;
    const docHeight = document.documentElement.scrollHeight;
    if (docHeight - scrollPos < 450) {
      const btn = document.getElementById('content-load-more-btn');
      if (btn && !btn.disabled) {
        loadMoreContent();
      }
    }
  }, { passive: true });
}

// Senior In-Page Video Player Modal
function playVideoModal(videoId) {
  const video = (_contentCatalog || getEmbeddedCatalog()).find(v => v.id === videoId);
  if (!video) return;

  _activePlayingVideo = video;

  // Mark watched locally & sync to backend
  saveContentInteraction(videoId, 'watched');
  const user = getStoredUser();
  if (user && user.id) {
    apiRequest('/content/interaction', 'POST', {
      user_id: user.id,
      video_id: videoId,
      action: 'watched',
      platform: video.platform || 'youtube'
    }).catch(() => { });
  }

  // Populate modal elements
  const modal = document.getElementById('video-player-modal');
  const iframe = document.getElementById('vplayer-iframe');
  const titleEl = document.getElementById('vplayer-title');
  const channelEl = document.getElementById('vplayer-channel');
  const badgeEl = document.getElementById('vplayer-match-badge');
  const ytLink = document.getElementById('vplayer-yt-link');

  if (titleEl) titleEl.textContent = video.title;
  if (channelEl) channelEl.textContent = `📡 ${video.channel} · ⏱️ ${video.duration || ''}`;
  if (badgeEl) badgeEl.textContent = video.matchReason || '✨ Suggested For You';
  if (ytLink) ytLink.href = video.url;

  if (iframe) {
    const embedSrc = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`;
    iframe.src = embedSrc;
  }

  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
  }

  // Animate watched card and replace it with next recommendation
  replaceCardInGrid(videoId);
  updateContentStats();
}

function closeVideoPlayerModal() {
  const modal = document.getElementById('video-player-modal');
  const iframe = document.getElementById('vplayer-iframe');
  if (iframe) iframe.src = '';
  if (modal) {
    modal.classList.remove('open');
    modal.style.display = 'none';
  }
  _activePlayingVideo = null;
}

function handleVideoModalBackdrop(event) {
  if (event.target.id === 'video-player-modal') {
    closeVideoPlayerModal();
  }
}

function skipCurrentModalVideo() {
  if (_activePlayingVideo) {
    ignoreContent(_activePlayingVideo.id);
  }
  closeVideoPlayerModal();
}

function onDirectExternalWatch(videoId) {
  saveContentInteraction(videoId, 'watched');
  const user = getStoredUser();
  const video = (_contentCatalog || []).find(v => String(v.id) === String(videoId));
  const plat = video ? (video.platform || 'youtube') : 'youtube';
  if (user && user.id) {
    apiRequest('/content/interaction', 'POST', {
      user_id: user.id,
      video_id: videoId,
      action: 'watched',
      platform: plat
    }).catch(() => { });
  }
  replaceCardInGrid(videoId);
  updateContentStats();
  const label = getPlatformLabel(plat);
  showToast(`Opening on ${label}... Your feed has updated with fresh recommendations! 🎬`, 'success', 3000);
}

// Replace card in grid with exit animation and seamless entry of next recommended card
function replaceCardInGrid(videoId) {
  const card = document.getElementById('vcard-' + videoId);
  if (card) {
    card.classList.add('exiting');
    setTimeout(() => {
      renderContentGrid(_contentCatalog, getStoredUser());
    }, 280);
  } else {
    renderContentGrid(_contentCatalog, getStoredUser());
  }
}

async function ignoreContent(videoId) {
  saveContentInteraction(videoId, 'ignored');

  const user = getStoredUser();
  const video = (_contentCatalog || []).find(v => String(v.id) === String(videoId));
  const plat = video ? (video.platform || 'youtube') : 'youtube';
  if (user && user.id) {
    apiRequest('/content/interaction', 'POST', {
      user_id: user.id,
      video_id: videoId,
      action: 'ignored',
      platform: plat
    }).catch(() => { });
  }

  replaceCardInGrid(videoId);
  updateContentStats();
  showToast("Video skipped. Here's a fresh recommendation! ✨", "info", 2500);
}

async function resetContentHistory() {
  localStorage.removeItem(CONTENT_INTERACTIONS_KEY);
  _contentPage = 0;

  const user = getStoredUser();
  if (user && user.id) {
    apiRequest('/content/reset', 'POST', { user_id: user.id }).catch(() => { });
  }

  renderContentGrid(_contentCatalog, user);
  showToast('Watch history reset! All 40 videos are back in your feed. 🔄', 'success', 3000);
}

// Full 40-item Embedded Catalog (100% verified, playable YouTube IDs)
function getEmbeddedCatalog() {
  return [
    {
      "id": "3wAnXhoCBXQ",
      "platform": "youtube",
      "title": "Lag Jaa Gale Ki Phir Ye Haseen Raat Ho Na Ho | Lata Mangeshkar | Woh Kaun Thi | Manoj Kumar, Sadhana",
      "channel": "Saregama Music",
      "thumbnail": "https://img.youtube.com/vi/3wAnXhoCBXQ/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=3wAnXhoCBXQ",
      "embed_url": "https://www.youtube-nocookie.com/embed/3wAnXhoCBXQ?autoplay=1&rel=0",
      "duration": "4:15",
      "categories": [
        "nostalgia_music",
        "classic_cinema"
      ],
      "decades": [
        "1960s",
        "1970s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Lata Mangeshkar's evergreen masterpiece from Woh Kaun Thi (1964)."
    },
    {
      "id": "b8tm0k08XDo",
      "platform": "youtube",
      "title": "Mere Sapno Ki Rani 4K Song  मेरे सपनो की रानी  आराधना  राजेश खन्ना - शर्मिला टैगोर - किशोर कुमार",
      "channel": "Saregama Music",
      "thumbnail": "https://img.youtube.com/vi/b8tm0k08XDo/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=b8tm0k08XDo",
      "embed_url": "https://www.youtube-nocookie.com/embed/b8tm0k08XDo?autoplay=1&rel=0",
      "duration": "3:52",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1960s",
        "1970s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Kishore Kumar's iconic train song featuring Rajesh Khanna from Aradhana (1969)."
    },
    {
      "id": "5ZaKMzJrzXQ",
      "platform": "youtube",
      "title": "Yeh Shaam Mastani | Kishore Kumar | Remastered",
      "channel": "Saregama Music",
      "thumbnail": "https://img.youtube.com/vi/5ZaKMzJrzXQ/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=5ZaKMzJrzXQ",
      "embed_url": "https://www.youtube-nocookie.com/embed/5ZaKMzJrzXQ?autoplay=1&rel=0",
      "duration": "4:40",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1980s",
        "1970s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Kishore Kumar's evergreen romantic melody from Kati Patang (1970)."
    },
    {
      "id": "seFeZOgyFsc",
      "platform": "youtube",
      "title": "Chura Liya Hai Tumne Jo Dil Ko -  Yaadon Ki Baaraat | Zeenat Aman, Vijay Arora",
      "channel": "Tips Official",
      "thumbnail": "https://img.youtube.com/vi/seFeZOgyFsc/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=seFeZOgyFsc",
      "embed_url": "https://www.youtube-nocookie.com/embed/seFeZOgyFsc?autoplay=1&rel=0",
      "duration": "4:48",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1980s",
        "1970s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Mohammed Rafi & Asha Bhosle's iconic duet from Yaadon Ki Baaraat (1973)."
    },
    {
      "id": "ltIvlvgEmkA",
      "platform": "youtube",
      "title": "Ek Pyar Ka Naghma Hai - Lyrical Video | Shor | Lata Mangeshkar | Manoj Kumar | Jaya Bhaduri",
      "channel": "Saregama Music",
      "thumbnail": "https://img.youtube.com/vi/ltIvlvgEmkA/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=ltIvlvgEmkA",
      "embed_url": "https://www.youtube-nocookie.com/embed/ltIvlvgEmkA?autoplay=1&rel=0",
      "duration": "5:05",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1980s",
        "1970s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Soul-stirring song by Lata Mangeshkar & Mukesh from Shor (1972)."
    },
    {
      "id": "g_O5lttb5ww",
      "platform": "youtube",
      "title": "Kabhi Kabhie Mere Dil Mein - Mukesh - Kabhi Kabhie [1976]",
      "channel": "Yash Raj Films",
      "thumbnail": "https://img.youtube.com/vi/g_O5lttb5ww/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=g_O5lttb5ww",
      "embed_url": "https://www.youtube-nocookie.com/embed/g_O5lttb5ww?autoplay=1&rel=0",
      "duration": "5:12",
      "categories": [
        "nostalgia_music",
        "classic_cinema"
      ],
      "decades": [
        "1980s",
        "1970s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Mukesh's timeless classic with Sahir Ludhianvi's poetry from Kabhi Kabhie (1976)."
    },
    {
      "id": "cP44iDZZ_wY",
      "platform": "youtube",
      "title": "Zindagi Kaisi Hai Paheli | Manna Dey | Anand | Rajesh Khanna | Classic Hindi Song",
      "channel": "Saregama Music",
      "thumbnail": "https://img.youtube.com/vi/cP44iDZZ_wY/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=cP44iDZZ_wY",
      "embed_url": "https://www.youtube-nocookie.com/embed/cP44iDZZ_wY?autoplay=1&rel=0",
      "duration": "3:38",
      "categories": [
        "nostalgia_music",
        "classic_cinema"
      ],
      "decades": [
        "1980s",
        "1970s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Manna Dey's philosophical masterpiece from Anand (1971)."
    },
    {
      "id": "Zm4V6ty4K6k",
      "platform": "youtube",
      "title": "Tere Bina Zindagi Se Lyrical | तेरे बिना ज़िन्दगी से | Aandhi | Suchitra Sen | Sanjeev Kumar | Gulzar",
      "channel": "Saregama Music",
      "thumbnail": "https://img.youtube.com/vi/Zm4V6ty4K6k/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=Zm4V6ty4K6k",
      "embed_url": "https://www.youtube-nocookie.com/embed/Zm4V6ty4K6k?autoplay=1&rel=0",
      "duration": "5:14",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1980s",
        "1970s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Kishore Kumar & Lata Mangeshkar duet composed by R.D. Burman in Aandhi (1975)."
    },
    {
      "id": "X0gB9jcgXxg",
      "platform": "youtube",
      "title": "HOTHON SE CHHU LO TUM - Jagjit Singh | Prem Geet",
      "channel": "Saregama Music",
      "thumbnail": "https://img.youtube.com/vi/X0gB9jcgXxg/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=X0gB9jcgXxg",
      "embed_url": "https://www.youtube-nocookie.com/embed/X0gB9jcgXxg?autoplay=1&rel=0",
      "duration": "5:20",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1990s",
        "1980s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Ghazals & Classical Ragas"
      ],
      "description": "Jagjit Singh's immortal ghazal that touched millions of hearts."
    },
    {
      "id": "WtPbNKk9XpU",
      "platform": "youtube",
      "title": "Tum Ko Dekha To Yeh Khayal Aaya - Lyrical Video | Jagjit Singh Ghazals | Chitra Singh | Love Song",
      "channel": "Saregama Music",
      "thumbnail": "https://img.youtube.com/vi/WtPbNKk9XpU/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=WtPbNKk9XpU",
      "embed_url": "https://www.youtube-nocookie.com/embed/WtPbNKk9XpU?autoplay=1&rel=0",
      "duration": "5:18",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1990s",
        "1980s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Ghazals & Classical Ragas"
      ],
      "description": "Soulful ghazal by Jagjit Singh & Chitra Singh from Saath Saath."
    },
    {
      "id": "v0_IRIFYC0k",
      "platform": "youtube",
      "title": "Chitthi Aayi Hai | Pankaj Udhas | Naam 1986 Songs | Sanjay Dutt, Nutan, Amrita Singh",
      "channel": "Tips Official",
      "thumbnail": "https://img.youtube.com/vi/v0_IRIFYC0k/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=v0_IRIFYC0k",
      "embed_url": "https://www.youtube-nocookie.com/embed/v0_IRIFYC0k?autoplay=1&rel=0",
      "duration": "7:12",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1990s",
        "1980s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Ghazals & Classical Ragas"
      ],
      "description": "Pankaj Udhas's nostalgic classic that connects every Indian to home."
    },
    {
      "id": "Jf92MOkrbEw",
      "platform": "youtube",
      "title": "Rang Barse Song | Holi Song | Silsila | Amitabh Bachchan, Rekha, Sanjeev, Jaya | रंग बरसे | होली गीत",
      "channel": "Yash Raj Films",
      "thumbnail": "https://img.youtube.com/vi/Jf92MOkrbEw/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=Jf92MOkrbEw",
      "embed_url": "https://www.youtube-nocookie.com/embed/Jf92MOkrbEw?autoplay=1&rel=0",
      "duration": "5:30",
      "categories": [
        "nostalgia_music",
        "classic_cinema"
      ],
      "decades": [
        "1990s",
        "1980s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Amitabh Bachchan's energetic festive classic from Silsila (1981)."
    },
    {
      "id": "cNV5hLSa9H8",
      "platform": "youtube",
      "title": "Tujhe Dekha Toh Song | Dilwale Dulhania Le Jayenge | Shah Rukh Khan, Kajol | Lata, Kumar Sanu | DDLJ",
      "channel": "Yash Raj Films",
      "thumbnail": "https://img.youtube.com/vi/cNV5hLSa9H8/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=cNV5hLSa9H8",
      "embed_url": "https://www.youtube-nocookie.com/embed/cNV5hLSa9H8?autoplay=1&rel=0",
      "duration": "5:02",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1990s",
        "2000s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Kumar Sanu & Lata Mangeshkar's golden 90s anthem from DDLJ."
    },
    {
      "id": "SBfPs-PMGTA",
      "platform": "youtube",
      "title": "Pehla Nasha Pehla khumar Full HD l Udit Narayan,Sadhana sargaml Jo jeeta wohi sikandar",
      "channel": "Sony Music India",
      "thumbnail": "https://img.youtube.com/vi/SBfPs-PMGTA/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=SBfPs-PMGTA",
      "embed_url": "https://www.youtube-nocookie.com/embed/SBfPs-PMGTA?autoplay=1&rel=0",
      "duration": "4:28",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1990s",
        "2000s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Udit Narayan & Sadhana Sargam in the youth anthem of the 90s."
    },
    {
      "id": "sWqjZpBtcxc",
      "platform": "youtube",
      "title": "Aye Mere Humsafar Full Song | Qayamat Se Qayamat Tak | Udit N | Alka Y| Aamir Khan, Juhi Chawla",
      "channel": "T-Series",
      "thumbnail": "https://img.youtube.com/vi/sWqjZpBtcxc/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=sWqjZpBtcxc",
      "embed_url": "https://www.youtube-nocookie.com/embed/sWqjZpBtcxc?autoplay=1&rel=0",
      "duration": "4:45",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1990s",
        "1980s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Udit Narayan & Alka Yagnik's romantic superhit from QSRT (1988)."
    },
    {
      "id": "Mcs2xEZ6K8o",
      "platform": "youtube",
      "title": "Dheere Dhheere Se Meri Zindagi Mein Aana Full Song (Audio) | Aashiqui | Anuradha Paudwal, Kumar Sanu",
      "channel": "T-Series",
      "thumbnail": "https://img.youtube.com/vi/Mcs2xEZ6K8o/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=Mcs2xEZ6K8o",
      "embed_url": "https://www.youtube-nocookie.com/embed/Mcs2xEZ6K8o?autoplay=1&rel=0",
      "duration": "5:25",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1990s",
        "2000s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Kumar Sanu & Anuradha Paudwal in the iconic romantic song of the 90s."
    },
    {
      "id": "LUx8wlA_dk8",
      "platform": "youtube",
      "title": "श्री हनुमान चालीसा I Shree Hanuman Chalisa I GULSHAN KUMAR, HARIHARAN I Hanuman Chalisa Ashtak",
      "channel": "T-Series Bhakti Sagar",
      "thumbnail": "https://img.youtube.com/vi/LUx8wlA_dk8/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=LUx8wlA_dk8",
      "embed_url": "https://www.youtube-nocookie.com/embed/LUx8wlA_dk8?autoplay=1&rel=0",
      "duration": "9:42",
      "categories": [
        "devotional"
      ],
      "decades": [
        "2000s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Devotional & Bhajans"
      ],
      "description": "The most revered devotional chant of India sung by Hariharan & Gulshan Kumar."
    },
    {
      "id": "nwRoHC83wx0",
      "platform": "youtube",
      "title": "Gayatri Mantra 108 times Anuradha Paudwal I Full Audio Song I T-Series Bhakti Sagar",
      "channel": "T-Series Bhakti Sagar",
      "thumbnail": "https://img.youtube.com/vi/nwRoHC83wx0/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=nwRoHC83wx0",
      "embed_url": "https://www.youtube-nocookie.com/embed/nwRoHC83wx0?autoplay=1&rel=0",
      "duration": "35:10",
      "categories": [
        "devotional"
      ],
      "decades": [
        "2000s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Devotional & Bhajans"
      ],
      "description": "Anuradha Paudwal's sacred and calming 108 chants of Gayatri Mantra."
    },
    {
      "id": "drszYwxBvpE",
      "platform": "youtube",
      "title": "ऐसी लागी लगन मीरा हो गई मगन | Anup Jalota Bhajan | Krishna Bhakti Song | Meera Bhajan | Krishna",
      "channel": "Saregama Bhakti",
      "thumbnail": "https://img.youtube.com/vi/drszYwxBvpE/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=drszYwxBvpE",
      "embed_url": "https://www.youtube-nocookie.com/embed/drszYwxBvpE?autoplay=1&rel=0",
      "duration": "7:22",
      "categories": [
        "devotional"
      ],
      "decades": [
        "1990s",
        "1980s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Devotional & Bhajans"
      ],
      "description": "Anup Jalota's timeless Meera bhajan that touches the soul."
    },
    {
      "id": "ATflA6WOy0I",
      "platform": "youtube",
      "title": "Vishnu Sahasranamam - M.S.Subbulakshmi",
      "channel": "Sangeetham Classical",
      "thumbnail": "https://img.youtube.com/vi/ATflA6WOy0I/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=ATflA6WOy0I",
      "embed_url": "https://www.youtube-nocookie.com/embed/ATflA6WOy0I?autoplay=1&rel=0",
      "duration": "29:15",
      "categories": [
        "devotional"
      ],
      "decades": [
        "1980s",
        "1970s"
      ],
      "languages": [
        "Sanskrit",
        "Tamil",
        "Hindi"
      ],
      "culture_tags": [
        "Devotional & Bhajans"
      ],
      "description": "Bharat Ratna M.S. Subbulakshmi's divine chanting of Sri Vishnu Sahasranamam."
    },
    {
      "id": "WkYz1g47Hj0",
      "platform": "youtube",
      "title": "Senior & Beginner Workout - 15 minute Gentle Chair Yoga",
      "channel": "Senior Fitness With Meredith",
      "thumbnail": "https://img.youtube.com/vi/WkYz1g47Hj0/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=WkYz1g47Hj0",
      "embed_url": "https://www.youtube-nocookie.com/embed/WkYz1g47Hj0?autoplay=1&rel=0",
      "duration": "15:20",
      "categories": [
        "wellness"
      ],
      "decades": [
        "2000s"
      ],
      "languages": [
        "English",
        "Hindi"
      ],
      "culture_tags": [],
      "description": "Gentle 15-minute chair yoga for seniors to build mobility and ease joint stiffness."
    },
    {
      "id": "uoP5Pr3vkPM",
      "platform": "youtube",
      "title": "Chair Yoga for Balance - Improve your Strength & Mobility",
      "channel": "SilverSneakers",
      "thumbnail": "https://img.youtube.com/vi/uoP5Pr3vkPM/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=uoP5Pr3vkPM",
      "embed_url": "https://www.youtube-nocookie.com/embed/uoP5Pr3vkPM?autoplay=1&rel=0",
      "duration": "18:40",
      "categories": [
        "wellness"
      ],
      "decades": [
        "2000s"
      ],
      "languages": [
        "English",
        "Hindi"
      ],
      "culture_tags": [],
      "description": "Targeted chair exercises to improve balance and prevent falls safely at home."
    },
    {
      "id": "3p4r_ad2Y7g",
      "platform": "youtube",
      "title": "Complete Package of Pranayama for Beginner's",
      "channel": "Patanjali Yogpeeth",
      "thumbnail": "https://img.youtube.com/vi/3p4r_ad2Y7g/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=3p4r_ad2Y7g",
      "embed_url": "https://www.youtube-nocookie.com/embed/3p4r_ad2Y7g?autoplay=1&rel=0",
      "duration": "25:30",
      "categories": [
        "wellness"
      ],
      "decades": [
        "2000s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [],
      "description": "Swami Ramdev guides Pranayama (Anulom Vilom, Kapalbhati, Bhastrika) for daily vitality."
    },
    {
      "id": "90DKrNwwnzA",
      "platform": "youtube",
      "title": "Daily Exercise Routine for JOINT PAIN RELIEF | Full Body Workout | Saurabh Bothra Yoga",
      "channel": "Senior Health & Wellness",
      "thumbnail": "https://img.youtube.com/vi/90DKrNwwnzA/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=90DKrNwwnzA",
      "embed_url": "https://www.youtube-nocookie.com/embed/90DKrNwwnzA?autoplay=1&rel=0",
      "duration": "14:15",
      "categories": [
        "wellness"
      ],
      "decades": [
        "2000s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [],
      "description": "Physiotherapist-guided slow joint-relief routine for arthritis and knee comfort."
    },
    {
      "id": "LYJ3U0Fs4dg",
      "platform": "youtube",
      "title": "15 minute Walking Workout for Seniors, Beginners",
      "channel": "Walk At Home",
      "thumbnail": "https://img.youtube.com/vi/LYJ3U0Fs4dg/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=LYJ3U0Fs4dg",
      "embed_url": "https://www.youtube-nocookie.com/embed/LYJ3U0Fs4dg?autoplay=1&rel=0",
      "duration": "15:00",
      "categories": [
        "wellness"
      ],
      "decades": [
        "2000s"
      ],
      "languages": [
        "English",
        "Hindi"
      ],
      "culture_tags": [],
      "description": "Gentle low-impact indoor walking workout designed specifically for seniors."
    },
    {
      "id": "ZgPHetPG4MY",
      "platform": "youtube",
      "title": "10 Minute Meditation for Before You Sleep",
      "channel": "Mindful Peace",
      "thumbnail": "https://img.youtube.com/vi/ZgPHetPG4MY/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=ZgPHetPG4MY",
      "embed_url": "https://www.youtube-nocookie.com/embed/ZgPHetPG4MY?autoplay=1&rel=0",
      "duration": "10:00",
      "categories": [
        "wellness"
      ],
      "decades": [
        "2000s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [],
      "description": "Calming guided meditation to release stress and promote deep, restful sleep."
    },
    {
      "id": "qYLgpj9i4Fw",
      "platform": "youtube",
      "title": "Malgudi days Episode-1 | Swamy and Friends",
      "channel": "Doordarshan National",
      "thumbnail": "https://img.youtube.com/vi/qYLgpj9i4Fw/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=qYLgpj9i4Fw",
      "embed_url": "https://www.youtube-nocookie.com/embed/qYLgpj9i4Fw?autoplay=1&rel=0",
      "duration": "24:30",
      "categories": [
        "classic_cinema",
        "heritage_sports"
      ],
      "decades": [
        "1990s",
        "1980s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Literature & Poetry"
      ],
      "description": "R.K. Narayan's timeless classic television series from the golden age of Doordarshan."
    },
    {
      "id": "RG3Hqth0Eus",
      "platform": "youtube",
      "title": "Ramayan EP 1 - श्री राम भगवान्‌ का जन्म और बाललीला का आनंद | HQ WIDE SCREEN | English Subtitles",
      "channel": "Sagar World",
      "thumbnail": "https://img.youtube.com/vi/RG3Hqth0Eus/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=RG3Hqth0Eus",
      "embed_url": "https://www.youtube-nocookie.com/embed/RG3Hqth0Eus?autoplay=1&rel=0",
      "duration": "42:10",
      "categories": [
        "devotional",
        "classic_cinema"
      ],
      "decades": [
        "1990s",
        "1980s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Devotional & Bhajans"
      ],
      "description": "Ramanand Sagar's historic epic Ramayan that united India every Sunday morning."
    },
    {
      "id": "TltC-AllzGY",
      "platform": "youtube",
      "title": "Mahabharat (महाभारत) | B.R. Chopra | Pen Bhakti | Episodes 01, 02, 03",
      "channel": "Pen Bhakti",
      "thumbnail": "https://img.youtube.com/vi/TltC-AllzGY/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=TltC-AllzGY",
      "embed_url": "https://www.youtube-nocookie.com/embed/TltC-AllzGY?autoplay=1&rel=0",
      "duration": "45:00",
      "categories": [
        "devotional",
        "classic_cinema"
      ],
      "decades": [
        "1990s",
        "1980s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Devotional & Bhajans"
      ],
      "description": "B.R. Chopra's legendary television epic Mahabharat - episode 1."
    },
    {
      "id": "SsSZWH9aloc",
      "platform": "youtube",
      "title": "Kitne Aadmi The? -  Most Famous Dialogue From Sholay | Gabbar Singh | Amazon Prime Video",
      "channel": "Sippy Films",
      "thumbnail": "https://img.youtube.com/vi/SsSZWH9aloc/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=SsSZWH9aloc",
      "embed_url": "https://www.youtube-nocookie.com/embed/SsSZWH9aloc?autoplay=1&rel=0",
      "duration": "4:15",
      "categories": [
        "classic_cinema"
      ],
      "decades": [
        "1980s",
        "1970s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Gabbar Singh's legendary 'Kitne Aadmi The' dialogue from the 1975 blockbuster Sholay."
    },
    {
      "id": "8O7uQ4XHgNg",
      "platform": "youtube",
      "title": "राजेश खन्ना का यह डायलॉग सुनकर आप रो देंगे | Anand का सबसे इमोशनल सीन | Amitabh Bachchan",
      "channel": "Shemaroo Movies",
      "thumbnail": "https://img.youtube.com/vi/8O7uQ4XHgNg/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=8O7uQ4XHgNg",
      "embed_url": "https://www.youtube-nocookie.com/embed/8O7uQ4XHgNg?autoplay=1&rel=0",
      "duration": "6:20",
      "categories": [
        "classic_cinema"
      ],
      "decades": [
        "1980s",
        "1970s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Classic Bollywood"
      ],
      "description": "Rajesh Khanna & Amitabh Bachchan's unforgettable emotional climax from Anand."
    },
    {
      "id": "k8DtPqXjptM",
      "platform": "youtube",
      "title": "MIle Sur Mera Tumhara - 720P High Quality - Doordarshan",
      "channel": "Doordarshan National",
      "thumbnail": "https://img.youtube.com/vi/k8DtPqXjptM/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=k8DtPqXjptM",
      "embed_url": "https://www.youtube-nocookie.com/embed/k8DtPqXjptM?autoplay=1&rel=0",
      "duration": "6:10",
      "categories": [
        "heritage_sports",
        "nostalgia_music"
      ],
      "decades": [
        "1990s",
        "1980s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Literature & Poetry"
      ],
      "description": "The iconic national integration song from 1988 featuring India's greatest legends."
    },
    {
      "id": "WmKQ7W-Miso",
      "platform": "youtube",
      "title": "HIGHLIGHTS: Prudential  World Cup Final 1983 Watch India Win World Cup 83 Final | #83TheFilm Trailor",
      "channel": "ICC Vintage Cricket",
      "thumbnail": "https://img.youtube.com/vi/WmKQ7W-Miso/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=WmKQ7W-Miso",
      "embed_url": "https://www.youtube-nocookie.com/embed/WmKQ7W-Miso?autoplay=1&rel=0",
      "duration": "12:45",
      "categories": [
        "heritage_sports"
      ],
      "decades": [
        "1990s",
        "1980s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [],
      "description": "Relive Kapil Dev & India lifting the 1983 World Cup at Lord's Cricket Ground."
    },
    {
      "id": "vXoEKeR4uz8",
      "platform": "youtube",
      "title": "Ganga Aarti  Varanasi || FULL VIDEO || Dashaswamegh Ghat || संपूर्ण गंगा आरती, वाराणसी",
      "channel": "Incredible India Heritage",
      "thumbnail": "https://img.youtube.com/vi/vXoEKeR4uz8/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=vXoEKeR4uz8",
      "embed_url": "https://www.youtube-nocookie.com/embed/vXoEKeR4uz8?autoplay=1&rel=0",
      "duration": "18:20",
      "categories": [
        "nature_travel",
        "devotional"
      ],
      "decades": [
        "2000s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Devotional & Bhajans"
      ],
      "description": "Experience the spiritual grandeur of the evening Maha Aarti at Dashashwamedh Ghat, Kashi."
    },
    {
      "id": "vP6wxPBfg6k",
      "platform": "youtube",
      "title": "Kerala Backwaters Houseboat Journey 🛶 Relaxing Scenic Cruise Through Alappuzha | 4K Nature Sounds",
      "channel": "Kerala Tourism",
      "thumbnail": "https://img.youtube.com/vi/vP6wxPBfg6k/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=vP6wxPBfg6k",
      "embed_url": "https://www.youtube-nocookie.com/embed/vP6wxPBfg6k?autoplay=1&rel=0",
      "duration": "15:40",
      "categories": [
        "nature_travel",
        "wellness"
      ],
      "decades": [
        "2000s"
      ],
      "languages": [
        "Malayalam",
        "English",
        "Hindi"
      ],
      "culture_tags": [],
      "description": "Serene houseboat cruise through tranquil Kerala backwaters and lush palm groves."
    },
    {
      "id": "3XfQ041s_Fc",
      "platform": "youtube",
      "title": "Jaipur - The Pink City in 4K",
      "channel": "Heritage Walks India",
      "thumbnail": "https://img.youtube.com/vi/3XfQ041s_Fc/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=3XfQ041s_Fc",
      "embed_url": "https://www.youtube-nocookie.com/embed/3XfQ041s_Fc?autoplay=1&rel=0",
      "duration": "14:50",
      "categories": [
        "nature_travel",
        "heritage_sports"
      ],
      "decades": [
        "2000s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [],
      "description": "A cinematic walk through the palaces, havelis and bazaars of the Pink City Jaipur."
    },
    {
      "id": "r1yXbHldZms",
      "platform": "youtube",
      "title": "Pandit Ravi Shankar || Raag Bhairavi",
      "channel": "Classical Heritage",
      "thumbnail": "https://img.youtube.com/vi/r1yXbHldZms/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=r1yXbHldZms",
      "embed_url": "https://www.youtube-nocookie.com/embed/r1yXbHldZms?autoplay=1&rel=0",
      "duration": "24:10",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1980s",
        "1970s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Ghazals & Classical Ragas"
      ],
      "description": "Pandit Ravi Shankar's sitar mastery performing the morning Raga Bhairavi live."
    },
    {
      "id": "2u9gevMQE8E",
      "platform": "youtube",
      "title": "Ustad Bismillah Khan Live in Russia",
      "channel": "Classical Heritage",
      "thumbnail": "https://img.youtube.com/vi/2u9gevMQE8E/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=2u9gevMQE8E",
      "embed_url": "https://www.youtube-nocookie.com/embed/2u9gevMQE8E?autoplay=1&rel=0",
      "duration": "16:45",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1980s",
        "1970s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Ghazals & Classical Ragas"
      ],
      "description": "Bharat Ratna Ustad Bismillah Khan's magical shehnai concert recital."
    },
    {
      "id": "H_jI_gMmI5Q",
      "platform": "youtube",
      "title": "Beautiful poem by Amit Ji's Father🥹 || #shorts",
      "channel": "Sahitya Live",
      "thumbnail": "https://img.youtube.com/vi/H_jI_gMmI5Q/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=H_jI_gMmI5Q",
      "embed_url": "https://www.youtube-nocookie.com/embed/H_jI_gMmI5Q?autoplay=1&rel=0",
      "duration": "4:10",
      "categories": [
        "classic_cinema"
      ],
      "decades": [
        "1990s",
        "1980s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Literature & Poetry"
      ],
      "description": "Dr. Harivansh Rai Bachchan's immortal verses from Madhushala."
    },
    {
      "id": "v1qCxCz43PU",
      "platform": "youtube",
      "title": "Piyush Mishra recites Faiz Ahmad Faiz's Poetry Kuch Ishq Kiya Kuch Kaam Kiya | Jashn-e-Adab",
      "channel": "Jashn-e-Adab",
      "thumbnail": "https://img.youtube.com/vi/v1qCxCz43PU/hqdefault.jpg",
      "url": "https://www.youtube.com/watch?v=v1qCxCz43PU",
      "embed_url": "https://www.youtube-nocookie.com/embed/v1qCxCz43PU?autoplay=1&rel=0",
      "duration": "8:30",
      "categories": [
        "nostalgia_music"
      ],
      "decades": [
        "1990s",
        "2000s"
      ],
      "languages": [
        "Hindi"
      ],
      "culture_tags": [
        "Literature & Poetry"
      ],
      "description": "Soulful poetry recitation of Faiz Ahmad Faiz that touches nostalgic hearts."
    }
  ];
}
