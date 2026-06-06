// ============ MULTIPLAYER SYSTEM ============
let isMultiplayer = false;
let multiplayerWebSocket = null;
let currentPlayerId = null;
let currentRoomCode = null;
let isHostPlayer = false;
let connectedPlayers = [];

// Auto-roll timer for multiplayer (20 second timeout)
let rollTimer = null;
let rollTimerCountdown = 0;
const MULTIPLAYER_ROLL_TIMEOUT = 20000; // 20 seconds

class MultiplayerManager {
    constructor() {
        this.serverUrl = this.getServerUrl();
    }

    getServerUrl() {
        // Get the host IP address (detect from current connection)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = 3000; // Server port
        return `${protocol}//${host}:${port}`;
    }

    connect() {
        return new Promise((resolve, reject) => {
            try {
                multiplayerWebSocket = new WebSocket(this.serverUrl);

                multiplayerWebSocket.onopen = () => {
                    console.log('Connected to multiplayer server');
                    resolve();
                };

                multiplayerWebSocket.onerror = (error) => {
                    console.error('WebSocket connection error:', error);
                    reject(error);
                };

                multiplayerWebSocket.onclose = () => {
                    console.log('Disconnected from multiplayer server');
                    if (isMultiplayer) {
                        showRoomStatus('Connection lost. Reconnecting...', 'error');
                    }
                };

                multiplayerWebSocket.onmessage = (event) => {
                    this.handleMessage(JSON.parse(event.data));
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    send(message) {
        if (multiplayerWebSocket && multiplayerWebSocket.readyState === WebSocket.OPEN) {
            multiplayerWebSocket.send(JSON.stringify(message));
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'ROOM_CREATED':
                handleRoomCreated(message);
                break;
            case 'ROOM_JOINED':
                handleRoomJoined(message);
                break;
            case 'JOIN_FAILED':
                handleJoinFailed(message);
                break;
            case 'PLAYER_JOINED':
                handlePlayerJoined(message);
                break;
            case 'GAME_STARTED':
                handleGameStarted(message);
                break;
            case 'PLAYER_ACTION':
                handlePlayerAction(message);
                break;
            case 'STATE_UPDATE':
                handleStateUpdate(message);
                break;
            case 'PLAYER_DISCONNECTED':
                handlePlayerDisconnected(message);
                break;
        }
    }

    createRoom() {
        this.send({ type: 'CREATE_ROOM' });
    }

    joinRoom(roomCode) {
        this.send({ type: 'JOIN_ROOM', roomCode: roomCode });
    }

    startGame() {
        this.send({ type: 'START_GAME' });
    }

    leaveRoom() {
        this.send({ type: 'LEAVE_ROOM' });
    }

    syncGameState(gameState) {
        this.send({ type: 'SYNC_STATE', gameState: gameState });
    }

    sendPlayerAction(action, data) {
        this.send({ type: 'PLAYER_ACTION', action: action, data: data });
    }
}

const multiplayerManager = new MultiplayerManager();

// Multiplayer event handlers
function handleRoomCreated(message) {
    currentPlayerId = message.playerId;
    currentRoomCode = message.roomCode;
    isHostPlayer = true;
    console.log(`Created room: ${currentRoomCode}, You are Player ${currentPlayerId}`);
    
    showWaitingRoom();
    updatePlayerList([{ id: currentPlayerId, role: 'Host' }]);
    document.getElementById('start-multiplayer-btn').disabled = false;
    showRoomStatus(`Room created! Code: ${currentRoomCode}`, 'success');
}

function handleRoomJoined(message) {
    currentPlayerId = message.playerId;
    currentRoomCode = message.roomCode;
    isHostPlayer = false;
    console.log(`Joined room: ${currentRoomCode}, You are Player ${currentPlayerId}`);
    
    showWaitingRoom();
    updatePlayerList([{ id: currentPlayerId, role: 'Guest' }]);
    connectedPlayers = (message.playerIds || [currentPlayerId])
        .filter((id) => id !== currentPlayerId)
        .map((id) => ({ id }));
    document.getElementById('start-multiplayer-btn').disabled = true;
    showRoomStatus(`Joined room ${currentRoomCode}`, 'success');
}

function handleJoinFailed(message) {
    showRoomStatus(`Failed to join room: ${message.reason}`, 'error');
    console.error(`Join failed: ${message.reason}`);
}

function handlePlayerJoined(message) {
    console.log(`Player ${message.playerId} joined. Total: ${message.totalPlayers}`);
    document.getElementById('player-count-text').textContent = `Players in room: ${message.totalPlayers}/4`;
    const roomPlayerIds = message.playerIds || Array.from({ length: message.totalPlayers }, (_, index) => index + 1);
    connectedPlayers = roomPlayerIds
        .filter((id) => id !== currentPlayerId)
        .map((id) => ({ id }));

    if (isHostPlayer && message.totalPlayers > 1) {
        document.getElementById('start-multiplayer-btn').disabled = false;
    }
}

function handleGameStarted(message) {
    console.log('Game started!');
    hideMultiplayerMenu();
    startMultiplayerGame();
    updateBackgroundMusic();
    setChatVisibility(true);
    if (isHostPlayer && gameSettings.theme) {
        multiplayerManager.sendPlayerAction('SYNC_THEME', { theme: gameSettings.theme });
    }
}

function handlePlayerAction(message) {
    if (message.playerId === currentPlayerId) {
        return;
    }

    if (message.action === 'CHAT_MESSAGE' || message.action === 'CHAT_REACTION') {
        displayChatMessage(message.playerId, message.action, message.data);
        return;
    }

    if (message.action === 'SYNC_THEME') {
        if (message.data && message.data.theme) {
            setTheme(message.data.theme);
            if (boardThemeSelect) {
                boardThemeSelect.value = message.data.theme;
            }
        }
        return;
    }

    console.log(`Action from Player ${message.playerId}:`, message.action, message.data);
    // Handle remote player actions here
    // This will sync dice rolls, movements, trivia answers across all devices
    syncRemotePlayerAction(message);
}

function handleStateUpdate(message) {
    if (message.fromPlayerId !== currentPlayerId) {
        // Update local game state with remote state
        console.log('Syncing game state from another player');
    }
}

function handlePlayerDisconnected(message) {
    console.log(`Player ${message.playerId} ${message.reason || 'disconnected'}`);
    const remainingPlayerIds = message.remainingPlayerIds || activePlayers
        .map((player) => player.id)
        .filter((id) => id !== message.playerId);

    connectedPlayers = remainingPlayerIds
        .filter((id) => id !== currentPlayerId)
        .map((id) => ({ id }));
    if (message.newHostId) {
        isHostPlayer = currentPlayerId === message.newHostId;
    }

    showRoomStatus(`${getPlayerNameById(message.playerId)} left the online game`, 'warning');

    if (gameContainer.classList.contains('hidden')) {
        updatePlayerList(remainingPlayerIds.map((id) => ({
            id,
            role: id === currentPlayerId ? (isHostPlayer ? 'Host' : 'You') : 'Guest'
        })));
        document.getElementById('start-multiplayer-btn').disabled = !(isHostPlayer && remainingPlayerIds.length > 1);
        return;
    }

    removePlayerFromActiveGame(message.playerId, message.defaultWinnerId);
}

// UI Helpers
function showRoomStatus(message, type = 'info') {
    const statusDiv = document.getElementById('room-status');
    const statusText = document.getElementById('room-status-text');
    statusText.textContent = message;
    statusDiv.className = `room-status ${type}`;
    statusDiv.classList.remove('hidden');
}

function getPlayerNameById(id) {
    const player = players.find((p) => p.id === id);
    return player ? player.name : `Player ${id}`;
}

function setChatVisibility(visible) {
    if (!chatPanel) return;
    chatPanel.classList.toggle('hidden', !visible);
}

function appendChatMessage({ playerId, sender, text, type }) {
    if (!chatMessages) return;

    const messageWrapper = document.createElement('div');
    messageWrapper.classList.add('chat-message');
    messageWrapper.dataset.sender = sender;

    const senderLabel = document.createElement('span');
    senderLabel.classList.add('sender');
    senderLabel.textContent = sender;

    const messageText = document.createElement('span');
    messageText.classList.add('message-text');
    messageText.textContent = type === 'reaction' ? `sent ${text}` : text;

    messageWrapper.appendChild(senderLabel);
    messageWrapper.appendChild(messageText);

    if (type === 'reaction') {
        messageWrapper.classList.add('chat-reaction');
    }

    chatMessages.appendChild(messageWrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function displayChatMessage(playerId, action, data) {
    const sender = getPlayerNameById(playerId);
    if (action === 'CHAT_MESSAGE') {
        appendChatMessage({ playerId, sender, text: data.message, type: 'message' });
    } else if (action === 'CHAT_REACTION') {
        appendChatMessage({ playerId, sender, text: data.reaction, type: 'reaction' });
    }
}

function sendChatText() {
    if (!isMultiplayer || !chatInput.value.trim()) {
        return;
    }

    const messageText = chatInput.value.trim();
    appendChatMessage({ playerId: currentPlayerId, sender: getPlayerNameById(currentPlayerId), text: messageText, type: 'message' });
    multiplayerManager.sendPlayerAction('CHAT_MESSAGE', { message: messageText });
    chatInput.value = '';
}

function sendChatReaction(reaction) {
    if (!isMultiplayer) {
        return;
    }
    appendChatMessage({ playerId: currentPlayerId, sender: getPlayerNameById(currentPlayerId), text: reaction, type: 'reaction' });
    multiplayerManager.sendPlayerAction('CHAT_REACTION', { reaction });
}

function updatePlayerList(playersList) {
    const listDiv = document.getElementById('players-list');
    listDiv.innerHTML = `<p>Players connected: ${playersList.length}/4</p>`;
    playersList.forEach((player) => {
        const playerItem = document.createElement('p');
        playerItem.textContent = `Player ${player.id} (${player.role})`;
        listDiv.appendChild(playerItem);
    });
}

function showWaitingRoom() {
    document.getElementById('display-room-code').textContent = currentRoomCode;
    document.getElementById('waiting-room-overlay').classList.remove('hidden');
}

function hideWaitingRoom() {
    document.getElementById('waiting-room-overlay').classList.add('hidden');
}

function showMultiplayerMenu() {
    document.getElementById('multiplayer-menu').classList.remove('hidden');
    homePage.classList.add('hidden');
}

function hideMultiplayerMenu() {
    document.getElementById('multiplayer-menu').classList.add('hidden');
    homePage.classList.add('hidden');
}

function startMultiplayerGame() {
    isMultiplayer = true;
    isPaused = false;
    hideWaitingRoom();
    gameContainer.classList.remove('hidden');
    resetGameState();
    
    // In multiplayer, only AI or remote players control their turns
    // Set up game for 2-4 players based on room
    const roomPlayerIds = [currentPlayerId, ...connectedPlayers.map((player) => player.id)]
        .filter(Boolean)
        .sort((a, b) => a - b);
    selectedPlayerCount = roomPlayerIds.length;
    activePlayers = roomPlayerIds.map((id) => players.find((player) => player.id === id)).filter(Boolean);
    activePlayers.forEach((player) => {
        player.isComputer = false;
        player.aiDifficulty = 'random';
    });
    hideExcludedPlayerTokens();
    updateTurnDisplay();
    updateGameActionButtons();
    if (backgroundMusic && gameSettings.musicOn) {
        backgroundMusic.currentTime = 0;
    }
    updateBackgroundMusic();
    
    console.log(`Multiplayer game started with ${selectedPlayerCount} players`);
}

function syncRemotePlayerAction(message) {
    // This function processes actions from remote players
    // and updates the local game state
    const { playerId, action, data } = message;
    
    if (action === 'ROLL_DIE') {
        // Remote player rolled
        console.log(`Remote Player ${playerId} rolled: ${data.result}`);
    } else if (action === 'MOVE') {
        // Remote player moved
        console.log(`Remote Player ${playerId} moved to position: ${data.position}`);
    } else if (action === 'ANSWER_TRIVIA') {
        // Remote player answered trivia
        console.log(`Remote Player ${playerId} answered trivia: ${data.correct ? 'Correct' : 'Incorrect'}`);
    }
}

// ============ AUTO-ROLL TIMER FOR MULTIPLAYER ============
function startMultiplayerRollTimer() {
    if (!isMultiplayer || isMoving || gameWon) {
        return;
    }

    const player = activePlayers[currentPlayerIndex];
    if (player.isComputer) {
        return; // Don't set timer for computer players
    }

    // Clear any existing timer
    clearMultiplayerRollTimer();

    rollTimerCountdown = MULTIPLAYER_ROLL_TIMEOUT / 1000; // Convert to seconds
    
    // Update display every second
    const countdownInterval = setInterval(() => {
        if (!isMultiplayer || isMoving || gameWon || !rollTimer) {
            clearInterval(countdownInterval);
            return;
        }

        rollTimerCountdown--;
        updateRollTimerDisplay();

        if (rollTimerCountdown <= 0) {
            clearInterval(countdownInterval);
            clearMultiplayerRollTimer();
            
            // Auto-roll if timer expires and player hasn't rolled
            if (!isMoving && isMultiplayer && activePlayers[currentPlayerIndex] === player) {
                console.log(`${player.name}'s time expired. Auto-rolling...`);
                handleRoll();
            }
        }
    }, 1000);

    rollTimer = countdownInterval;
    updateRollTimerDisplay();
}

function clearMultiplayerRollTimer() {
    if (rollTimer) {
        clearInterval(rollTimer);
        rollTimer = null;
        rollTimerCountdown = 0;
    }
    updateRollTimerDisplay();
}

function updateRollTimerDisplay() {
    if (!isMultiplayer) {
        return;
    }

    const rollBtnText = document.querySelector('#roll-btn');
    if (rollTimer && rollTimerCountdown > 0) {
        rollBtnText.textContent = `Roll Die (${rollTimerCountdown}s)`;
        rollBtnText.style.color = rollTimerCountdown <= 5 ? '#ff3833' : '';
    } else {
        rollBtnText.textContent = 'Roll Die';
        rollBtnText.style.color = '';
    }
}
// ============ END AUTO-ROLL TIMER ============

// ============ END MULTIPLAYER SYSTEM ============

const players = [
    { id: 1, name: "Player 1", color: "Blue", hasLeftBase: false, position: -1 },
    { id: 2, name: "Player 2", color: "Red", hasLeftBase: false, position: -1 },
    { id: 3, name: "Player 3", color: "Green", hasLeftBase: false, position: -1 },
    { id: 4, name: "Player 4", color: "Purple", hasLeftBase: false, position: -1 }
];

let currentPlayerIndex = 0;
let gameWon = false;
let isMoving = false;
let isPaused = false;
let computerRollTimeout = null;
let activePlayers = [];
let selectedPlayerCount = 4;

activePlayers = players.slice(0, selectedPlayerCount);

// AI configuration and helpers
const aiDifficultyMap = {
    random: null,
    easy: 0.35,
    normal: 0.6,
    hard: 0.85,
    expert: 0.95
};

function setComputerPlayers(count, difficulty = 'random') {
    // Clear previous flags
    players.forEach((p) => {
        p.isComputer = false;
        p.aiDifficulty = 'random';
    });

    // Ensure count is within 0..(selectedPlayerCount - 1)
    const maxComputers = Math.max(0, selectedPlayerCount - 1);
    const useCount = Math.max(0, Math.min(count, maxComputers));

    // Choose the last `useCount` players among the active players to be computers
    const available = players.slice(0, selectedPlayerCount);
    const comps = available.slice(-useCount);
    comps.forEach((p) => {
        p.isComputer = true;
        p.aiDifficulty = difficulty;
    });
}

function setAIDifficultyForAll(level) {
    players.forEach((p) => {
        if (p.isComputer) p.aiDifficulty = level;
    });
}

function isComputerPlayer(player) {
    return !!player.isComputer;
}

// Expose helpers to the console
window.setComputerPlayers = setComputerPlayers;
window.setAIDifficultyForAll = setAIDifficultyForAll;

const homePage = document.getElementById("home-page");
const gameContainer = document.getElementById("game-container");
const startButton = document.getElementById("start-btn");
const multiplayerButton = document.getElementById("multiplayer-btn");
const editPlayersButton = document.getElementById("edit-players-btn");
const closePlayerEditorButton = document.getElementById("close-player-editor");
const playerEditorOverlay = document.getElementById("player-editor-overlay");
const confirmPlayerSelectionButton = document.getElementById("confirm-player-selection");
const playerCountSelect = document.getElementById("player-count");
const humanCountSelect = document.getElementById("human-count");
const aiDifficultySelect = document.getElementById("ai-difficulty");
const playerNameInputs = document.querySelectorAll(".player-name-input");
const playerInputRows = document.querySelectorAll(".player-input-row");
const baseNameLabels = document.querySelectorAll(".base-name");
const rollButton = document.getElementById("roll-btn");
const optionsButton = document.getElementById("options-btn");
const optionsMenu = document.getElementById("options-menu");
const pauseButton = document.getElementById("pause-btn");
const musicToggleButton = document.getElementById("music-toggle-btn");
const quitButton = document.getElementById("quit-btn");
const diceResult = document.getElementById("dice-result");
const dieFace = document.querySelector(".die-face");
const currentPlayerText = document.getElementById("current-player-text");
const statusBox = document.getElementById("player-status-box");
const lastMoveText = document.querySelector("#last-move-box p");
const turnIndicator = document.getElementById("turn-indicator");
const winnerTile = document.getElementById("tile-winner");
const triviaBox = document.getElementById("trivia-box");
const triviaFeedback = document.getElementById("trivia-feedback");
const timerDisplay = document.getElementById("timer-sec");
const categoryName = document.getElementById("category-name");
const questionText = document.getElementById("question-text");
const triviaOptions = document.getElementById("trivia-options");
const winnerOverlay = document.getElementById("winner-overlay");
const winnerNameLabel = document.getElementById("winner-name");
const winnerDetailName = document.getElementById("winner-detail-name");
const winnerDetailColor = document.getElementById("winner-detail-color");
const winnerTokenDisplay = document.getElementById("winner-token-display");
const fireworksContainer = document.getElementById("fireworks-container");
const pauseOverlay = document.getElementById("pause-overlay");
const restartButton = document.getElementById("restart-btn");
const homeButton = document.getElementById("home-btn");
const howToPlayButton = document.getElementById("how-to-play-btn");
const howToPlayOverlay = document.getElementById("how-to-play-overlay");
const closeHowToPlayButton = document.getElementById("close-how-to-play");
const settingsButton = document.getElementById("settings-btn");
const settingsOverlay = document.getElementById("settings-overlay");
const closeSettingsButton = document.getElementById("close-settings");
const difficultyModeSelect = document.getElementById("difficulty-mode-select");
const questionTimerSelect = document.getElementById("question-timer-select");
const boardThemeSelect = document.getElementById("board-theme-select");
const musicToggle = document.getElementById("music-toggle");
const soundToggle = document.getElementById("sound-toggle");
const backgroundMusic = document.getElementById("bg-music");
const questionSubmitButton = document.getElementById("question-submit-btn");
const questionSubmitOverlay = document.getElementById("question-submit-overlay");
const closeQuestionSubmitButton = document.getElementById("close-question-submit");
const quitConfirmationOverlay = document.getElementById("quit-confirmation-overlay");
const quitConfirmButton = document.getElementById("quit-confirm-btn");
const quitCancelButton = document.getElementById("quit-cancel-btn");
const questionCategorySelect = document.getElementById("question-category-select");
const questionDifficultySelect = document.getElementById("question-difficulty-select");
const questionTextInput = document.getElementById("question-text-input");
const questionAnswerInput = document.getElementById("question-answer-input");
const submitQuestionConfirmButton = document.getElementById("submit-question-btn-confirm");
const introOverlay = document.getElementById("intro-overlay");
const chatPanel = document.getElementById("chat-panel");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const sendChatBtn = document.getElementById("send-chat-btn");
const emojiButtons = document.querySelectorAll(".emoji-btn");

const gameSettings = {
    difficultyMode: 'normal',
    answerTimer: 10,
    theme: 'theme-dark',
    musicOn: true,
    soundOn: true
};

const playerAccent = {
    Blue: "var(--blue-tile)",
    Red: "var(--red-tile)",
    Green: "var(--green-tile)",
    Purple: "var(--purple-tile)"
};

const categoryByColor = {
    blue: "Biology",
    red: "Animals",
    green: "Sports",
    yellow: "Physics",
    purple: "History",
    pink: "Geography"
};

const questionDecks = {
    blue: [
        { question: "What do plants need for photosynthesis?", options: ["Sunlight", "Plastic", "Smoke"], answer: "Sunlight" },
        { question: "Which gas do humans breathe in to live?", options: ["Oxygen", "Helium", "Carbon dioxide"], answer: "Oxygen" },
        { question: "What is frozen water called?", options: ["Ice", "Steam", "Sand"], answer: "Ice" }
    ],
    red: [
        { question: "How many players are on a soccer team on the field?", options: ["11", "7", "5"], answer: "11" },
        { question: "Which sport uses a hoop?", options: ["Basketball", "Cricket", "Tennis"], answer: "Basketball" },
        { question: "In which sport can you score a touchdown?", options: ["American football", "Golf", "Hockey"], answer: "American football" }
    ],
    green: [
        { question: "Which animal is known as the king of the jungle?", options: ["Lion", "Elephant", "Cheetah"], answer: "Lion" },
        { question: "Which animal has black and white stripes?", options: ["Zebra", "Tiger", "Horse"], answer: "Zebra" },
        { question: "What do bees make?", options: ["Honey", "Milk", "Silk"], answer: "Honey" }
    ],
    yellow: [
        { question: "How many days are in a week?", options: ["7", "5", "10"], answer: "7" },
        { question: "What color do you get by mixing red and yellow?", options: ["Orange", "Purple", "Green"], answer: "Orange" },
        { question: "Which planet do we live on?", options: ["Earth", "Mars", "Venus"], answer: "Earth" }
    ],
    purple: [
        { question: "What is a movie's written dialogue and action plan called?", options: ["Script", "Map", "Recipe"], answer: "Script" },
        { question: "Who directs actors on a movie set?", options: ["Director", "Referee", "Pilot"], answer: "Director" },
        { question: "Animated movies are made from many what?", options: ["Frames", "Coins", "Bricks"], answer: "Frames" }
    ],
    pink: [
        { question: "What is the largest continent on Earth?", answer: "Asia" },
        { question: "What is the largest ocean on Earth?", answer: "Pacific Ocean" },
        { question: "What is the capital city of Namibia?", answer: "Windhoek" },
        { question: "Which continent is Namibia located in?", answer: "Africa" },
        { question: "What is the longest river in the world?", answer: "Nile River" },
        { question: "What is the largest desert in the world?", answer: "Sahara Desert" },
        { question: "Which country has the largest population in the world?", answer: "China" },
        { question: "What is the capital city of France?", answer: "Paris" },
        { question: "Which continent is the Sahara Desert in?", answer: "Africa" },
        { question: "What is the smallest continent?", answer: "Australia" },
        { question: "What is the highest mountain in the world?", answer: "Mount Everest" },
        { question: "Which ocean is between Africa and Australia?", answer: "Indian Ocean" },
        { question: "What is the capital of the United States?", answer: "Washington, D.C." },
        { question: "Which continent is the Amazon rainforest in?", answer: "South America" },
        { question: "What is the largest island in the world?", answer: "Greenland" },
        { question: "What country is famous for the pyramids?", answer: "Egypt" },
        { question: "What is the capital city of Japan?", answer: "Tokyo" },
        { question: "Which river flows through Egypt?", answer: "Nile River" },
        { question: "What continent is Canada in?", answer: "North America" },
        { question: "Which ocean is on the east coast of Africa?", answer: "Indian Ocean" },
        { question: "What is the capital of South Africa?", answer: "Pretoria" },
        { question: "What is the largest country in the world by area?", answer: "Russia" },
        { question: "What continent is Brazil in?", answer: "South America" },
        { question: "What is the capital city of Germany?", answer: "Berlin" },
        { question: "Which country is shaped like a boot?", answer: "Italy" },
        { question: "What ocean is west of Africa?", answer: "Atlantic Ocean" },
        { question: "Which continent is the coldest?", answer: "Antarctica" },
        { question: "What is the capital city of China?", answer: "Beijing" },
        { question: "Which river is the longest in South America?", answer: "Amazon River" },
        { question: "Which country is famous for the Great Wall?", answer: "China" },
        { question: "What is the capital city of the United Kingdom?", answer: "London" },
        { question: "Which continent is the Sahara Desert located in?", answer: "Africa" },
        { question: "What is the capital city of Kenya?", answer: "Nairobi" },
        { question: "What is the largest lake in the world?", answer: "Caspian Sea" },
        { question: "Which country has the city of Sydney?", answer: "Australia" },
        { question: "What is the capital city of Italy?", answer: "Rome" },
        { question: "What is the capital of Spain?", answer: "Madrid" },
        { question: "Which continent is India in?", answer: "Asia" },
        { question: "What ocean is between America and Europe?", answer: "Atlantic Ocean" },
        { question: "What is the capital of Canada?", answer: "Ottawa" },
        { question: "Which country is known as the Land of the Rising Sun?", answer: "Japan" },
        { question: "What is the largest river in Africa?", answer: "Nile River" },
        { question: "What is the capital of Russia?", answer: "Moscow" },
        { question: "Which continent has the most countries?", answer: "Africa" },
        { question: "What is the capital of Brazil?", answer: "Brasília" },
        { question: "Which country has the Eiffel Tower?", answer: "France" },
        { question: "Which country has the Great Pyramid of Giza?", answer: "Egypt" },
        { question: "What is the capital city of Namibia?", answer: "Windhoek" },
        { question: "What ocean is east of the United States?", answer: "Atlantic Ocean" },
        { question: "What continent is Mexico in?", answer: "North America" },
        { question: "What is the capital of India?", answer: "New Delhi" },
        { question: "What is the largest rainforest in the world?", answer: "Amazon Rainforest" },
        { question: "Which continent is Egypt in?", answer: "Africa" },
        { question: "What is the capital of Australia?", answer: "Canberra" },
        { question: "Which desert is in southern Africa?", answer: "Kalahari Desert" },
        { question: "Which country has the city of Dubai?", answer: "United Arab Emirates" },
        { question: "What is the capital of China?", answer: "Beijing" },
        { question: "Which country is famous for pizza and pasta?", answer: "Italy" },
        { question: "Which ocean is the smallest?", answer: "Arctic Ocean" },
        { question: "What is the capital city of Norway?", answer: "Oslo" },
        { question: "What is the largest continent by population?", answer: "Asia" },
        { question: "Which country is home to Mount Everest?", answer: "Nepal" },
        { question: "What is the capital of Argentina?", answer: "Buenos Aires" },
        { question: "What is the largest ocean in the world?", answer: "Pacific Ocean" },
        { question: "Which continent is the driest?", answer: "Antarctica" },
        { question: "What is the capital city of Ghana?", answer: "Accra" },
        { question: "Which country has the Amazon River?", answer: "Brazil" },
        { question: "What is the capital of Sweden?", answer: "Stockholm" },
        { question: "Which continent is Greenland part of geographically?", answer: "North America" },
        { question: "What is the capital city of Portugal?", answer: "Lisbon" },
        { question: "Which country has the city of Cairo?", answer: "Egypt" },
        { question: "What is the capital city of Greece?", answer: "Athens" },
        { question: "What is the capital of Zimbabwe?", answer: "Harare" },
        { question: "Which continent is Peru in?", answer: "South America" },
        { question: "What is the capital city of Botswana?", answer: "Gaborone" },
        { question: "Which country has the city of Istanbul?", answer: "Turkey" },
        { question: "What is the capital city of Finland?", answer: "Helsinki" },
        { question: "What is the capital city of Denmark?", answer: "Copenhagen" },
        { question: "Which continent is Chile in?", answer: "South America" },
        { question: "What is the capital city of Ethiopia?", answer: "Addis Ababa" },
        { question: "Which country has the city of Bangkok?", answer: "Thailand" },
        { question: "What is the capital city of Belgium?", answer: "Brussels" },
        { question: "Which country has the city of Vienna?", answer: "Austria" },
        { question: "What is the capital city of Poland?", answer: "Warsaw" },
        { question: "Which country has the city of Prague?", answer: "Czech Republic" },
        { question: "What is the capital city of Hungary?", answer: "Budapest" },
        { question: "Which country has the city of Seoul?", answer: "South Korea" },
        { question: "What is the capital city of Indonesia?", answer: "Jakarta" },
        { question: "Which country has the city of Manila?", answer: "Philippines" },
        { question: "What is the capital city of Pakistan?", answer: "Islamabad" },
        { question: "Which country has the city of Tehran?", answer: "Iran" },
        { question: "What is the capital city of Iraq?", answer: "Baghdad" },
        { question: "Which country has the city of Nairobi?", answer: "Kenya" },
        { question: "What is the capital city of Uganda?", answer: "Kampala" },
        { question: "Which country has the city of Dakar?", answer: "Senegal" },
        { question: "What is the capital city of Angola?", answer: "Luanda" },
        { question: "Which country has the city of Lusaka?", answer: "Zambia" },
        { question: "What is the capital city of Malawi?", answer: "Lilongwe" },
        { question: "Which country has the city of Maputo?", answer: "Mozambique" },
        { question: "What is the capital city of Tanzania?", answer: "Dodoma" }
    ]
};

// Runtime pools used to draw questions without replacement (refill when empty)
const questionPools = {};

// --- Helpers for adding user-supplied cards and generating distractors ---
const distractorPools = {
    Sports: [
        "Basketball", "Cricket", "Tennis", "Rugby", "Volleyball", "Baseball", "Hockey", "Soccer", "Golf", "Swimming",
        "Gymnastics", "Wrestling", "Boxing", "Cycling", "Handball", "Bowling", "Badminton", "Table tennis", "Fencing", "Archery",
        "Skiing", "Snowboarding", "Curling", "Lacrosse", "Skating", "Equestrian", "Motocross", "Diving", "Weightlifting", "Powerlifting",
        "Strongman", "Biathlon", "Triathlon", "Pentathlon", "Decathlon", "Marathon", "Sprint", "Relay", "Pole vault", "Javelin",
        "Shot put", "Hammer throw", "Discus", "Rowing", "Kayaking", "Canoeing", "Bobsled", "Skeleton", "Speed skating", "Figure skating",
        "Sport climbing", "Hang gliding", "Pickleball", "Dodgeball", "Ultimate frisbee", "Parkour", "Bull riding", "Base jumping", "BMX", "Air hockey"
    ],
    Animals: [
        "Elephant", "Tiger", "Zebra", "Giraffe", "Bear", "Kangaroo", "Whale", "Dolphin", "Shark", "Penguin",
        "Lion", "Leopard", "Hippo", "Rhino", "Fox", "Wolf", "Koala", "Camel", "Owl", "Eagle",
        "Frog", "Snake", "Crocodile", "Turtle", "Panda", "Antelope", "Deer", "Otter", "Porcupine", "Beaver",
        "Hedgehog", "Squirrel", "Mole", "Hippopotamus", "Cheetah", "Salmon", "Trout", "Carp", "Manta ray", "Octopus",
        "Lobster", "Crab", "Butterfly", "Dragonfly", "Bee", "Wasp", "Firefly", "Jellyfish", "Starfish", "Seahorse",
        "Shrimp", "Pufferfish", "Barracuda", "Swan", "Flamingo", "Pelican", "Hawk", "Falcon", "Vulture", "Bison",
        "Buffalo", "Moose", "Elk", "Reindeer", "Ant", "Ladybug", "Orangutan", "Chimpanzee", "Gorilla", "Axolotl"
    ],
    Biology: [
        "Cell", "Photosynthesis", "DNA", "Oxygen", "Protein", "Cell membrane", "Ribosome", "Mitochondria", "Chloroplast", "Golgi apparatus",
        "Endoplasmic reticulum", "Lysosome", "Cellulose", "Homeostasis", "Osmosis", "Diffusion", "Metabolism", "Respiration", "Translation", "Transcription",
        "Mutation", "Evolution", "Natural selection", "Ecosystem", "Biome", "Habitat", "Population", "Community", "Food chain", "Food web",
        "Chromosome", "Allele", "Genotype", "Phenotype", "RNA", "Amino acid", "Protein synthesis", "Enzyme", "Hormone", "Antibody",
        "Immune system", "Pathogen", "Vaccine", "Microorganism", "Fossil", "Tissue", "Organ", "Bacteria", "Virus", "Nucleus",
        "Skeleton", "Muscle", "Digestive system", "Nervous system", "Circulatory system", "Respiratory system", "Neuron", "Fertilization", "Germination", "Reproduction"
    ],
    Physics: [
        "Gravity", "Force", "Energy", "Mass", "Velocity", "Friction", "Acceleration", "Momentum", "Impulse", "Wavelength",
        "Frequency", "Amplitude", "Resonance", "Electromagnetism", "Capacitance", "Inductance", "Circuit", "Resistance", "Current", "Voltage",
        "Power", "Work", "Kinetic energy", "Potential energy", "Thermodynamics", "Entropy", "Heat", "Pressure", "Density", "Torque",
        "Magnetism", "Centripetal force", "Projectile", "Newton", "Einstein", "Relativity", "Quantum", "Photon", "Electron", "Proton",
        "Neutron", "Nucleus", "Atom", "Molecule", "Particle", "Wavefunction", "Superposition", "Fission", "Fusion", "Radiation",
        "Sound", "Motion", "Orbit", "Elasticity", "Buoyancy", "Refraction", "Diffraction", "Reflection", "Conduction", "Convection"
    ],
    History: [
        "Revolution", "Empire", "Treaty", "Monarch", "Constitution", "Colony", "Dynasty", "Explorer", "Artifact", "Parliament",
        "War", "Battle", "Republic", "King", "Queen", "Civilization", "Archive", "Monument", "Heritage", "Crusade",
        "Alliance", "Siege", "Invasion", "Pilgrimage", "Civil war", "Rebellion", "Settlement", "Migration", "Expedition", "Era",
        "Period", "Ancient", "Medieval", "Modern", "Archaeology", "Historian", "Memorial", "Sovereign", "Dictator", "Democracy",
        "Feudalism", "Serfdom", "Imperialism", "Colonialism", "Independence", "Conquest", "Annexation", "Renaissance", "Industrial Revolution", "Court"
    ],
    Geography: [
        "Continent", "River", "Mountain", "Capital", "Island", "Desert", "Peninsula", "Ocean", "Valley", "Plateau",
        "Glacier", "Border", "Latitude", "Longitude", "Climate", "Hemisphere", "Country", "City", "Volcano", "Canyon",
        "Basin", "Atoll", "Archipelago", "Plain", "Jungle", "Forest", "Coastline", "Tropic", "Equator", "Meridian",
        "Rainforest", "Iceberg", "Savannah", "Steppe", "Marsh", "Lagoon", "Delta", "Bay", "Sound", "Current",
        "Cape", "Channel", "Coast", "Creek", "Dune", "Estuary", "Fjord", "Geyser", "Harbor", "Isthmus",
        "Mesa", "Oasis", "Prairie", "Reef", "Reservoir", "Ridge", "Tundra", "Wetland", "Basin", "Atoll"
    ]
};

function pickRandom(array, exclude, count) {
    const pool = array.filter((i) => !exclude.includes(i));
    const out = [];
    for (let i = 0; i < count && pool.length > 0; i += 1) {
        const idx = Math.floor(Math.random() * pool.length);
        out.push(pool.splice(idx, 1)[0]);
    }
    return out;
}

function isNumericString(s) {
    return !Number.isNaN(Number(s)) && String(s).trim() !== "";
}

function generateNumericDistractors(correct, count) {
    const base = Number(correct);
    const candidates = [];
    const step = Math.max(1, Math.round(Math.abs(base) * 0.1) || 1);
    for (let i = 1; candidates.length < count && i < 50; i += 1) {
        candidates.push(String(base + i * step));
        if (candidates.length < count) candidates.push(String(base - i * step));
    }
    return candidates.slice(0, count);
}

function normalizeText(text) {
    return String(text)
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, " ")
        .split(/\s+/)
        .filter(Boolean);
}

function scoreDistractor(candidate, correct, questionTokens, answerTokens) {
    const normalized = String(candidate).toLowerCase();
    let score = 0;

    if (normalized === String(correct).toLowerCase()) {
        return -Infinity;
    }

    if (normalized.includes(String(correct).toLowerCase()) || String(correct).toLowerCase().includes(normalized)) {
        score += 8;
    }

    const candidateTokens = normalizeText(candidate);
    candidateTokens.forEach((token) => {
        if (answerTokens.includes(token)) {
            score += 4;
        }
        if (questionTokens.includes(token)) {
            score += 2;
        }
    });

    const lengthDiff = Math.abs(normalized.length - String(correct).length);
    score += Math.max(0, 4 - Math.floor(lengthDiff / 5));

    return score;
}

function generateDistractors(correct, categoryKey, count = 2, question = "") {
    // Try numeric first
    if (isNumericString(correct)) {
        return generateNumericDistractors(correct, count);
    }

    const category = categoryByColor[categoryKey] || categoryByColor.yellow;
    const pool = distractorPools[category] || [];
    const answerTokens = normalizeText(correct);
    const questionTokens = normalizeText(question);

    const scored = pool
        .filter((item) => item !== correct)
        .map((item) => ({ item, score: scoreDistractor(item, correct, questionTokens, answerTokens) }))
        .sort((a, b) => b.score - a.score || a.item.localeCompare(b.item));

    const picks = [];
    for (let i = 0; i < scored.length && picks.length < count; i += 1) {
        if (scored[i].score > -Infinity && !picks.includes(scored[i].item)) {
            picks.push(scored[i].item);
        }
    }

    while (picks.length < count) {
        let alt = correct;
        if (alt.length > 3) {
            alt = alt.slice(0, Math.max(3, Math.floor(alt.length * 0.6)));
        }
        alt = alt + String.fromCharCode(97 + Math.floor(Math.random() * 26));
        if (!picks.includes(alt) && alt !== correct) picks.push(alt);
    }
    return picks.slice(0, count);
}

function addQuestionsForColor(colorKey, items) {
    // colorKey should be one of: blue, red, green, yellow, purple, pink
    if (!questionDecks[colorKey]) {
        questionDecks[colorKey] = [];
    }

    const added = [];
    items.forEach(({ question, answer }) => {
        const distractors = generateDistractors(answer, colorKey, 2, question);
        const options = [answer, ...distractors];
        questionDecks[colorKey].push({ question, options, answer });
        const card = { question, options, answer };
        added.push(card);
        // If a runtime pool exists for this color, add the new card into it so it becomes available immediately
        if (questionPools[colorKey]) {
            questionPools[colorKey].push(card);
        }
    });

    return added;
}

// Expose a simple global helper so you can paste questions in the console:
// Example: addQuestionsForColor('red', [{question: 'Q?', answer: 'A'}])
window.addQuestionsForColor = addQuestionsForColor;
// Bulk-add Biology questions (moved to blue) provided by the user.
addQuestionsForColor("blue", [
    { question: "What part of the plant makes food?", answer: "Leaves" },
    { question: "What gas do humans breathe in to live?", answer: "Oxygen" },
    { question: "What organ pumps blood around the body?", answer: "Heart" },
    { question: "What part of the body helps us think?", answer: "Brain" },
    { question: "What is the largest organ in the human body?", answer: "Skin" },
    { question: "What do plants need from the sun to make food?", answer: "Sunlight" },
    { question: "What gas do plants release during photosynthesis?", answer: "Oxygen" },
    { question: "What part of the plant absorbs water from the soil?", answer: "Roots" },
    { question: "What carries blood around the body?", answer: "Blood vessels" },
    { question: "What organ helps us breathe?", answer: "Lungs" },
    { question: "What do we call animals that eat plants only?", answer: "Herbivores" },
    { question: "What do we call animals that eat meat only?", answer: "Carnivores" },
    { question: "What do we call animals that eat both plants and animals?", answer: "Omnivores" },
    { question: "What part of the plant becomes a fruit?", answer: "Flower" },
    { question: "What is the smallest unit of life?", answer: "Cell" },
    { question: "What do bees collect from flowers?", answer: "Nectar" },
    { question: "What do we call the process plants use to make food?", answer: "Photosynthesis" },
    { question: "What vitamin do we get from sunlight?", answer: "Vitamin D" },
    { question: "What protects the brain?", answer: "Skull" },
    { question: "What do we call the bones in the body together?", answer: "Skeleton" },
    { question: "What liquid carries nutrients in the body?", answer: "Blood" },
    { question: "What organ helps digest food?", answer: "Stomach" },
    { question: "What do plants produce during photosynthesis?", answer: "Glucose" },
    { question: "What is the green pigment in plants?", answer: "Chlorophyll" },
    { question: "What part of the plant holds it upright?", answer: "Stem" },
    { question: "What do we call animals with backbones?", answer: "Vertebrates" },
    { question: "What do we call animals without backbones?", answer: "Invertebrates" },
    { question: "What do humans use to smell?", answer: "Nose" },
    { question: "What do humans use to hear?", answer: "Ears" },
    { question: "What part of the body helps us see?", answer: "Eyes" },
    { question: "What part of the plant makes seeds?", answer: "Flower" },
    { question: "What do seeds grow into?", answer: "Plants" },
    { question: "What do we call young frogs?", answer: "Tadpoles" },
    { question: "What process do humans use to take in oxygen?", answer: "Breathing" },
    { question: "What do plants absorb from the air?", answer: "Carbon dioxide" },
    { question: "What do we call the life cycle of a butterfly change?", answer: "Metamorphosis" },
    { question: "What do birds use to fly?", answer: "Wings" },
    { question: "What do fish use to breathe in water?", answer: "Gills" },
    { question: "What do humans use to taste food?", answer: "Tongue" },
    { question: "What part of the body helps us move?", answer: "Muscles" },
    { question: "What carries messages in the body?", answer: "Nerves" },
    { question: "What is the hard outer layer of a seed called?", answer: "Seed coat" },
    { question: "What part of the plant attracts insects?", answer: "Flower petals" },
    { question: "What do plants need besides sunlight and water to grow?", answer: "Nutrients from soil" },
    { question: "What part of the body filters blood?", answer: "Kidneys" },
    { question: "What organ cleans the blood?", answer: "Liver" },
    { question: "What do animals need to survive?", answer: "Food, water, air" },
    { question: "What do we call animals active at night?", answer: "Nocturnal animals" },
    { question: "What do we call animals active during the day?", answer: "Diurnal animals" },
    { question: "What protects the heart and lungs?", answer: "Rib cage" },
    { question: "What do insects use to feel around them?", answer: "Antennae" },
    { question: "How many legs do insects have?", answer: "Six" },
    { question: "What do we call animals that live in water?", answer: "Aquatic animals" },
    { question: "What do we call animals that live on land?", answer: "Terrestrial animals" },
    { question: "What do mammals feed their babies?", answer: "Milk" },
    { question: "What covers the body of birds?", answer: "Feathers" },
    { question: "What covers the body of fish?", answer: "Scales" },
    { question: "What helps birds stay warm?", answer: "Feathers" },
    { question: "What part of the plant carries water to leaves?", answer: "Stem" },
    { question: "What organ controls the body?", answer: "Brain" },
    { question: "What do we call the young of a dog?", answer: "Puppy" },
    { question: "What do we call the young of a cat?", answer: "Kitten" },
    { question: "What do we call the young of a cow?", answer: "Calf" },
    { question: "What do we call the young of a frog?", answer: "Tadpole" },
    { question: "What is the process of growing from a seed called?", answer: "Germination" },
    { question: "What do animals breathe in from the air?", answer: "Oxygen" },
    { question: "What do animals breathe out?", answer: "Carbon dioxide" },
    { question: "What is the liquid inside cells called?", answer: "Cytoplasm" },
    { question: "What controls the activities of a cell?", answer: "Nucleus" },
    { question: "What protects the cell?", answer: "Cell membrane" },
    { question: "What do we call animals that lay eggs?", answer: "Oviparous animals" },
    { question: "What do we call animals that give birth to live young?", answer: "Viviparous animals" },
    { question: "What do plants store food in?", answer: "Roots, stems, or seeds" },
    { question: "What organ stores urine?", answer: "Bladder" },
    { question: "What do we call a group of similar cells?", answer: "Tissue" },
    { question: "What do tissues form?", answer: "Organs" },
    { question: "What do organs work together to form?", answer: "Organ systems" },
    { question: "What organ helps break down food with acids?", answer: "Stomach" },
    { question: "What do we call the body system that helps us breathe?", answer: "Respiratory system" },
    { question: "What system moves blood around the body?", answer: "Circulatory system" },
    { question: "What system helps break down food?", answer: "Digestive system" },
    { question: "What system helps us move?", answer: "Muscular system" },
    { question: "What system supports the body?", answer: "Skeletal system" },
    { question: "What do plants release into the air?", answer: "Oxygen" },
    { question: "What do plants take from soil?", answer: "Water and minerals" },
    { question: "What part of the plant makes pollen?", answer: "Flower" },
    { question: "What do bees help plants do?", answer: "Pollinate" },
    { question: "What is pollination?", answer: "Transfer of pollen" },
    { question: "What do plants produce after pollination?", answer: "Seeds" },
    { question: "What part of the body pumps oxygenated blood?", answer: "Heart" },
    { question: "What helps food move through the digestive system?", answer: "Muscles" },
    { question: "What is the body's main energy source?", answer: "Food" },
    { question: "What do we call living things?", answer: "Organisms" },
    { question: "What do plants and animals both need to survive?", answer: "Water" },
    { question: "What do we call a place where an animal lives?", answer: "Habitat" },
    { question: "What do we call animals that sleep during winter?", answer: "Hibernating animals" },
    { question: "What protects animals like turtles and snails?", answer: "Shell" },
    { question: "What helps fish swim?", answer: "Fins" },
    { question: "What do birds use to eat food?", answer: "Beaks" },
    { question: "What do we call the science that studies living things?", answer: "Biology" }
]);

// Bulk-add Physics (yellow) questions provided by the user.
addQuestionsForColor("yellow", [
    { question: "What force pulls objects toward the Earth?", answer: "Gravity" },
    { question: "What do we call a push or a pull?", answer: "Force" },
    { question: "What instrument measures temperature?", answer: "Thermometer" },
    { question: "What form of energy comes from the Sun?", answer: "Light energy" },
    { question: "What is the speed of light?", answer: "About 300,000 km per second" },
    { question: "What is the unit of force?", answer: "Newton" },
    { question: "What instrument measures time?", answer: "Clock" },
    { question: "What is the unit of temperature?", answer: "Celsius" },
    { question: "What is the unit of mass?", answer: "Kilogram" },
    { question: "What is the unit of length?", answer: "Meter" },
    { question: "What is the unit of electric current?", answer: "Ampere" },
    { question: "What type of energy is stored in food?", answer: "Chemical energy" },
    { question: "What form of energy do we use to see?", answer: "Light energy" },
    { question: "What type of energy is produced by moving objects?", answer: "Kinetic energy" },
    { question: "What energy is stored in an object due to its position?", answer: "Potential energy" },
    { question: "What device measures electric current?", answer: "Ammeter" },
    { question: "What device measures voltage?", answer: "Voltmeter" },
    { question: "What type of energy is produced by vibrating objects?", answer: "Sound energy" },
    { question: "What is the center of the solar system?", answer: "The Sun" },
    { question: "What force keeps planets moving around the Sun?", answer: "Gravity" },
    { question: "What simple machine helps lift heavy objects with a bar?", answer: "Lever" },
    { question: "What simple machine is used to lift water from a well?", answer: "Pulley" },
    { question: "What type of energy is stored in batteries?", answer: "Chemical energy" },
    { question: "What energy powers electrical appliances?", answer: "Electrical energy" },
    { question: "What is the freezing point of water?", answer: "0°C" },
    { question: "What is the boiling point of water?", answer: "100°C" },
    { question: "What type of energy comes from heat?", answer: "Thermal energy" },
    { question: "What happens to objects when heated?", answer: "They expand" },
    { question: "What is the speed of sound in air approximately?", answer: "About 343 m/s" },
    { question: "What do we call the path of a moving object?", answer: "Trajectory" },
    { question: "What is friction?", answer: "A force that slows motion" },
    { question: "What type of mirror shows a larger image?", answer: "Concave mirror" },
    { question: "What type of mirror shows a smaller image?", answer: "Convex mirror" },
    { question: "What happens when light bends passing through water?", answer: "Refraction" },
    { question: "What is reflection?", answer: "Bouncing of light" },
    { question: "What is the unit of power?", answer: "Watt" },
    { question: "What device converts electrical energy into light?", answer: "Light bulb" },
    { question: "What energy comes from moving air?", answer: "Wind energy" },
    { question: "What energy comes from flowing water?", answer: "Hydroelectric energy" },
    { question: "What energy comes from the Earth's heat?", answer: "Geothermal energy" },
    { question: "What energy comes from the Sun?", answer: "Solar energy" },
    { question: "What is the unit of speed?", answer: "Meter per second" },
    { question: "What measures air pressure?", answer: "Barometer" },
    { question: "What type of energy is stored in stretched rubber bands?", answer: "Elastic potential energy" },
    { question: "What is the opposite of attraction in magnets?", answer: "Repulsion" },
    { question: "What are the ends of a magnet called?", answer: "Poles" },
    { question: "What metal is strongly attracted to magnets?", answer: "Iron" },
    { question: "What type of current flows in one direction only?", answer: "Direct current (DC)" },
    { question: "What current changes direction repeatedly?", answer: "Alternating current (AC)" },
    { question: "What material allows electricity to pass easily?", answer: "Conductor" },
    { question: "What material does not allow electricity to pass easily?", answer: "Insulator" },
    { question: "What is the unit of electrical resistance?", answer: "Ohm" },
    { question: "What device protects circuits from too much current?", answer: "Fuse" },
    { question: "What do we call the energy of moving water waves?", answer: "Wave energy" },
    { question: "What simple machine has a wheel and rope?", answer: "Pulley" },
    { question: "What simple machine is a sloping surface?", answer: "Inclined plane" },
    { question: "What simple machine is used to split objects?", answer: "Wedge" },
    { question: "What simple machine has threads around it?", answer: "Screw" },
    { question: "What type of lens spreads light rays?", answer: "Concave lens" },
    { question: "What type of lens brings light rays together?", answer: "Convex lens" },
    { question: "What do we call matter that has mass and takes up space?", answer: "Matter" },
    { question: "What are the three common states of matter?", answer: "Solid, liquid, gas" },
    { question: "What state of matter has a fixed shape?", answer: "Solid" },
    { question: "What state of matter takes the shape of its container?", answer: "Liquid" },
    { question: "What state of matter spreads to fill all space?", answer: "Gas" },
    { question: "What instrument measures weight?", answer: "Scale" },
    { question: "What type of energy is stored in fuels?", answer: "Chemical energy" },
    { question: "What do we call the rate of motion?", answer: "Speed" },
    { question: "What do we call a change in position over time?", answer: "Motion" },
    { question: "What planet is known as the Red Planet?", answer: "Mars" },
    { question: "What planet is closest to the Sun?", answer: "Mercury" },
    { question: "What planet is known for its rings?", answer: "Saturn" },
    { question: "What natural satellite orbits Earth?", answer: "Moon" },
    { question: "What causes day and night?", answer: "Earth’s rotation" },
    { question: "What causes seasons?", answer: "Earth’s tilt and orbit" },
    { question: "What is the unit of energy?", answer: "Joule" },
    { question: "What energy is produced when objects vibrate?", answer: "Sound energy" },
    { question: "What energy is stored in stretched springs?", answer: "Elastic energy" },
    { question: "What is the force that slows moving objects?", answer: "Friction" },
    { question: "What do we call energy that cannot be replaced quickly?", answer: "Non-renewable energy" },
    { question: "What energy source can be replaced naturally?", answer: "Renewable energy" },
    { question: "What energy source comes from wind?", answer: "Wind energy" },
    { question: "What energy source comes from the Sun?", answer: "Solar energy" },
    { question: "What energy source comes from water?", answer: "Hydropower" },
    { question: "What device changes electrical energy into motion?", answer: "Electric motor" },
    { question: "What device changes motion into electrical energy?", answer: "Generator" },
    { question: "What instrument measures speed in a car?", answer: "Speedometer" },
    { question: "What device measures distance traveled?", answer: "Odometer" },
    { question: "What is the force that attracts objects to Earth?", answer: "Gravity" },
    { question: "What is the energy of motion?", answer: "Kinetic energy" },
    { question: "What energy is stored due to position?", answer: "Potential energy" },
    { question: "What type of mirror is used in cars to see behind?", answer: "Convex mirror" },
    { question: "What energy travels in waves we can see?", answer: "Light energy" },
    { question: "What energy travels as vibrations through air?", answer: "Sound energy" },
    { question: "What gas fills balloons to make them float?", answer: "Helium" },
    { question: "What causes an echo?", answer: "Reflection of sound" },
    { question: "What happens when sound hits a wall and comes back?", answer: "Echo" },
    { question: "What force keeps us on the ground?", answer: "Gravity" },
    { question: "What is the energy stored in objects at height?", answer: "Gravitational potential energy" },
    { question: "What branch of science studies matter, motion, and energy?", answer: "Physics" }
]);

// Bulk-add Sports questions (moved to green) provided by the user.
addQuestionsForColor("green", [
    { question: "How many players are on a football (soccer) team on the field?", answer: "11" },
    { question: "Which sport uses a bat and a ball and is popular in England?", answer: "Cricket" },
    { question: "Which sport uses a hoop and a ball?", answer: "Basketball" },
    { question: "In which sport do you perform a slam dunk?", answer: "Basketball" },
    { question: "Which sport is played with a racket and a shuttlecock?", answer: "Badminton" },
    { question: "How many players are on a basketball team on the court?", answer: "5" },
    { question: "Which sport is played on ice with a puck?", answer: "Ice Hockey" },
    { question: "Which sport is known as the “king of sports”?", answer: "Soccer (Football)" },
    { question: "How many goals are in a standard football (soccer) match for each team?", answer: "1 per scoring goal, match duration decides" },
    { question: "Which sport is played in the Olympics with swimming, running, and cycling combined?", answer: "Triathlon" },
    { question: "In which sport do players hit a ball over a net using their hands?", answer: "Volleyball" },
    { question: "How many points is a touchdown worth in American football?", answer: "6" },
    { question: "Which sport uses a stick to hit a small ball into a hole?", answer: "Golf" },
    { question: "Which sport involves two teams trying to score by carrying or passing an oval ball to the opponent’s end zone?", answer: "Rugby" },
    { question: "Which sport is played on horseback and involves hitting a ball with a mallet?", answer: "Polo" },
    { question: "Which sport is played on a court and uses a net and a rubber ball bounced against the wall?", answer: "Squash" },
    { question: "Which sport uses a long, narrow board to slide on snow?", answer: "Snowboarding" },
    { question: "Which sport is played in water and involves throwing a ball into a goal?", answer: "Water Polo" },
    { question: "Which sport involves rolling a heavy ball to knock down pins?", answer: "Bowling" },
    { question: "Which sport uses ice skates and a stick to hit a puck?", answer: "Ice Hockey" },
    { question: "How many players are on a volleyball team on the court?", answer: "6" },
    { question: "Which sport uses a helmet, bat, and gloves and is popular in India?", answer: "Cricket" },
    { question: "Which sport is played on a rectangular field with goalposts at each end and a round ball?", answer: "Soccer (Football)" },
    { question: "Which sport involves climbing walls with ropes and grips?", answer: "Rock Climbing" },
    { question: "Which sport is known for the Tour de France?", answer: "Cycling" },
    { question: "Which sport involves sliding stones on ice towards a target area?", answer: "Curling" },
    { question: "Which sport is played on a sand court with a ball?", answer: "Beach Volleyball" },
    { question: "In which sport do you need speed, balance, and tricks on a skateboard?", answer: "Skateboarding" },
    { question: "Which sport is known as the “gentleman’s game”?", answer: "Cricket" },
    { question: "Which sport uses a bat to hit a small white ball over a net and into a court?", answer: "Tennis" },
    { question: "Which sport is played in a pool where players pass, dribble, and shoot a ball?", answer: "Water Polo" },
    { question: "Which sport is played on a grass field with goals and involves kicking a ball?", answer: "Football (Soccer)" },
    { question: "How many players are on a rugby team on the field?", answer: "15" },
    { question: "Which sport is played by running, jumping, and throwing in different events?", answer: "Athletics (Track and Field)" },
    { question: "Which sport is played on ice and involves sliding stones towards a circle?", answer: "Curling" },
    { question: "Which sport is played on a rectangular court with hoops at each end and uses dribbling?", answer: "Basketball" },
    { question: "Which sport involves racing boats using paddles?", answer: "Canoeing/Kayaking" },
    { question: "Which sport is played on a field with goalposts at each end and a rugby ball?", answer: "Rugby" },
    { question: "Which sport uses a small white ball and a wooden or plastic bat and is popular in the USA?", answer: "Baseball" },
    { question: "Which sport is played in a pool and involves teams scoring by throwing a ball into a goal?", answer: "Water Polo" },
    { question: "Which sport involves running as fast as possible over short distances?", answer: "Sprinting" },
    { question: "Which sport is played on a rectangular court and involves hitting a shuttlecock over a net?", answer: "Badminton" },
    { question: "Which sport involves jumping over obstacles on a horse?", answer: "Equestrian (Show Jumping)" },
    { question: "Which sport is played with a puck on ice and uses sticks?", answer: "Ice Hockey" },
    { question: "Which sport uses a long rope for speed and endurance and is played individually?", answer: "Rope Skipping" },
    { question: "Which sport is played on a table with paddles and a small ball?", answer: "Table Tennis (Ping Pong)" },
    { question: "Which sport involves throwing a ball into a basket?", answer: "Basketball" },
    { question: "Which sport uses a net, court, and ball, and can be played in singles or doubles?", answer: "Tennis" },
    { question: "Which sport is played by kicking a ball into a goal while running?", answer: "Soccer (Football)" },
    { question: "Which sport involves riding waves on a board?", answer: "Surfing" },
    { question: "Which sport uses a ball, goalposts, and a goalkeeper?", answer: "Soccer (Football)" },
    { question: "Which sport involves hitting a ball over a net using a racket?", answer: "Tennis" },
    { question: "Which sport is played with a bat and ball on a diamond-shaped field?", answer: "Baseball" },
    { question: "Which sport is played in winter using skis on snow?", answer: "Skiing" },
    { question: "Which sport involves throwing a disc into a target?", answer: "Disc Golf" },
    { question: "Which sport uses a small rubber ball and a paddle against a wall?", answer: "Squash" },
    { question: "Which sport is played with a ball and sticks on grass?", answer: "Field Hockey" },
    { question: "Which sport is played in a swimming pool and involves treading water constantly?", answer: "Water Polo" },
    { question: "Which sport involves jumping, running, and throwing events?", answer: "Track and Field (Athletics)" },
    { question: "Which sport involves sliding stones on ice with a broom to guide them?", answer: "Curling" },
    { question: "Which sport is played with a frisbee?", answer: "Ultimate Frisbee" },
    { question: "Which sport involves climbing up a vertical wall?", answer: "Rock Climbing" },
    { question: "Which sport uses a long bat and a ball and is popular in England, India, and Australia?", answer: "Cricket" },
    { question: "Which sport uses a net, ball, and racquet indoors or outdoors?", answer: "Badminton" },
    { question: "Which sport involves scoring points by throwing a ball into a hoop?", answer: "Basketball" },
    { question: "Which sport is played with an oval ball on a rectangular field?", answer: "Rugby" },
    { question: "Which sport uses a small ball, a bat, and gloves in America?", answer: "Baseball" },
    { question: "Which sport is played on a sand court with two players per team?", answer: "Beach Volleyball" },
    { question: "Which sport involves jumping, climbing, and swinging on apparatuses?", answer: "Gymnastics" },
    { question: "Which sport is played on a court with racquets and a shuttlecock?", answer: "Badminton" },
    { question: "Which sport uses a bat and ball and is popular in Australia, India, and England?", answer: "Cricket" },
    { question: "Which sport is played with an oval ball and goalposts at each end?", answer: "Rugby" },
    { question: "Which sport is played on ice with a stick and a small black disc?", answer: "Ice Hockey" },
    { question: "Which sport involves sliding on snow with a board?", answer: "Snowboarding" },
    { question: "Which sport involves running races over short distances?", answer: "Sprinting" },
    { question: "Which sport uses a long stick and ball on grass or artificial turf?", answer: "Field Hockey" },
    { question: "Which sport involves riding waves on a board in the ocean?", answer: "Surfing" },
    { question: "Which sport is played with gloves, a ball, and a bat on a diamond field?", answer: "Baseball" },
    { question: "Which sport is played in winter and involves sliding stones on ice?", answer: "Curling" },
    { question: "Which sport involves racing boats using paddles?", answer: "Canoeing/Kayaking" },
    { question: "Which sport uses a ball and basket on a court?", answer: "Basketball" },
    { question: "Which sport is played by hitting a ball over a net using a racket and scoring points by landing it in the opponent’s court?", answer: "Tennis" }
]);

// Bulk-add Animals (red) questions provided by the user.
addQuestionsForColor("red", [
    { question: "Which animal is known as the king of the jungle?", answer: "Lion" },
    { question: "Which animal is the largest land animal?", answer: "Elephant" },
    { question: "Which animal can fly and is also a mammal?", answer: "Bat" },
    { question: "Which animal has a long neck and spots?", answer: "Giraffe" },
    { question: "Which animal is called man’s best friend?", answer: "Dog" },
    { question: "What is the fastest land animal?", answer: "Cheetah" },
    { question: "Which animal carries its baby in a pouch?", answer: "Kangaroo" },
    { question: "Which animal is black and white and eats bamboo?", answer: "Panda" },
    { question: "Which sea animal has eight arms?", answer: "Octopus" },
    { question: "Which animal is known for its hump?", answer: "Camel" },
    { question: "What is the largest mammal in the ocean?", answer: "Blue whale" },
    { question: "Which bird is known for mimicking human speech?", answer: "Parrot" },
    { question: "Which animal is famous for its shell and slow movement?", answer: "Tortoise" },
    { question: "Which animal hops and has strong back legs?", answer: "Frog" },
    { question: "What animal has stripes and lives in Africa?", answer: "Zebra" },
    { question: "Which insect produces honey?", answer: "Bee" },
    { question: "Which animal is pink and has a long neck in water?", answer: "Flamingo" },
    { question: "What is the largest type of big cat?", answer: "Tiger" },
    { question: "Which animal is called the ship of the desert?", answer: "Camel" },
    { question: "Which fish is known for its sharp teeth and dangerous bite?", answer: "Shark" },
    { question: "Which animal rolls into a ball for protection?", answer: "Hedgehog" },
    { question: "What animal is known for its black and white stripes and runs fast?", answer: "Zebra" },
    { question: "Which bird is known for swimming but cannot fly?", answer: "Penguin" },
    { question: "Which mammal lays eggs?", answer: "Platypus" },
    { question: "Which animal is famous for changing colors?", answer: "Chameleon" },
    { question: "Which animal uses echolocation to find food?", answer: "Bat" },
    { question: "Which animal is the tallest in the world?", answer: "Giraffe" },
    { question: "Which animal is called the king of the ocean?", answer: "Shark" },
    { question: "Which small insect can jump many times its body length?", answer: "Grasshopper" },
    { question: "Which animal is known for storing water in its body for a long time?", answer: "Camel" },
    { question: "Which bird has a long tail and beautiful feathers, often called a national bird in some countries?", answer: "Peacock" },
    { question: "Which animal has a trunk?", answer: "Elephant" },
    { question: "Which animal is nocturnal and hunts at night?", answer: "Owl" },
    { question: "Which insect has colorful wings and goes through metamorphosis?", answer: "Butterfly" },
    { question: "Which animal can spray a bad smell to protect itself?", answer: "Skunk" },
    { question: "Which mammal is known for swimming and having flippers?", answer: "Seal" },
    { question: "Which animal is famous for building dams?", answer: "Beaver" },
    { question: "Which bird is the fastest in the world?", answer: "Peregrine Falcon" },
    { question: "Which animal is slow and carries its home on its back?", answer: "Snail" },
    { question: "Which animal has antlers and lives in cold areas?", answer: "Reindeer" },
    { question: "Which insect is attracted to light at night?", answer: "Moth" },
    { question: "Which marine animal has a hard shell and moves very slowly?", answer: "Turtle" },
    { question: "Which animal is known for laughing-like sounds?", answer: "Hyena" },
    { question: "Which animal can live both in water and on land?", answer: "Frog" },
    { question: "Which bird lays the largest eggs?", answer: "Ostrich" },
    { question: "Which animal is famous for having black and white fur and climbing trees?", answer: "Panda" },
    { question: "Which animal is pink and curls its tail?", answer: "Pig" },
    { question: "Which insect makes buzzing sounds and can sting?", answer: "Bee" },
    { question: "Which animal has a long sticky tongue to catch insects?", answer: "Anteater" },
    { question: "Which animal lives in cold Arctic regions and has thick fur?", answer: "Polar Bear" },
    { question: "Which animal is the largest species of cat?", answer: "Tiger" },
    { question: "Which bird cannot fly but runs very fast?", answer: "Ostrich" },
    { question: "Which animal uses camouflage to hide from predators?", answer: "Chameleon" },
    { question: "Which animal sleeps while hanging upside down?", answer: "Bat" },
    { question: "Which mammal is known for carrying its young in a pouch?", answer: "Kangaroo" },
    { question: "Which insect can jump long distances and chirps in summer?", answer: "Grasshopper" },
    { question: "Which animal has a horn on its nose?", answer: "Rhinoceros" },
    { question: "Which animal is famous for its memory and intelligence?", answer: "Elephant" },
    { question: "Which bird can swim but not fly?", answer: "Penguin" },
    { question: "Which animal is called the desert fox?", answer: "Fennec Fox" },
    { question: "Which animal can survive without water for a long time?", answer: "Camel" },
    { question: "Which mammal has black and white stripes?", answer: "Zebra" },
    { question: "Which bird is known for building nests from mud?", answer: "Swallow" },
    { question: "Which animal changes its shape to escape predators?", answer: "Octopus" },
    { question: "Which insect is known for carrying germs but can fly?", answer: "Fly" },
    { question: "Which animal has scales and lays eggs in water?", answer: "Fish" },
    { question: "Which animal can glide in the air but is not a bird?", answer: "Flying Squirrel" },
    { question: "Which mammal lays eggs?", answer: "Platypus" },
    { question: "Which animal is famous for spinning webs?", answer: "Spider" },
    { question: "Which animal can live in both water and land?", answer: "Frog" },
    { question: "Which animal has a bushy tail and collects nuts?", answer: "Squirrel" },
    { question: "Which animal is known for its shell and lives in the ocean?", answer: "Turtle" },
    { question: "Which bird is famous for its song?", answer: "Nightingale" },
    { question: "Which mammal is known for hanging upside down and eating fruit?", answer: "Bat" },
    { question: "Which animal uses venom to defend itself?", answer: "Snake" },
    { question: "Which animal is black and white and lives in bamboo forests?", answer: "Panda" },
    { question: "Which animal can spray water to catch prey?", answer: "Archerfish" },
    { question: "Which bird migrates long distances every year?", answer: "Swallow" },
    { question: "Which insect makes a loud chirping sound in summer?", answer: "Cricket" },
    { question: "Which animal has a pouch for its baby and lives in Australia?", answer: "Kangaroo" },
    { question: "Which marine animal has a star shape?", answer: "Starfish" },
    { question: "Which animal is known as the fastest swimmer?", answer: "Sailfish" },
    { question: "Which animal is famous for hopping and living in Australia?", answer: "Kangaroo" },
    { question: "Which bird is a symbol of peace?", answer: "Dove" },
    { question: "Which animal is known for living in colonies and building hills?", answer: "Ant" },
    { question: "Which animal has long ears and hops?", answer: "Rabbit" },
    { question: "Which animal is famous for its hump and storing fat?", answer: "Camel" },
    { question: "Which animal can carry heavy loads and is used by humans in deserts?", answer: "Camel" },
    { question: "Which bird can rotate its head almost completely around?", answer: "Owl" },
    { question: "Which animal is called the sea cow?", answer: "Manatee" },
    { question: "Which animal is black and white and lives in cold places?", answer: "Penguin" },
    { question: "Which insect can produce light in the dark?", answer: "Firefly" },
    { question: "Which animal is called the king of the mountains?", answer: "Mountain Goat" },
    { question: "Which bird has a colorful beak and lives in tropical regions?", answer: "Toucan" },
    { question: "Which animal is slow and lives in trees?", answer: "Sloth" },
    { question: "Which animal is famous for its stripes and lives in Asia?", answer: "Tiger" },
    { question: "Which mammal lives in water, has fins, and breathes air?", answer: "Dolphin" },
    { question: "Which animal has a long tail and swings on trees?", answer: "Monkey" },
    { question: "Which animal is called the “ship of the desert”?", answer: "Camel" },
    { question: "Which animal makes a loud “roar” and is called the king of the jungle?", answer: "Lion" }
]);

// Bulk-add History (purple) questions provided by the user.
addQuestionsForColor("purple", [
    { question: "Who was the first President of the United States?", answer: "George Washington" },
    { question: "Who discovered America in 1492?", answer: "Christopher Columbus" },
    { question: "Who was the first man to walk on the Moon?", answer: "Neil Armstrong" },
    { question: "Which ancient civilization built the pyramids?", answer: "Egyptians" },
    { question: "Which famous wall is in China?", answer: "Great Wall of China" },
    { question: "Who was the famous leader of Nazi Germany during World War II?", answer: "Adolf Hitler" },
    { question: "Which war was fought between 1939 and 1945?", answer: "World War II" },
    { question: "Who was known for peaceful protests in India's independence movement?", answer: "Mahatma Gandhi" },
    { question: "Who was the first Emperor of Rome?", answer: "Augustus" },
    { question: "Which ship sank in 1912 after hitting an iceberg?", answer: "RMS Titanic" },
    { question: "Who invented the telephone?", answer: "Alexander Graham Bell" },
    { question: "Who invented the light bulb?", answer: "Thomas Edison" },
    { question: "Who was the famous nurse in the Crimean War?", answer: "Florence Nightingale" },
    { question: "Which explorer reached India by sea in 1498?", answer: "Vasco da Gama" },
    { question: "Which ancient civilization built the Colosseum?", answer: "Romans" },
    { question: "Which famous queen ruled England for a long time in the 19th century?", answer: "Queen Victoria" },
    { question: "Who painted the Mona Lisa?", answer: "Leonardo da Vinci" },
    { question: "Which war was fought between the North and South in the United States?", answer: "American Civil War" },
    { question: "Which famous speech is associated with 'I have a dream'?", answer: "Martin Luther King Jr." },
    { question: "Who was the first president of South Africa after apartheid?", answer: "Nelson Mandela" },
    { question: "Which famous wall divided a German city during the Cold War?", answer: "Berlin Wall" },
    { question: "Which explorer led the first voyage around the world?", answer: "Ferdinand Magellan" },
    { question: "Which country started the Industrial Revolution?", answer: "United Kingdom" },
    { question: "Who was the famous female pharaoh of Egypt?", answer: "Cleopatra" },
    { question: "Which ancient city was destroyed by a volcano in 79 AD?", answer: "Pompeii" },
    { question: "Which famous scientist developed the theory of gravity?", answer: "Isaac Newton" },
    { question: "Which war ended in 1918?", answer: "World War I" },
    { question: "Who was the famous leader of France during the French Revolution?", answer: "Napoleon Bonaparte" },
    { question: "Which famous statue is in New York Harbor?", answer: "Statue of Liberty" },
    { question: "Which famous scientist developed the theory of relativity?", answer: "Albert Einstein" },
    { question: "Which empire was ruled by Julius Caesar?", answer: "Roman Empire" },
    { question: "Which famous woman helped lead France during war?", answer: "Joan of Arc" },
    { question: "Which famous scientist studied evolution?", answer: "Charles Darwin" },
    { question: "Which American president ended slavery?", answer: "Abraham Lincoln" },
    { question: "Which ship carried the Pilgrims to America in 1620?", answer: "Mayflower" },
    { question: "Which famous city was the capital of the Roman Empire?", answer: "Rome" },
    { question: "Which empire built Machu Picchu?", answer: "Inca Empire" },
    { question: "Which famous monument is in Paris?", answer: "Eiffel Tower" },
    { question: "Which famous king had six wives?", answer: "Henry VIII" },
    { question: "Which war was fought between Britain and its American colonies?", answer: "American Revolutionary War" },
    { question: "Which ancient civilization invented democracy?", answer: "Greeks" },
    { question: "Which ancient civilization built the Parthenon?", answer: "Greeks" },
    { question: "Which famous explorer reached the South Pole?", answer: "Roald Amundsen" },
    { question: "Which famous scientist discovered penicillin?", answer: "Alexander Fleming" },
    { question: "Which ancient civilization lived in Mesopotamia?", answer: "Sumerians" },
    { question: "Who invented the printing press?", answer: "Johannes Gutenberg" },
    { question: "Which explorer discovered the Pacific Ocean from the Americas?", answer: "Vasco Núñez de Balboa" },
    { question: "Which civilization built the Parthenon temple?", answer: "Greeks" },
    { question: "Which empire ruled large parts of Asia and Europe under Genghis Khan?", answer: "Mongol Empire" },
    { question: "Which famous queen ruled England during the Victorian era?", answer: "Queen Victoria" },
    { question: "Which famous scientist invented the telephone?", answer: "Alexander Graham Bell" },
    { question: "Which famous leader fought for India's independence peacefully?", answer: "Mahatma Gandhi" },
    { question: "Which ancient empire built roads across Europe?", answer: "Roman Empire" },
    { question: "Which famous monument is in India?", answer: "Taj Mahal" },
    { question: "Which famous painting was created by Leonardo da Vinci?", answer: "Mona Lisa" },
    { question: "Which city is famous for the Colosseum?", answer: "Rome" },
    { question: "Which famous tower is in Paris?", answer: "Eiffel Tower" },
    { question: "Which country built the pyramids?", answer: "Egypt" },
    { question: "Which famous American president was assassinated in 1865?", answer: "Abraham Lincoln" },
    { question: "Which empire ruled Britain before the Anglo-Saxons?", answer: "Roman Empire" },
    { question: "Which famous general became emperor of France?", answer: "Napoleon Bonaparte" },
    { question: "Which famous scientist created the theory of relativity?", answer: "Albert Einstein" },
    { question: "Which explorer discovered the Pacific Ocean from the Americas?", answer: "Vasco Núñez de Balboa" }
]);

const playerPaths = {
    1: [12, 13, 14, 15, 11, 10, 9, 8, 4, 5, 6, 7, 3, 2, 1, 0],
    2: [15, 11, 7, 3, 2, 6, 10, 14, 13, 9, 5, 1, 0, 4, 8, 12],
    3: [3, 2, 1, 0, 4, 5, 6, 7, 11, 10, 9, 8, 12, 13, 14, 15],
    4: [0, 4, 8, 12, 13, 9, 5, 1, 2, 6, 10, 14, 15, 11, 7, 3]
};

players.forEach((player) => {
    player.token = document.getElementById(`p${player.id}-token`);
    player.baseRing = document.querySelector(`#base-${player.id} .base-token-ring`);
    player.pathTiles = playerPaths[player.id].map((tileIndex) => {
        return document.querySelectorAll(`.path-p${player.id} .tile`)[tileIndex];
    });
});

function moveTokenToBase(player) {
    player.baseRing.appendChild(player.token);
}
function setBoardVisibilityForActivePlayers(activeList) {
    const activeIds = activeList.map((p) => p.id);
    for (let i = 1; i <= 4; i += 1) {
        const baseElement = document.getElementById(`base-${i}`);
        if (baseElement) {
            baseElement.classList.toggle("hidden", !activeIds.includes(i));
        }
    }
}

function updatePlayerFormVisibility(count, humanCount = count) {
    playerInputRows.forEach((row) => {
        const playerId = Number(row.dataset.playerId);
        let hide = false;

        if (count === 2) {
            // For two players, use the top-opposite players: 1 and 3
            hide = !(playerId === 1 || playerId === 3);
        } else {
            hide = playerId > count;
        }

        if (!hide && playerId > humanCount) {
            // Hide AI-only slots from the name input form
            hide = true;
        }

        row.classList.toggle("hidden", hide);
    });
}

function updateHumanCountOptions(totalPlayers) {
    const currentValue = Number(humanCountSelect.value);
    humanCountSelect.innerHTML = "";
    for (let i = 1; i <= totalPlayers; i += 1) {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = `${i} Human${i === 1 ? "" : "s"}`;
        if (i === currentValue) {
            option.selected = true;
        }
        humanCountSelect.appendChild(option);
    }
    if (currentValue > totalPlayers) {
        humanCountSelect.value = String(totalPlayers);
    }
}

function applySelectedPlayers() {
    selectedPlayerCount = Number(playerCountSelect.value);
    const humanCount = Number(humanCountSelect.value);
    updatePlayerFormVisibility(selectedPlayerCount, humanCount);

    if (selectedPlayerCount === 2) {
        activePlayers = [players[0], players[2]];
    } else {
        activePlayers = players.slice(0, selectedPlayerCount);
    }

    activePlayers.forEach((player, index) => {
        if (index < humanCount) {
            player.isComputer = false;
            player.aiDifficulty = 'random';
        } else {
            player.isComputer = true;
            player.aiDifficulty = aiDifficultySelect.value || 'normal';
            player.name = `CPU ${index - humanCount + 1}`;
        }
    });
}

function hideExcludedPlayerTokens() {
    const activeIds = activePlayers.map((p) => p.id);
    players.forEach((player) => {
        const isActive = activeIds.includes(player.id);
        player.token.style.display = isActive ? "" : "none";
    });
}

function showExcludedPlayerTokens() {
    players.forEach((player) => {
        player.token.style.display = "";
    });
}

function resetGameState() {
    gameWon = false;
    isMoving = false;
    isPaused = false;
    clearComputerRollTimeout();
    currentPlayerIndex = 0;
    rollButton.disabled = false;
    clearMultiplayerRollTimer();
    triviaBox.classList.add("hidden");
    winnerOverlay.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    winnerTile.classList.remove("has-winner");
    document.body.classList.remove("game-paused");
    pauseButton.textContent = "Pause";
    statusBox.textContent = "Ready.";
    lastMoveText.textContent = "Game reset. Press Roll Die once the game starts.";
    diceResult.textContent = "?";

    players.forEach((player) => {
        player.hasLeftBase = false;
        player.position = -1;
        moveTokenToBase(player);
    });
    updateGameActionButtons();
}

function clearComputerRollTimeout() {
    if (computerRollTimeout) {
        clearTimeout(computerRollTimeout);
        computerRollTimeout = null;
    }
}

function showWinnerPopup(player, wonByDefault = false) {
    winnerNameLabel.textContent = wonByDefault ? `${player.name} wins by default!` : `${player.name} wins!`;
    if (winnerDetailName) {
        winnerDetailName.textContent = player.name;
    }
    if (winnerDetailColor) {
        winnerDetailColor.textContent = player.color;
    }
    
    // Clone and display the winner's token
    winnerTokenDisplay.innerHTML = "";
    
    // Add crown above token
    const crown = document.createElement("div");
    crown.className = "victory-crown";
    crown.textContent = "👑";
    winnerTokenDisplay.appendChild(crown);
    
    const tokenClone = player.token.cloneNode(true);
    tokenClone.style.display = "";
    winnerTokenDisplay.appendChild(tokenClone);
    
    winnerOverlay.classList.remove("hidden");
    
    // Trigger fireworks
    createFireworks();
}

function createFireworks() {
    const colors = ["#ffca08", "#ff3833", "#35c45e", "#a94fd8", "#4eddf0"];
    const particleCount = 40;
    
    fireworksContainer.innerHTML = "";
    
    for (let i = 0; i < particleCount; i += 1) {
        const particle = document.createElement("div");
        particle.className = "fireworks-particle";
        
        const color = colors[Math.floor(Math.random() * colors.length)];
        particle.style.backgroundColor = color;
        
        // Random position in the center-top area
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 3;
        particle.style.left = (centerX + (Math.random() - 0.5) * 100) + "px";
        particle.style.top = (centerY + (Math.random() - 0.5) * 100) + "px";
        
        // Random burst direction
        const angle = (Math.random() * Math.PI * 2);
        const distance = 200 + Math.random() * 300;
        const tx = Math.cos(angle) * distance;
        const ty = Math.sin(angle) * distance;
        
        particle.style.setProperty("--tx", tx + "px");
        particle.style.setProperty("--ty", ty + "px");
        particle.style.animation = `firework-burst ${0.8 + Math.random() * 0.4}s ease-out forwards`;
        particle.style.animationDelay = Math.random() * 0.2 + "s";
        
        fireworksContainer.appendChild(particle);
    }
}

function hideWinnerPopup() {
    winnerOverlay.classList.add("hidden");
    fireworksContainer.innerHTML = "";
}

function restartGame() {
    hideWinnerPopup();
    resetGameState();
    applySelectedPlayers();
    hideExcludedPlayerTokens();
    updateTurnDisplay();
}

function backToHome() {
    hideWinnerPopup();
    resetGameState();
    showExcludedPlayerTokens();
    setChatVisibility(false);
    clearMultiplayerRollTimer();
    clearComputerRollTimeout();
    gameContainer.classList.add("hidden");
    homePage.classList.remove("hidden");
}

function updateGameActionButtons() {
    pauseButton.classList.toggle("hidden", isMultiplayer);
    pauseButton.disabled = isMultiplayer || gameWon || isMoving;
    pauseButton.textContent = isPaused ? "Resume" : "Pause";
    quitButton.disabled = isMoving;
    optionsButton.disabled = isMoving || gameWon;
    musicToggleButton.disabled = optionsButton.disabled;
    if (optionsButton.disabled) {
        closeOptionsMenu();
    }
    updateMusicMenuLabel();
}

function updateMusicMenuLabel() {
    if (!musicToggleButton) {
        return;
    }
    musicToggleButton.textContent = `Music: ${gameSettings.musicOn ? "On" : "Off"}`;
}

function updateBackgroundMusic() {
    if (!backgroundMusic) {
        return;
    }

    backgroundMusic.volume = 0.4;
    backgroundMusic.muted = !gameSettings.musicOn;
    if (gameSettings.musicOn) {
        backgroundMusic.play().catch(() => {
            // Play may fail until user interacts with the page.
        });
    } else {
        backgroundMusic.pause();
    }
}

function toggleOptionsMenu(event) {
    event.stopPropagation();
    const open = !optionsMenu.classList.contains("hidden");
    if (open) {
        closeOptionsMenu();
        return;
    }

    if (!optionsButton.disabled) {
        optionsMenu.classList.remove("hidden");
        optionsButton.setAttribute("aria-expanded", "true");
    }
}

function closeOptionsMenu() {
    optionsMenu.classList.add("hidden");
    optionsButton.setAttribute("aria-expanded", "false");
}

function setPaused(paused) {
    if (isMultiplayer || gameWon || isMoving) {
        return;
    }

    isPaused = paused;
    document.body.classList.toggle("game-paused", isPaused);
    pauseOverlay.classList.toggle("hidden", !isPaused);
    rollButton.disabled = isPaused;
    statusBox.textContent = isPaused ? "Game paused." : "Game resumed.";

    if (isPaused) {
        clearComputerRollTimeout();
    } else {
        updateTurnDisplay();
        scheduleComputerRoll();
    }

    updateGameActionButtons();
}

function togglePause() {
    closeOptionsMenu();
    setPaused(!isPaused);
}

function toggleMusic() {
    gameSettings.musicOn = !gameSettings.musicOn;
    musicToggle.checked = gameSettings.musicOn;
    updateMusicMenuLabel();
    updateBackgroundMusic();
    statusBox.textContent = `Background music ${gameSettings.musicOn ? "enabled" : "disabled"}.`;
    closeOptionsMenu();
}

function quitCurrentGame() {
    if (isMoving) {
        statusBox.textContent = "Finish the current move before quitting.";
        return;
    }

    closeOptionsMenu();
    showQuitConfirmation();
}

function showQuitConfirmation() {
    if (!quitConfirmationOverlay) {
        performQuitCurrentGame();
        return;
    }

    quitConfirmationOverlay.classList.remove("hidden");
}

function hideQuitConfirmation() {
    if (!quitConfirmationOverlay) {
        return;
    }

    quitConfirmationOverlay.classList.add("hidden");
}

function confirmQuitCurrentGame() {
    hideQuitConfirmation();
    performQuitCurrentGame();
}

function performQuitCurrentGame() {
    if (isMultiplayer) {
        multiplayerManager.leaveRoom();
        clearMultiplayerRollTimer();
        setChatVisibility(false);
        isMultiplayer = false;
        currentPlayerId = null;
        currentRoomCode = null;
        isHostPlayer = false;
        connectedPlayers = [];
        if (multiplayerWebSocket) {
            multiplayerWebSocket.close();
            multiplayerWebSocket = null;
        }
    }

    backToHome();
}

function removePlayerFromActiveGame(playerId, defaultWinnerId = null) {
    const leavingPlayer = players.find((player) => player.id === playerId);
    const leavingIndex = activePlayers.findIndex((player) => player.id === playerId);

    if (leavingPlayer) {
        leavingPlayer.token.style.display = "none";
        moveTokenToBase(leavingPlayer);
    }

    if (leavingIndex !== -1) {
        activePlayers.splice(leavingIndex, 1);

        if (leavingIndex < currentPlayerIndex) {
            currentPlayerIndex -= 1;
        } else if (leavingIndex === currentPlayerIndex && currentPlayerIndex >= activePlayers.length) {
            currentPlayerIndex = 0;
        }
    }

    selectedPlayerCount = activePlayers.length;

    if (defaultWinnerId || activePlayers.length === 1) {
        const winner = players.find((player) => player.id === (defaultWinnerId || activePlayers[0]?.id));
        if (winner && !gameWon) {
            declareWinner(winner, true);
        }
        return;
    }

    if (activePlayers.length > 0) {
        hideExcludedPlayerTokens();
        statusBox.textContent = `${getPlayerNameById(playerId)} left. ${activePlayers.length} players remain.`;
        lastMoveText.textContent = `${getPlayerNameById(playerId)} quit the online game.`;
        updateTurnDisplay();
    }
}

function rollDie(player) {
    if (player.hasLeftBase) {
        return Math.floor(Math.random() * 6) + 1;
    }

    // Before leaving base, six is favored but the roll still stays random.
    return Math.random() < 0.6 ? 6 : Math.floor(Math.random() * 5) + 1;
}

function isCurrentPlayerComputer() {
    const player = activePlayers[currentPlayerIndex];
    return player?.isComputer === true;
}

function scheduleComputerRoll() {
    clearComputerRollTimeout();
    if (gameWon || isMoving || isPaused || !isCurrentPlayerComputer()) {
        return;
    }

    const delay = 800 + Math.floor(Math.random() * 1200);
    rollButton.disabled = true;
    computerRollTimeout = setTimeout(() => {
        computerRollTimeout = null;
        if (!isMoving && !isPaused && isCurrentPlayerComputer() && !gameWon) {
            handleRoll();
        }
    }, delay);
}

function updateTurnDisplay() {
    const player = activePlayers[currentPlayerIndex];
    currentPlayerText.textContent = `${player.name} (${player.color})`;
    turnIndicator.style.borderLeftColor = playerAccent[player.color];
    if (isPaused) {
        rollButton.disabled = true;
        updateGameActionButtons();
        return;
    }
    if (player.isComputer) {
        rollButton.disabled = true;
        clearMultiplayerRollTimer();
    } else {
        rollButton.disabled = gameWon || isMoving;
        // Start auto-roll timer for multiplayer
        if (isMultiplayer && !gameWon && !isMoving) {
            startMultiplayerRollTimer();
        }
    }
    updateGameActionButtons();
}

function applyPlayerNames() {
    const humanCount = Number(humanCountSelect.value);
    players.forEach((player, index) => {
        if (index < humanCount) {
            const inputValue = playerNameInputs[index]?.value.trim();
            const chosenName = inputValue || `Player ${player.id}`;
            player.name = chosenName;
            if (baseNameLabels[index]) {
                baseNameLabels[index].textContent = chosenName;
            }
        } else {
            const cpuName = `CPU ${index - humanCount + 1}`;
            player.name = cpuName;
            if (baseNameLabels[index]) {
                baseNameLabels[index].textContent = cpuName;
            }
        }
    });
}

playerCountSelect.addEventListener("change", () => {
    const selectedCount = Number(playerCountSelect.value);
    updateHumanCountOptions(selectedCount);
    updatePlayerFormVisibility(selectedCount, Number(humanCountSelect.value));
});

humanCountSelect.addEventListener("change", () => {
    const selectedCount = Number(playerCountSelect.value);
    updatePlayerFormVisibility(selectedCount, Number(humanCountSelect.value));
});

updateHumanCountOptions(selectedPlayerCount);
updatePlayerFormVisibility(selectedPlayerCount, Number(humanCountSelect.value));

function startGame() {
    isMultiplayer = false;
    setChatVisibility(false);
    applyPlayerNames();
    applySelectedPlayers();
    hideExcludedPlayerTokens();
    homePage.classList.add("hidden");
    gameContainer.classList.remove("hidden");
    isPaused = false;
    pauseOverlay.classList.add("hidden");
    document.body.classList.remove("game-paused");
    updateTurnDisplay();
}

function moveToNextPlayer() {
    currentPlayerIndex = (currentPlayerIndex + 1) % activePlayers.length;
    updateTurnDisplay();
}

function placeToken(player) {
    if (player.position >= player.pathTiles.length) {
        winnerTile.appendChild(player.token);
        return;
    }

    player.pathTiles[player.position].appendChild(player.token);
}

function declareWinner(player, wonByDefault = false) {
    gameWon = true;
    isMoving = false;
    isPaused = false;
    clearMultiplayerRollTimer();
    clearComputerRollTimeout();
    pauseOverlay.classList.add("hidden");
    document.body.classList.remove("game-paused");
    winnerTile.classList.add("has-winner");
    rollButton.disabled = true;
    updateGameActionButtons();
    statusBox.textContent = wonByDefault ? `${player.name} won by default.` : `${player.name} won the game.`;
    lastMoveText.textContent = wonByDefault
        ? `${player.name} (${player.color}) is the last player remaining.`
        : `${player.name} (${player.color}) reached WINNER.`;
    showWinnerPopup(player, wonByDefault);
}

function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function getTileColor(tile) {
    return ["blue", "red", "green", "yellow", "purple", "pink"].find((color) => {
        return tile.classList.contains(color);
    }) || "yellow";
}

function getRandomQuestion(color) {
    const deck = questionDecks[color] || questionDecks.yellow;

    // Initialize or refill the pool for this color by shuffling the deck copy
    if (!questionPools[color] || questionPools[color].length === 0) {
        questionPools[color] = shuffleArray(deck.slice());
    }

    // Pop one card from the pool (random without replacement)
    return questionPools[color].pop();
}

function playAnswerSound(isCorrect) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
        return;
    }

    const context = new AudioContext();
    context.resume();
    const rootTime = context.currentTime;
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.0, rootTime);
    masterGain.connect(context.destination);

    function createOscillator(type, frequency) {
        const osc = context.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, rootTime);
        osc.connect(masterGain);
        return osc;
    }

    function scheduleTone(osc, duration) {
        osc.start(rootTime);
        osc.stop(rootTime + duration);
    }

    masterGain.gain.linearRampToValueAtTime(0.18, rootTime + 0.02);

    if (isCorrect) {
        const lead = createOscillator("triangle", 880);
        const shimmer = createOscillator("square", 440);

        lead.frequency.setValueAtTime(880, rootTime);
        lead.frequency.linearRampToValueAtTime(1046, rootTime + 0.16);
        lead.frequency.linearRampToValueAtTime(1318, rootTime + 0.32);

        shimmer.frequency.setValueAtTime(440, rootTime);
        shimmer.frequency.linearRampToValueAtTime(660, rootTime + 0.32);

        const stereoGain = context.createGain();
        shimmer.disconnect();
        shimmer.connect(stereoGain);
        stereoGain.connect(masterGain);
        stereoGain.gain.setValueAtTime(0.08, rootTime);

        scheduleTone(lead, 0.36);
        scheduleTone(shimmer, 0.36);
    } else {
        const lowOsc = createOscillator("sawtooth", 440);
        const midOsc = createOscillator("triangle", 330);

        midOsc.frequency.setValueAtTime(330, rootTime);
        midOsc.frequency.exponentialRampToValueAtTime(220, rootTime + 0.42);

        scheduleTone(lowOsc, 0.42);
        scheduleTone(midOsc, 0.42);
    }

    masterGain.gain.exponentialRampToValueAtTime(0.001, rootTime + 0.45);

    setTimeout(() => {
        if (context.state !== "closed") {
            context.close();
        }
    }, 600);
}

function playDiceSound(durationMs = 720) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
        return;
    }

    const context = new AudioContext();
    context.resume();
    const rootTime = context.currentTime;
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.0, rootTime);
    masterGain.connect(context.destination);

    const noiseBuffer = context.createBuffer(1, context.sampleRate * (durationMs / 1000), context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * 0.12;
    }

    const noiseSource = context.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = false;

    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1000, rootTime);
    filter.Q.setValueAtTime(1.2, rootTime);

    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.0, rootTime);
    noiseGain.gain.linearRampToValueAtTime(0.16, rootTime + 0.05);
    noiseGain.gain.setValueAtTime(0.16, rootTime + durationMs / 1000 - 0.1);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, rootTime + durationMs / 1000);

    noiseSource.connect(filter).connect(noiseGain).connect(masterGain);
    noiseSource.start(rootTime);
    noiseSource.stop(rootTime + durationMs / 1000 + 0.02);

    const click = context.createOscillator();
    click.type = "triangle";
    click.frequency.setValueAtTime(1400, rootTime + durationMs / 1000 - 0.1);
    const clickGain = context.createGain();
    clickGain.gain.setValueAtTime(0.18, rootTime + durationMs / 1000 - 0.1);
    clickGain.gain.exponentialRampToValueAtTime(0.001, rootTime + durationMs / 1000);
    click.connect(clickGain).connect(masterGain);
    click.start(rootTime + durationMs / 1000 - 0.1);
    click.stop(rootTime + durationMs / 1000 + 0.02);

    setTimeout(() => {
        if (context.state !== "closed") {
            context.close();
        }
    }, durationMs + 250);
}

function shuffleArray(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function askQuestion(player, roll) {
    const landingTile = player.pathTiles[player.position];
    const color = getTileColor(landingTile);
    const card = getRandomQuestion(color);
    let timeLeft = gameSettings.answerTimer;

    categoryName.textContent = `${categoryByColor[color]} (${color})`;
    questionText.textContent = card.question;
    timerDisplay.textContent = String(timeLeft);
    triviaOptions.innerHTML = "";
    triviaFeedback.textContent = "";
    triviaFeedback.className = "hidden";
    triviaBox.classList.remove("hidden");
    statusBox.textContent = `${player.name} landed on ${color}. Answer in ${gameSettings.answerTimer} seconds.`;

    const shuffledOptions = shuffleArray(card.options);

    return new Promise((resolve) => {
        let answered = false;

        function finish(isCorrect) {
            if (answered) {
                return;
            }

            answered = true;
            clearInterval(timer);
            triviaOptions.querySelectorAll("button").forEach((button) => {
                button.disabled = true;
            });

            triviaFeedback.textContent = isCorrect
                ? `Correct! ${player.name} got it.`
                : `Wrong. The right answer is "${card.answer}".`;
            triviaFeedback.className = isCorrect ? "correct" : "wrong";

            playAnswerSound(isCorrect);

            const hideDelay = isCorrect ? 1000 : 5000;
            setTimeout(() => {
                triviaBox.classList.add("hidden");
                resolve({ isCorrect, color, category: categoryByColor[color], roll });
            }, hideDelay);
        }

        shuffledOptions.forEach((option) => {
            const button = document.createElement("button");
            button.textContent = option;
            button.addEventListener("click", () => {
                finish(option === card.answer);
            });
            triviaOptions.appendChild(button);
        });

        // If this player is controlled by the computer, simulate an answer
        if (player.isComputer) {
            triviaFeedback.textContent = "AI is thinking...";
            triviaFeedback.className = "ai-thinking";
            const level = player.aiDifficulty || 'normal';
            const prob = aiDifficultyMap[level] ?? 0.5;
            const delayRanges = {
                easy: [1500, 3500],
                normal: [1000, 2500],
                hard: [700, 1800],
                expert: [500, 1200]
            };
            const range = delayRanges[level] || delayRanges.normal;
            const delay = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];

            setTimeout(() => {
                const buttons = Array.from(triviaOptions.querySelectorAll('button'));
                const correctIndex = buttons.findIndex((b) => b.textContent === card.answer);
                const willChooseCorrect = Math.random() < prob;
                let chosenButton;

                if (willChooseCorrect && correctIndex !== -1) {
                    chosenButton = buttons[correctIndex];
                } else {
                    const wrongButtons = buttons.filter((button) => button.textContent !== card.answer);
                    chosenButton = wrongButtons[Math.floor(Math.random() * wrongButtons.length)];
                }

                if (chosenButton) {
                    chosenButton.classList.add('ai-selected');
                    chosenButton.click();
                }
            }, delay);
        }

        const timer = setInterval(() => {
            timeLeft -= 1;
            timerDisplay.textContent = String(timeLeft);

            if (timeLeft <= 0) {
                finish(false);
            }
        }, 1000);
    });
}

async function moveOneTile(player, direction) {
    player.position += direction;

    if (player.position < 0) {
        player.position = 0;
    }

    placeToken(player);

    if (player.position >= player.pathTiles.length) {
        declareWinner(player);
        return;
    }

    await wait(260);
}

async function applyQuestionResult(player, result) {
    if (result.roll <= 3) {
        if (result.isCorrect) {
                statusBox.textContent = "Correct. Stay on this tile.";
            return;
        }

        statusBox.textContent = "Wrong. Move back one tile.";
        await moveOneTile(player, -1);
        return;
    }

    if (result.isCorrect) {
        statusBox.textContent = "Correct. Move forward one tile.";
        await moveOneTile(player, 1);
        return;
    }

    statusBox.textContent = "Wrong. Stay on this tile.";
}

async function animateDieRoll(roll) {
    playDiceSound(720);
    dieFace.classList.remove("rolling");
    void dieFace.offsetWidth;
    dieFace.classList.add("rolling");
    await wait(720);
    dieFace.classList.remove("rolling");
    dieFace.dataset.roll = String(roll);
}

async function moveTokenByRoll(player, roll) {
    for (let step = 0; step < roll; step += 1) {
        player.position += 1;
        placeToken(player);

        if (player.position >= player.pathTiles.length) {
            declareWinner(player);
            return;
        }

        statusBox.textContent = `${player.name} moving ${step + 1} of ${roll}.`;
        await wait(260);
    }
}

async function handleRoll() {
    if (gameWon || isMoving || isPaused) {
        return;
    }

    clearMultiplayerRollTimer();
    clearComputerRollTimeout();

    isMoving = true;
    rollButton.disabled = true;
    updateGameActionButtons();

    const player = activePlayers[currentPlayerIndex];
    const roll = rollDie(player);
    const wasInBase = !player.hasLeftBase;

    diceResult.textContent = roll;
    await animateDieRoll(roll);

    if (wasInBase && roll === 6) {
        player.hasLeftBase = true;
        player.position = 0;
        placeToken(player);
        statusBox.textContent = `${player.name} rolled 6 and left base. Answer trivia to continue.`;
        await wait(260);
    } else if (wasInBase) {
        statusBox.textContent = `${player.name} needs a 6 to leave base.`;
    } else {
        statusBox.textContent = `${player.name} rolled ${roll}. Answer trivia to resolve movement.`;
    }

    if (player.hasLeftBase && !gameWon) {
        const questionResult = await askQuestion(player, roll);
        await applyQuestionResult(player, questionResult);

        if (gameWon) {
            return;
        }
    }

    lastMoveText.textContent = `${player.name} (${player.color}) rolled ${roll}.`;
    moveToNextPlayer();
    isMoving = false;
    const nextPlayer = activePlayers[currentPlayerIndex];
    if (!nextPlayer.isComputer) {
        rollButton.disabled = false;
    }
    updateGameActionButtons();
    scheduleComputerRoll();
}

function startGame() {
    isMultiplayer = false;
    setChatVisibility(false);
    applyPlayerNames();
    applySelectedPlayers();
    hideExcludedPlayerTokens();
    homePage.classList.add("hidden");
    gameContainer.classList.remove("hidden");
    isPaused = false;
    pauseOverlay.classList.add("hidden");
    document.body.classList.remove("game-paused");
    updateTurnDisplay();
    if (backgroundMusic && gameSettings.musicOn) {
        backgroundMusic.currentTime = 0;
    }
    updateBackgroundMusic();
    scheduleComputerRoll();
}

startButton.addEventListener("click", startGame);
editPlayersButton.addEventListener("click", () => {
    playerEditorOverlay.classList.remove("hidden");
});
closePlayerEditorButton.addEventListener("click", () => {
    playerEditorOverlay.classList.add("hidden");
});
confirmPlayerSelectionButton.addEventListener("click", () => {
    applyPlayerNames();
    applySelectedPlayers();
    playerEditorOverlay.classList.add("hidden");
});

optionsButton.addEventListener("click", toggleOptionsMenu);
optionsMenu.addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", () => {
    if (!optionsMenu.classList.contains("hidden")) {
        closeOptionsMenu();
    }
});
howToPlayButton.addEventListener("click", () => {
    howToPlayOverlay.classList.remove("hidden");
});
closeHowToPlayButton.addEventListener("click", () => {
    howToPlayOverlay.classList.add("hidden");
});
restartButton.addEventListener("click", restartGame);
homeButton.addEventListener("click", backToHome);
rollButton.addEventListener("click", handleRoll);
pauseButton.addEventListener("click", togglePause);
musicToggleButton.addEventListener("click", toggleMusic);
quitButton.addEventListener("click", quitCurrentGame);
settingsButton.addEventListener("click", () => {
    settingsOverlay.classList.remove("hidden");
});
closeSettingsButton.addEventListener("click", () => {
    settingsOverlay.classList.add("hidden");
});
questionSubmitButton.addEventListener("click", () => {
    questionSubmitOverlay.classList.remove("hidden");
});
closeQuestionSubmitButton.addEventListener("click", () => {
    questionSubmitOverlay.classList.add("hidden");
});
submitQuestionConfirmButton.addEventListener("click", submitNewQuestion);

// ============ MULTIPLAYER EVENT LISTENERS ============
multiplayerButton.addEventListener("click", async () => {
    showMultiplayerMenu();
    try {
        await multiplayerManager.connect();
        console.log('Connected to multiplayer server');
    } catch (error) {
        console.error('Failed to connect to server:', error);
        showRoomStatus('Failed to connect to server. Make sure server is running on port 3000.', 'error');
    }
});

document.getElementById("create-room-btn").addEventListener("click", () => {
    multiplayerManager.createRoom();
});

document.getElementById("join-room-btn").addEventListener("click", () => {
    const roomCode = document.getElementById("room-code-input").value.trim();
    if (roomCode.length !== 4 || !/^\d+$/.test(roomCode)) {
        showRoomStatus('Please enter a valid 4-digit room code', 'error');
        return;
    }
    multiplayerManager.joinRoom(roomCode);
});

document.getElementById("back-to-home-btn").addEventListener("click", () => {
    document.getElementById("multiplayer-menu").classList.add("hidden");
    homePage.classList.remove("hidden");
    if (multiplayerWebSocket) {
        multiplayerWebSocket.close();
    }
});

document.getElementById("close-waiting-room").addEventListener("click", () => {
    hideWaitingRoom();
    document.getElementById("multiplayer-menu").classList.remove("hidden");
});

document.getElementById("start-multiplayer-btn").addEventListener("click", () => {
    if (isHostPlayer) {
        multiplayerManager.startGame();
    }
});

document.getElementById("leave-room-btn").addEventListener("click", () => {
    hideWaitingRoom();
    document.getElementById("multiplayer-menu").classList.remove("hidden");
    setChatVisibility(false);
    isMultiplayer = false;
    currentPlayerId = null;
    currentRoomCode = null;
    isHostPlayer = false;
    if (multiplayerWebSocket) {
        multiplayerWebSocket.close();
    }
});

sendChatBtn.addEventListener('click', sendChatText);
chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        sendChatText();
    }
});
emojiButtons.forEach((button) => {
    button.addEventListener('click', () => {
        sendChatReaction(button.textContent);
    });
});

function setTheme(theme) {
    document.body.classList.remove('theme-dark', 'theme-light', 'theme-neon');
    document.body.classList.add(theme);
    gameSettings.theme = theme;
}

function applySettings() {
    gameSettings.difficultyMode = difficultyModeSelect.value;
    gameSettings.answerTimer = Number(questionTimerSelect.value) || 10;
    setTheme(boardThemeSelect.value);
    gameSettings.musicOn = musicToggle.checked;
    gameSettings.soundOn = soundToggle.checked;
    updateMusicMenuLabel();
    updateBackgroundMusic();
    settingsOverlay.classList.add('hidden');
    statusBox.textContent = `Settings saved: ${gameSettings.answerTimer}s timer, ${gameSettings.difficultyMode} mode, ${gameSettings.theme.replace('theme-', '')} theme.`;

    if (isMultiplayer && isHostPlayer) {
        multiplayerManager.sendPlayerAction('SYNC_THEME', { theme: gameSettings.theme });
    }
}

function submitNewQuestion() {
    const category = questionCategorySelect.value;
    const question = questionTextInput.value.trim();
    const answer = questionAnswerInput.value.trim();

    if (!question || !answer) {
        alert('Please enter both a question and an answer before submitting.');
        return;
    }

    if (!questionDecks[category]) {
        questionDecks[category] = [];
    }

    questionDecks[category].push({ question, answer });
    normalizeQuestionDecks();

    alert('Thank you! Your question has been added to the deck.');
    questionTextInput.value = '';
    questionAnswerInput.value = '';
    questionSubmitOverlay.classList.add('hidden');
}

questionTimerSelect.addEventListener('change', applySettings);
boardThemeSelect.addEventListener('change', applySettings);
difficultyModeSelect.addEventListener('change', applySettings);
musicToggle.addEventListener('change', applySettings);
soundToggle.addEventListener('change', applySettings);
quitConfirmButton?.addEventListener('click', confirmQuitCurrentGame);
quitCancelButton?.addEventListener('click', hideQuitConfirmation);

setTheme(gameSettings.theme);
updateMusicMenuLabel();
updateBackgroundMusic();

window.addEventListener('load', () => {
    if (backgroundMusic && gameSettings.musicOn) {
        backgroundMusic.currentTime = 0;
        updateBackgroundMusic();
    }

    if (!introOverlay) return;
    setTimeout(() => {
        introOverlay.style.display = 'none';
    }, 4000);
});

// Fallback for browsers that block autoplay until user interaction.
document.addEventListener('click', () => {
    if (backgroundMusic && gameSettings.musicOn && backgroundMusic.paused) {
        backgroundMusic.play().catch(() => {
            // Ignore autoplay permission errors; audio will resume after a user click.
        });
    }
}, { once: true });

// ============ END MULTIPLAYER EVENT LISTENERS ============

function normalizeQuestionDecks() {
    Object.keys(questionDecks).forEach((color) => {
        const deck = questionDecks[color];
        if (!Array.isArray(deck)) {
            return;
        }

        deck.forEach((card) => {
            if (!Array.isArray(card.options) || card.options.length === 0) {
                const distractors = generateDistractors(card.answer, color, 2, card.question);
                card.options = shuffleArray([card.answer, ...distractors]);
            }
        });
    });
}

normalizeQuestionDecks();
updateTurnDisplay();
