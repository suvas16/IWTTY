const socket = io({
    transports: ['websocket'] // <--- CRUCIAL: Forces the browser to use WebSockets
});

const messagesContainer = document.getElementById('messages');
const chatForm = document.getElementById('chat-form');
const msgInput = document.getElementById('msg-input');
const imageInput = document.getElementById('image-input');
const userIdentity = document.getElementById('my-username');

// Reply UI elements
const replyPreview = document.getElementById('reply-preview');
const replyTargetUser = document.getElementById('reply-target-user');
const replyTargetText = document.getElementById('reply-target-text');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');

// Search UI elements
const searchToggleBtn = document.getElementById('search-toggle-btn');
const searchBarContainer = document.getElementById('search-bar-container');
const searchInput = document.getElementById('search-input');
const searchResultsCount = document.getElementById('search-results-count');
const searchPrevBtn = document.getElementById('search-prev-btn');
const searchNextBtn = document.getElementById('search-next-btn');

let myName = "";
let selectedReplyMsgId = null; 

// Search variables tracking state
let searchMatches = [];
let currentMatchIndex = -1;

// 1. Name Prompt Setup
let chosenName = prompt("Enter your name to join the chat:");
if (!chosenName || chosenName.trim() === "") {
    chosenName = "Guest_" + Math.floor(Math.random() * 1000);
} else {
    chosenName = chosenName.trim().substring(0, 15);
}
socket.emit('join_room', chosenName);

socket.on('init', (username) => {
    myName = username;
    userIdentity.textContent = `You are: ${username}`;
});

socket.on('load_history', (history) => {
    history.forEach((msg) => {
        const type = (msg.user === myName) ? 'me' : 'them';
        appendMessage(msg, type);
    });
});

socket.on('room_full', (alertMsg) => {
    alert(alertMsg);
    document.body.innerHTML = `<div style="color: white; text-align:center; margin-top: 50px;">${alertMsg}</div>`;
});

// 2. Chat Processing Events
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = msgInput.value.trim();
    if (!text) return;

    sendMessage({ text: text });
    msgInput.value = '';
});

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        sendMessage({ image: event.target.result });
    };
    reader.readAsDataURL(file);
    imageInput.value = "";
});

function sendMessage(content) {
    const messageData = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        text: content.text || null,
        image: content.image || null,
        replyTo: selectedReplyMsgId
    };

    socket.emit('chat_message', messageData);
    appendMessage({ ...messageData, user: myName, timestamp: Date.now() }, 'me');
    clearReply();
    
    // Clear active searches if a new message comes in
    if (searchBarContainer.style.display !== 'none') performSearch(); 
}

socket.on('chat_message', (data) => {
    appendMessage(data, 'them');
    if (searchBarContainer.style.display !== 'none') performSearch();
});

socket.on('system_message', (text) => {
    const el = document.createElement('div');
    el.className = 'system-msg';
    el.textContent = text;
    messagesContainer.appendChild(el);
    scrollToBottom();
});

function appendMessage(data, type) {
    const wrapper = document.createElement('div');
    wrapper.className = `msg-wrapper ${type}`;
    wrapper.id = data.id;

    if (type === 'them') {
        const nameEl = document.createElement('div');
        nameEl.className = 'sender-name';
        nameEl.textContent = data.user;
        wrapper.appendChild(nameEl);
    }

    const bubbleContainer = document.createElement('div');
    bubbleContainer.className = 'bubble-container';
    
    bubbleContainer.addEventListener('dblclick', () => {
        setupReply(data);
    });

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (data.replyTo) {
        const quoteBox = document.createElement('div');
        quoteBox.className = 'reply-quote';
        const originalMsg = document.getElementById(data.replyTo);
        const originalUser = originalMsg ? originalMsg.querySelector('.sender-name')?.textContent || 'User' : 'Someone';
        const originalText = originalMsg ? originalMsg.querySelector('.text-node')?.textContent || '📷 Image' : 'Message';
        
        quoteBox.innerHTML = `<span class="reply-user-title">${originalUser}</span> ${originalText}`;
        bubble.appendChild(quoteBox);
    }

    if (data.text) {
        const textSpan = document.createElement('span');
        textSpan.className = 'text-node';
        // Save raw string in data attribute to make text queries easier to rewrite dynamically
        textSpan.setAttribute('data-raw-text', data.text); 
        textSpan.textContent = data.text;
        bubble.appendChild(textSpan);
    } else if (data.image) {
        const img = document.createElement('img');
        img.src = data.image;
        img.className = 'bubble-image';
        bubble.appendChild(img);
    }

    const timeFormatted = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timeEl = document.createElement('div');
    timeEl.className = 'timestamp';
    timeEl.textContent = timeFormatted;
    
    bubble.appendChild(timeEl);
    bubbleContainer.appendChild(bubble);
    wrapper.appendChild(bubbleContainer);
    messagesContainer.appendChild(wrapper);
    scrollToBottom();
}

// 3. Reply State Controllers
function setupReply(data) {
    selectedReplyMsgId = data.id;
    replyTargetUser.textContent = `${data.user}: `;
    replyTargetText.textContent = data.text ? data.text : "📷 Photo";
    replyPreview.style.display = 'flex';
    msgInput.focus();
}
cancelReplyBtn.addEventListener('click', clearReply);
function clearReply() {
    selectedReplyMsgId = null;
    replyPreview.style.display = 'none';
}

// 4. NEW: Core Search Functionality
searchToggleBtn.addEventListener('click', () => {
    if (searchBarContainer.style.display === 'none') {
        searchBarContainer.style.display = 'flex';
        searchInput.focus();
    } else {
        searchBarContainer.style.display = 'none';
        searchInput.value = '';
        clearSearchHighlights();
    }
});

searchInput.addEventListener('input', performSearch);
searchNextBtn.addEventListener('click', () => navigateSearch(1));
searchPrevBtn.addEventListener('click', () => navigateSearch(-1));

function performSearch() {
    clearSearchHighlights();
    const query = searchInput.value.trim().toLowerCase();
    
    if (!query) {
        searchResultsCount.textContent = "0/0";
        return;
    }

    const textNodes = document.querySelectorAll('.text-node');
    searchMatches = [];
    currentMatchIndex = -1;

    textNodes.forEach((node) => {
        const rawText = node.getAttribute('data-raw-text');
        if (rawText.toLowerCase().includes(query)) {
            // Regex to match search string safely without case worries
            const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
            node.innerHTML = rawText.replace(regex, `<mark class="search-highlight">$1</mark>`);
            
            // Add all created highlights inside this node to matches tracking array
            node.querySelectorAll('mark.search-highlight').forEach((mark) => {
                searchMatches.push(mark);
            });
        }
    });

    if (searchMatches.length > 0) {
        currentMatchIndex = 0;
        jumpToMatch(currentMatchIndex);
    } else {
        searchResultsCount.textContent = "0/0";
    }
}

function navigateSearch(direction) {
    if (searchMatches.length === 0) return;

    currentMatchIndex += direction;
    // Keep indexing looping seamlessly
    if (currentMatchIndex >= searchMatches.length) currentMatchIndex = 0;
    if (currentMatchIndex < 0) currentMatchIndex = searchMatches.length - 1;

    jumpToMatch(currentMatchIndex);
}

function jumpToMatch(index) {
    // Drop active coloring indicator off old node selection paths
    searchMatches.forEach(m => m.classList.remove('active-match'));
    
    const activeMark = searchMatches[index];
    activeMark.classList.add('active-match');
    
    // Update counter text 1-based index view adjustment
    searchResultsCount.textContent = `${index + 1}/${searchMatches.length}`;
    
    // Smooth scroll current item match into screen viewport focus point
    activeMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearSearchHighlights() {
    document.querySelectorAll('.text-node').forEach((node) => {
        const rawText = node.getAttribute('data-raw-text');
        if (rawText) node.textContent = rawText; // Restores plain text dropping HTML tags
    });
    searchMatches = [];
    currentMatchIndex = -1;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scrollToBottom() {
    if (searchBarContainer.style.display === 'none' || searchMatches.length === 0) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}
