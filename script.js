// --- Configuration ---
const providedFirebaseConfig = {
    apiKey: "AIzaSyDWb0JNy_Ogf8ZB-SXVofol_6sfZvgY4qY",
    authDomain: "doodle-studio-1bbdc.firebaseapp.com",
    projectId: "doodle-studio-1bbdc",
    storageBucket: "doodle-studio-1bbdc.firebasestorage.app",
    messagingSenderId: "282494504927",
    appId: "1:282494504927:web:e0abb99050144472377e6a",
};

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : providedFirebaseConfig;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// IMPORTANT: Replace this with your own YouTube Data API v3 key if it's not working
const API_KEY = "AIzaSyCVR2yEuS5ZaqLV6nPCAXVsK5yU04WNiUk"; 
const CHANNEL_ID = "UCk4C4vuYLREz3ocUX1d-gfg";

// Firebase Service placeholders
let db = null;
let auth = null;
let currentUserId = 'anonymous';
let featuredVideoId = null;

// DOM elements
const totalViewsEl = document.getElementById('total-views');
const subscriberCountEl = document.getElementById('subscriber-count');
const videoCountEl = document.getElementById('video-count');
const shortsStatusEl = document.getElementById('shorts-status');
const shortsContainerEl = document.getElementById('latest-shorts-container');
const playlistsStatusEl = document.getElementById('playlists-status');
const playlistsContainerEl = document.getElementById('playlists-container');
const widgetSubscriberCountEl = document.getElementById('widget-subscriber-count');
const channelLogoEl = document.getElementById('channel-logo');
const featuredShortContainerEl = document.getElementById('featured-short-container');
const featuredShortLoadingEl = document.getElementById('featured-short-loading');
const themeToggleEl = document.getElementById('theme-toggle');
const sunIcon = document.getElementById('sun-icon');
const moonIcon = document.getElementById('moon-icon');
const gameButton = document.getElementById('game-button');
const startGameBtn = document.getElementById('start-game-btn');
const saveScoreBtn = document.getElementById('save-score-btn');
const leaderboardBodyEl = document.getElementById('leaderboard-body');
const commentsContainer = document.getElementById('comments-container');
const commentYoutubeLink = document.getElementById('comment-youtube-link');
const reviewsContainerEl = document.getElementById('reviews-container');
const reviewsStatusEl = document.getElementById('reviews-status');

let score = 0;
let gameInterval;

// --- Helper Functions ---
function getLuminance(r, g, b) {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function formatNumber(numString) {
    const num = parseInt(numString);
    if (isNaN(num)) return numString;
    const format = (n, d) => (n / d).toFixed(1).replace(/\.0$/, '');
    if (num >= 1000000) return format(num, 1000000) + 'M';
    if (num >= 1000) return format(num, 1000) + 'K';
    return num.toString();
}

// --- Theme Logic ---
function updateThemeIcons(theme) {
    const isDark = theme === 'dark';
    sunIcon.classList.toggle('hidden', isDark);
    moonIcon.classList.toggle('hidden', !isDark);
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcons(newTheme);
}

const storedTheme = localStorage.getItem('theme') || 'dark';
document.body.setAttribute('data-theme', storedTheme);
themeToggleEl.addEventListener('click', toggleTheme);

// --- Dynamic Color Logic ---
function setDynamicAccent(imgUrl) {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 1;
        canvas.height = 1;

        try {
            ctx.drawImage(img, 0, 0, 1, 1);
            const data = ctx.getImageData(0, 0, 1, 1).data;
            const r = data[0], g = data[1], b = data[2];
            
            const colorRgb = `${r}, ${g}, ${b}`;
            const hexColor = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
            
            document.documentElement.style.setProperty('--dynamic-accent', hexColor);
            document.documentElement.style.setProperty('--dynamic-shadow-color', colorRgb);

            const luminance = getLuminance(r, g, b);
            const ctaButton = document.querySelector('.cta-button');
            if (ctaButton) {
                ctaButton.classList.toggle('text-white', luminance > 0.7);
                ctaButton.classList.toggle('text-gray-900', luminance < 0.7);
            }
        } catch (e) {
            console.error("Color analysis failed:", e);
            document.documentElement.style.setProperty('--dynamic-accent', '#fde68a');
            document.documentElement.style.setProperty('--dynamic-shadow-color', '253, 230, 138');
        }
    };
    img.onerror = function() {
        console.warn("Could not load thumbnail for color analysis.");
    };
    img.src = imgUrl;
}

// --- YouTube API Fetchers / Render Functions ---
async function fetchChannelData(API_KEY, CHANNEL_ID) {
    const apiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${CHANNEL_ID}&key=${API_KEY}`;
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`Failed to fetch channel data: HTTP status ${response.status}`);
    const data = await response.json();
    if (data.items && data.items.length > 0) return data.items[0];
    throw new Error("Channel data not found.");
}

async function fetchLatestShorts(API_KEY, CHANNEL_ID) {
    const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&maxResults=5&order=date&type=video&key=${API_KEY}`;
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`Failed to fetch shorts: HTTP status ${response.status}`);
    const data = await response.json();
    return data.items;
}

async function fetchPlaylists(API_KEY, CHANNEL_ID) {
    const apiUrl = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&channelId=${CHANNEL_ID}&maxResults=2&key=${API_KEY}`;
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`Failed to fetch playlists: HTTP status ${response.status}`);
    const data = await response.json();
    return data.items;
}

async function fetchChannelReviews(API_KEY, CHANNEL_ID) {
    // 1. Get the 10 most recent videos to source comments from
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL_ID}&maxResults=10&order=date&type=video&key=${API_KEY}`;
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) throw new Error('Failed to fetch latest videos for reviews');
    const searchData = await searchResponse.json();
    const videos = searchData.items || [];

    if (videos.length === 0) return []; // No videos found

    // 2. Create an array of promises to fetch comments for each video
    const commentPromises = videos.map(video => {
        const videoId = video.id.videoId;
        const commentsUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&key=${API_KEY}&order=relevance&maxResults=3`;
        return fetch(commentsUrl).then(res => res.ok ? res.json() : null).catch(() => null);
    });

    // 3. Wait for all comment fetches to complete
    const results = await Promise.all(commentPromises);

    // 4. Consolidate all valid comments into a single array
    let allComments = [];
    results.forEach(result => {
        if (result && result.items) {
            allComments = allComments.concat(result.items);
        }
    });

    // 5. Filter for more substantial comments
    const filteredComments = allComments.filter(item => 
        item.snippet?.topLevelComment?.snippet?.textDisplay.length > 25
    );

    // 6. Shuffle the comments for variety
    for (let i = filteredComments.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [filteredComments[i], filteredComments[j]] = [filteredComments[j], filteredComments[i]];
    }
    
    // 7. Return up to 6 comments to display
    return filteredComments.slice(0, 6);
}


function renderFeaturedShort(video) {
    if (featuredShortLoadingEl) featuredShortLoadingEl.remove();
    if (!video) {
        if(featuredShortContainerEl) featuredShortContainerEl.innerHTML = '<p class="text-gray-400">No featured short available.</p>';
        return;
    }
    const videoId = video.id.videoId;
    featuredVideoId = videoId;
    const title = video.snippet.title.replace(/\| Doodle Studio.*(Shorts)?/, '').trim();
    const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0&autoplay=0`;
    if(featuredShortContainerEl) featuredShortContainerEl.innerHTML = `
        <div class="relative w-full max-w-sm mx-auto shadow-2xl rounded-xl overflow-hidden shadow-cyan-500/50">
            <div class="pb-9/16 relative">
                <iframe 
                    class="absolute top-0 left-0 w-full h-full"
                    src="${embedUrl}" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen
                    title="${title}"
                ></iframe>
            </div>
            <p class="mt-3 text-lg font-semibold text-gray-400">"${title}"</p>
        </div>
    `;
    if(commentYoutubeLink) commentYoutubeLink.href = `https://www.youtube.com/watch?v=${videoId}`;
    fetchYouTubeComments(videoId);
}

function renderShorts(videos) {
    if (shortsStatusEl) shortsStatusEl.remove();
    if (!videos || videos.length === 0) {
        if(shortsContainerEl) shortsContainerEl.innerHTML = '<p class="col-span-full text-gray-400">No recent shorts found.</p>';
        return;
    }
    let htmlContent = '';
    videos.forEach(item => {
        const videoId = item.id.videoId;
        const title = item.snippet.title.replace(/\| Doodle Studio.*(Shorts)?/, '').trim();
        const thumbnailUrl = item.snippet.thumbnails.high.url;
        const embedUrl = `https://www.youtube.com/watch?v=${videoId}`;
        htmlContent += `
            <a href="${embedUrl}" target="_blank" rel="noopener noreferrer" 
               class="group block w-full max-w-[200px] hover:scale-[1.03] transition duration-300 ease-in-out transform">
                <div class="relative overflow-hidden rounded-xl shadow-lg shadow-cyan-500/30">
                    <div class="pb-9/16 relative"> 
                        <img src="${thumbnailUrl}" alt="${title}" class="absolute top-0 left-0 w-full h-full object-cover">
                    </div>
                    <div class="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent"></div>
                    <p class="absolute bottom-0 left-0 p-3 text-xs font-semibold text-white text-left 
                              group-hover:text-yellow-400 transition duration-300">
                        ${title}
                    </p>
                </div>
            </a>
        `;
    });
    if(shortsContainerEl) shortsContainerEl.innerHTML = htmlContent;
}

function renderPlaylists(playlists) {
    if (playlistsStatusEl) playlistsStatusEl.remove();
    if (!playlists || playlists.length === 0) {
        if(playlistsContainerEl) playlistsContainerEl.innerHTML = '<p class="col-span-full text-gray-400">No public playlists found yet. Stay tuned!</p>';
        return;
    }
    let htmlContent = '';
    playlists.forEach(item => {
        const playlistId = item.id;
        const title = item.snippet.title.trim();
        const thumbnailUrl = item.snippet.thumbnails.high.url;
        const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
        htmlContent += `
            <a href="${playlistUrl}" target="_blank" rel="noopener noreferrer" 
               class="group block w-full hover:scale-[1.03] transition duration-300 ease-in-out transform">
                <div class="relative overflow-hidden rounded-xl shadow-lg shadow-yellow-500/30">
                    <img src="${thumbnailUrl}" alt="Playlist: ${title}" class="w-full h-auto object-cover aspect-video">
                    <div class="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent flex items-end">
                        <p class="p-3 text-sm font-semibold text-white text-left 
                                  group-hover:text-cyan-400 transition duration-300 truncate w-full">
                            ${title}
                        </p>
                    </div>
                    <div class="absolute top-0 right-0 p-2 bg-black/50 rounded-bl-lg text-white text-xs font-bold flex items-center">
                        <span class="mr-1">🎵</span>
                        Playlist
                    </div>
                </div>
            </a>
        `;
    });
    if(playlistsContainerEl) playlistsContainerEl.innerHTML = htmlContent;
}

function renderReviews(comments) {
    if (reviewsStatusEl) reviewsStatusEl.remove();
    if (!comments || comments.length === 0) {
        if (reviewsContainerEl) reviewsContainerEl.innerHTML = '<p class="col-span-full text-gray-400">No public comments found yet. Be the first!</p>';
        return;
    }

    let htmlContent = '';
    comments.forEach(item => {
        const comment = item.snippet.topLevelComment.snippet;
        const authorName = comment.authorDisplayName;
        const authorImg = comment.authorProfileImageUrl;
        const commentText = comment.textDisplay;
        const videoId = comment.videoId;
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        const truncatedText = commentText.length > 150 ? commentText.substring(0, 150) + '...' : commentText;

        htmlContent += `
            <div class="p-6 bg-gray-800 rounded-xl shadow-lg hover:shadow-yellow-500/30 transition duration-300 flex flex-col justify-between">
                <div class="flex items-start space-x-4 mb-4">
                    <img src="${authorImg}" alt="${authorName}" class="w-12 h-12 rounded-full object-cover border-2 border-gray-600">
                    <div>
                        <p class="font-bold text-md text-yellow-400">${authorName}</p>
                        <a href="${videoUrl}" target="_blank" rel="noopener noreferrer" class="text-xs text-gray-500 hover:text-cyan-400 transition">on a video</a>
                    </div>
                </div>
                <blockquote class="text-gray-300 text-sm italic border-l-4 border-gray-700 pl-4">
                    ${truncatedText}
                </blockquote>
            </div>
        `;
    });
    if (reviewsContainerEl) reviewsContainerEl.innerHTML = htmlContent;
}

// --- Game Logic ---
function startGame() {
    score = 0;
    document.getElementById('game-score').textContent = '0';
    document.getElementById('game-message').textContent = 'TAP NOW!';
    saveScoreBtn.classList.add('hidden');
    gameButton.disabled = false;
    
    let timeLeft = 10;
    document.getElementById('game-timer').textContent = `${timeLeft}s`;

    gameInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('game-timer').textContent = `${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(gameInterval);
            endGame();
        }
    }, 1000);
}

function recordHit() {
    if (gameInterval) {
        score++;
        document.getElementById('game-score').textContent = score;
        gameButton.classList.add('scale-110');
        setTimeout(() => gameButton.classList.remove('scale-110'), 100);
    }
}

function endGame() {
    gameButton.disabled = true;
    document.getElementById('game-message').textContent = `SCORE: ${score}`;
    saveScoreBtn.classList.remove('hidden');
}

// --- Firebase Logic ---
async function initializeFirebase() {
    if (!window.firebase || !firebaseConfig) {
        console.warn("Firebase configuration is invalid. Interactive features are disabled.");
        if(leaderboardBodyEl) leaderboardBodyEl.innerHTML = '<tr><td colspan="3" class="text-center py-2 text-red-400">Leaderboard Disabled</td></tr>';
        if(document.getElementById('current-user-id')) document.getElementById('current-user-id').textContent = 'N/A';
        return;
    }
    
    const { initializeApp, getFirestore, getAuth, setLogLevel, signInWithCustomToken, signInAnonymously, onAuthStateChanged } = window.firebase;

    try {
        const firebaseApp = initializeApp(firebaseConfig);
        db = getFirestore(firebaseApp);
        auth = getAuth(firebaseApp);
        setLogLevel('error');

        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
    } catch (e) {
        console.error("Firebase Initialization or Auth failed:", e);
        if(document.getElementById('current-user-id')) document.getElementById('current-user-id').textContent = 'Auth Failed';
        if(leaderboardBodyEl) leaderboardBodyEl.innerHTML = '<tr><td colspan="3" class="text-center py-2 text-red-400">Auth Failed. Score saving disabled.</td></tr>';
        loadLeaderboard();
        return;
    }

    onAuthStateChanged(auth, (user) => {
        currentUserId = user ? user.uid : (localStorage.getItem('anon_id') || crypto.randomUUID());
        if (!user) localStorage.setItem('anon_id', currentUserId);
        
        if(document.getElementById('current-user-id')) document.getElementById('current-user-id').textContent = currentUserId;
        loadLeaderboard();
    });
}

async function saveScore() {
    if (!db) return console.error("Firestore not initialized. Cannot save score.");
    
    const scoreToSave = score;
    if (scoreToSave === 0) {
        if(document.getElementById('game-message')) document.getElementById('game-message').textContent = "Score must be > 0 to save!";
        return;
    }

    if (!auth.currentUser) {
        console.error("User is not authenticated. Cannot save score.");
        if(document.getElementById('game-message')) document.getElementById('game-message').textContent = "Cannot save. Auth failed.";
        return;
    }
    
    const { collection, addDoc, serverTimestamp } = window.firebase;
    const path = `artifacts/${appId}/public/data/scores`;
    const scoresRef = collection(db, path);
    
    const playerName = prompt("Enter your name (max 10 chars):") || "Anon Tapper";
    const displayName = playerName.substring(0, 10);
    
    try {
        await addDoc(scoresRef, {
            userId: currentUserId,
            name: displayName,
            score: scoreToSave,
            timestamp: serverTimestamp()
        });
        if(document.getElementById('game-message')) document.getElementById('game-message').textContent = `Score saved by ${displayName}! Play again?`;
        if(saveScoreBtn) saveScoreBtn.classList.add('hidden');
    } catch (e) {
        console.error("Error adding document: ", e);
        if(document.getElementById('game-message')) document.getElementById('game-message').textContent = "Error saving score.";
    }
}

function loadLeaderboard() {
    if (!db) return;
    
    const { collection, onSnapshot } = window.firebase;
    const path = `artifacts/${appId}/public/data/scores`;
    const scoresRef = collection(db, path);
    if(leaderboardBodyEl) leaderboardBodyEl.innerHTML = '<tr><td colspan="3" class="text-center py-2 text-gray-500">Loading leaderboard...</td></tr>';

    try {
        onSnapshot(scoresRef, (snapshot) => {
            const scores = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                scores.push({ ...data, id: doc.id });
            });

            scores.sort((a, b) => (b.score || 0) - (a.score || 0));
            const topScores = scores.slice(0, 10);

            let html = '';
            if (topScores.length === 0) {
                html = '<tr><td colspan="3" class="text-center py-2 text-gray-500">No scores posted yet!</td></tr>';
            } else {
                topScores.forEach((s, index) => {
                    const rowClass = s.userId === currentUserId ? 'bg-cyan-900/50' : (index % 2 === 0 ? 'bg-gray-800' : 'bg-gray-700');
                    html += `
                        <tr class="${rowClass} hover:bg-gray-600 transition duration-150">
                            <td class="p-3 font-bold">${index + 1}</td>
                            <td class="p-3 truncate">${s.name || 'Anon'}</td>
                            <td class="p-3 font-extrabold dynamic-text-color">${s.score}</td>
                        </tr>
                    `;
                });
            }
            if(leaderboardBodyEl) leaderboardBodyEl.innerHTML = html;
        }, (error) => {
            console.error("Error getting leaderboard: ", error);
            if(leaderboardBodyEl) leaderboardBodyEl.innerHTML = '<tr><td colspan="3" class="text-center py-2 text-red-400">Error loading leaderboard.</td></tr>';
        });
    } catch (e) {
        console.error("Error setting up leaderboard snapshot:", e);
    }
}

// --- YouTube Comments Logic ---
async function fetchYouTubeComments(videoId) {
    if (!videoId) return;
    if(commentsContainer) commentsContainer.innerHTML = '<div class="flex justify-center items-center p-4"><span class="spinner"></span><p class="ml-3 text-gray-400">Loading comments...</p></div>';
    try {
        const apiUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&key=${API_KEY}&order=relevance&maxResults=10`;
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP status ${response.status}`);
        const data = await response.json();
        renderYouTubeComments(data.items);
    } catch (error) {
        console.error("Error fetching YouTube comments:", error);
        if(commentsContainer) commentsContainer.innerHTML = `<p class="text-center text-red-400">Could not load YouTube comments.</p>`;
    }
}

function renderYouTubeComments(comments) {
    if (!comments || comments.length === 0) {
        if(commentsContainer) commentsContainer.innerHTML = '<p class="text-center text-gray-500">No comments found on YouTube yet.</p>';
        return;
    }
    let html = '';
    comments.forEach(item => {
        const comment = item.snippet.topLevelComment.snippet;
        const authorName = comment.authorDisplayName;
        const authorImg = comment.authorProfileImageUrl;
        const commentText = comment.textDisplay;
        const publishedAt = new Date(comment.publishedAt).toLocaleDateString();
        html += `
            <div class="p-4 rounded-lg bg-gray-800 flex items-start space-x-4">
                <img src="${authorImg}" alt="${authorName}" class="w-10 h-10 rounded-full">
                <div class="flex-1 text-left">
                    <div class="flex items-center justify-between mb-1">
                        <p class="font-bold text-sm text-cyan-400">${authorName}</p>
                        <p class="text-xs text-gray-500">${publishedAt}</p>
                    </div>
                    <p class="text-gray-300 text-sm">${commentText}</p>
                </div>
            </div>
        `;
    });
    if(commentsContainer) commentsContainer.innerHTML = html;
}

// --- Main Execution ---
async function fetchYouTubeData() {
    if (API_KEY === "YOUR_YOUTUBE_API_KEY" || CHANNEL_ID === "YOUR_YOUTUBE_CHANNEL_ID") {
        console.error("API key or Channel ID is missing or incorrect. Please update script.js.");
        if(totalViewsEl) totalViewsEl.innerHTML = 'N/A';
        if(subscriberCountEl) subscriberCountEl.innerHTML = 'N/A';
        if(videoCountEl) videoCountEl.innerHTML = 'N/A';
        if (widgetSubscriberCountEl) widgetSubscriberCountEl.textContent = 'Setup API Keys';
        if(featuredShortContainerEl) featuredShortContainerEl.innerHTML = '<p class="text-red-400">API Setup Required.</p>';
        if (shortsStatusEl) shortsStatusEl.textContent = "API configuration error.";
        if (playlistsStatusEl) playlistsStatusEl.textContent = "API configuration error.";
        if (reviewsStatusEl) reviewsStatusEl.remove();
        if(reviewsContainerEl) reviewsContainerEl.innerHTML = `<p class="col-span-full text-red-400">API configuration error.</p>`;
        return;
    }
    
    try {
        const [channelData, videos, playlists, reviews] = await Promise.all([
            fetchChannelData(API_KEY, CHANNEL_ID),
            fetchLatestShorts(API_KEY, CHANNEL_ID),
            fetchPlaylists(API_KEY, CHANNEL_ID),
            fetchChannelReviews(API_KEY, CHANNEL_ID)
        ]);

        const stats = channelData.statistics;
        const snippet = channelData.snippet;

        if(totalViewsEl) totalViewsEl.textContent = formatNumber(stats.viewCount);
        const formattedSubs = stats.hiddenSubscriberCount ? 'Hidden' : formatNumber(stats.subscriberCount);
        if(subscriberCountEl) subscriberCountEl.textContent = formattedSubs;
        if(videoCountEl) videoCountEl.textContent = formatNumber(stats.videoCount);
        if (widgetSubscriberCountEl) {
            widgetSubscriberCountEl.textContent = `${formattedSubs} Subscribers`;
        }
        if (channelLogoEl && snippet.thumbnails?.high?.url) {
            channelLogoEl.src = snippet.thumbnails.high.url;
        }
        if (videos.length > 0 && videos[0].snippet.thumbnails?.high?.url) {
            setDynamicAccent(videos[0].snippet.thumbnails.high.url);
        }
        renderFeaturedShort(videos[0]);
        renderShorts(videos);
        renderPlaylists(playlists);
        renderReviews(reviews);

    } catch (error) {
        console.error("Error fetching YouTube data:", error);
        
        if(totalViewsEl) totalViewsEl.innerHTML = 'Error';
        if(subscriberCountEl) subscriberCountEl.innerHTML = 'Error';
        if(videoCountEl) videoCountEl.innerHTML = 'Error';
        if (widgetSubscriberCountEl) widgetSubscriberCountEl.textContent = 'Error loading stats';
        
        if (featuredShortLoadingEl) featuredShortLoadingEl.remove();
        if(featuredShortContainerEl) featuredShortContainerEl.innerHTML = '<p class="text-red-400">Error loading featured video.</p>';
        if (shortsStatusEl) shortsStatusEl.remove();
        if(shortsContainerEl) shortsContainerEl.innerHTML = `<p class="col-span-full text-red-400">Error loading shorts.</p>`;
        if (playlistsStatusEl) playlistsStatusEl.remove();
        if(playlistsContainerEl) playlistsContainerEl.innerHTML = `<p class="col-span-full text-red-400">Error loading playlists.</p>`;
        if (reviewsStatusEl) reviewsStatusEl.remove();
        if(reviewsContainerEl) reviewsContainerEl.innerHTML = `<p class="col-span-full text-red-400">Error loading reviews.</p>`;
    }
}

async function main() {
    await Promise.all([
        fetchYouTubeData(),
        initializeFirebase()
    ]).catch(err => {
        console.error("A critical error occurred during initialization:", err);
    });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    main();

    if (startGameBtn) startGameBtn.addEventListener('click', startGame);
    if (gameButton) gameButton.addEventListener('click', recordHit);
    if (saveScoreBtn) saveScoreBtn.addEventListener('click', saveScore);
});

