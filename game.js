
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
    getDatabase,
    ref,
    set,
    get,
    onValue,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

import {
    getAuth,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";


// 1. FIREBASE CONFIGURATION

const firebaseConfig = {
  apiKey: "AIzaSyA8J0bUNHFrEG3EuK2e_ndgKHhLoAHVyhA",
  authDomain: "rock-paper-scissors-16cab.firebaseapp.com",
  databaseURL: "https://rock-paper-scissors-16cab-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rock-paper-scissors-16cab",
  storageBucket: "rock-paper-scissors-16cab.firebasestorage.app",
  messagingSenderId: "414842285781",
  appId: "1:414842285781:web:97c1b502167b15feb77c5c"
};


// 2. INITIALIZE FIREBASE

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);


// 3. GAME VARIABLES

let currentUser = null;
let currentRoom = null;
let currentRole = null;
let roomListener = null;
let inviteLink = "";


// 4. HTML ELEMENTS

const statusText = document.getElementById("status");
const createButton = document.getElementById("create-room");
const joinButton = document.getElementById("join-room");
const roomInput = document.getElementById("room-input");
const roomCodeText = document.getElementById("room-code");
const gameSection = document.getElementById("game-section");
const resultText = document.getElementById("result");

const choiceButtons = document.querySelectorAll(".choice");
const copyLinkButton = document.getElementById("copy-link");


// 5. AUTHENTICATE PLAYER

async function initializePlayer() {
    try {
        const credentials = await signInAnonymously(auth);

        currentUser = credentials.user;

        const roomFromUrl = new URLSearchParams(window.location.search).get("room");

        if (roomFromUrl) {
            roomInput.value = roomFromUrl;
            await joinGame();
        } else {
            statusText.textContent = "Connected! Create or join a game.";
        }

    } catch (error) {
        console.error(error);
        statusText.textContent = "Connection failed. Please reload.";
    }
}


// 6. GENERATE ROOM CODE

function generateRoomCode() {
    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const randomValues = new Uint32Array(6);

    crypto.getRandomValues(randomValues);

    return Array.from(randomValues)
        .map(value => characters[value % characters.length])
        .join("");
}


// 7. CREATE GAME


async function createGame() {
    if (!currentUser) return;

    try {
        createButton.disabled = true;

        const code = generateRoomCode();
        const roomRef = ref(db, "rooms/" + code);

        await set(roomRef, {
            player1: currentUser.uid,
            player2: null,
            status: "waiting",
            round: 1,
            choices: {
                player1: null,
                player2: null
            }
        });

        currentRoom = code;
        currentRole = "player1";

        const url = new URL(window.location.href);
        url.searchParams.set("room", code);
        inviteLink = url.toString();

        copyLinkButton.style.display = "block";

        enterGame();

    } catch (error) {
        console.error(error);
        statusText.textContent = "Could not create game.";
        createButton.disabled = false;
    }
}



// 8. JOIN GAME


async function joinGame() {
    if (!currentUser) return;

    const code = roomInput.value.trim().toUpperCase();

    if (!code) {
        statusText.textContent = "Enter a room code.";
        return;
    }

    try {
        joinButton.disabled = true;

        const roomRef = ref(db, "rooms/" + code);
        const roomSnapshot = await get(roomRef);
        const room = roomSnapshot.val();

        if (!room) {
            statusText.textContent = "Room not found.";
            joinButton.disabled = false;
            return;
        }

        if (room.player1 === currentUser.uid) {
            currentRoom = code;
            currentRole = "player1";
            enterGame();
            return;
        }

        const player2Ref = ref(
            db,
            "rooms/" + code + "/player2"
        );

        const transaction = await runTransaction(
            player2Ref,
            currentPlayer => {
                if (currentPlayer === currentUser.uid) {
                    return currentPlayer;
                }

                if (currentPlayer !== null) {
                    return;
                }

                return currentUser.uid;
            }
        );

        if (!transaction.committed) {
            statusText.textContent =
                "Room is already full.";

            joinButton.disabled = false;
            return;
        }

        currentRoom = code;
        currentRole = "player2";

        enterGame();

    } catch (error) {
        console.error(error);
        statusText.textContent = "Could not join game.";
        joinButton.disabled = false;
    }
}



// 9. ENTER GAME

function enterGame() {
    gameSection.style.display = "block";

    roomCodeText.textContent =
        "Room code: " + currentRoom;

    statusText.textContent =
        currentRole === "player1"
            ? "You are Player 1."
            : "You are Player 2.";

    choiceButtons.forEach(button => {
        button.disabled = false;
        button.classList.remove("selected");
    });

    listenToRoom();
}


// 10. LISTEN FOR DATABASE UPDATES

function listenToRoom() {
    const roomRef = ref(db, "rooms/" + currentRoom);

    if (roomListener) {
        roomListener();
    }

    roomListener = onValue(roomRef, snapshot => {
        const room = snapshot.val();

        if (!room) {
            statusText.textContent = "Room no longer exists.";
            return;
        }

        if (!room.player2) {
            statusText.textContent =
                "Waiting for your friend to join...";
            return;
        }

        statusText.textContent = "Both players connected!";

        updateGame(room);
    });
}


// 11. PROCESS GAME STATE

function updateGame(room) {
    const myChoice = room.choices[currentRole];

    const friendRole =
        currentRole === "player1"
            ? "player2"
            : "player1";

    const friendChoice = room.choices[friendRole];

    choiceButtons.forEach(button => {
        const selected = button.dataset.choice === myChoice;

        button.classList.toggle("selected", selected);
        button.disabled = !!myChoice;
    });

    if (!myChoice) {
        resultText.textContent = "Make your move!";
        return;
    }

    if (!friendChoice) {
        resultText.textContent = "Waiting for your friend...";
        return;
    }

    let result;

    if (myChoice === friendChoice) {
        result = "It's a draw!";
    } else if (
        (myChoice === "rock" && friendChoice === "scissors") ||
        (myChoice === "paper" && friendChoice === "rock") ||
        (myChoice === "scissors" && friendChoice === "paper")
    ) {
        result = "You win!";
    } else {
        result = "Your friend wins!";
    }

    resultText.textContent =
        "You: " + myChoice +
        " | Friend: " + friendChoice +
        " — " + result;
}


// 12. SUBMIT A CHOICE

async function submitChoice(choice) {
    if (!currentRoom || !currentRole) return;

    try {
        const choiceRef = ref(
            db,
            "rooms/" + currentRoom + "/choices/" + currentRole
        );

        await set(choiceRef, choice);

    } catch (error) {
        console.error(error);
        resultText.textContent = "Could not submit your move.";
    }
}


// 13. CONNECT BUTTONS

createButton.addEventListener("click", createGame);
joinButton.addEventListener("click", joinGame);

choiceButtons.forEach(button => {
    button.addEventListener("click", () => {
        submitChoice(button.dataset.choice);
    });
});

copyLinkButton.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(inviteLink);
        statusText.textContent = "Invite link copied!";
    } catch (error) {
        console.error(error);
        statusText.textContent = "Could not copy link.";
    }
});

// 14. START

initializePlayer();