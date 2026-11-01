
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
            },
            scores: {
                player1: 0,
                player2: 0,
                draws: 0
            },
            lastResult: null
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

    const myScore = room.scores?.[currentRole] ?? 0;
    const friendScore = room.scores?.[friendRole] ?? 0;
    const draws = room.scores?.draws ?? 0;

    document.getElementById("my-score").textContent = myScore;
    document.getElementById("friend-score").textContent = friendScore;
    document.getElementById("draw-score").textContent = draws;

    const roundComplete = !!myChoice && !!friendChoice;

    choiceButtons.forEach(button => {
        const selected = !roundComplete &&
            button.dataset.choice === myChoice;

        button.classList.toggle("selected", selected);
        button.disabled = !!myChoice && !roundComplete;
    });

    if (!myChoice && !friendChoice) {
        resultText.textContent =
            "Round " + room.round + "\nMake your move!";
        return;
    }

    if (!myChoice) {
        resultText.textContent =
            "Round " + room.round +
            "\nYour friend has chosen. Your turn!";
        return;
    }

    if (!friendChoice) {
        resultText.textContent =
            "Round " + room.round +
            "\nWaiting for your friend...";
        return;
    }

    let result;

    if (room.lastResult === "draw") {
        result = "It's a draw!";
    } else if (room.lastResult === currentRole) {
        result = "You win!";
    } else {
        result = "You lose!";
    }

    resultText.textContent =
        "Round " + room.round + "\n" +
        "You chose: " + myChoice + "\n" +
        "Friend chose: " + friendChoice + "\n" +
        result + "\n" +
        "Choose again to start the next round!";
}




// 12. SUBMIT A CHOICE


async function submitChoice(choice) {
    if (!currentRoom || !currentRole) return;

    try {
        const roomRef = ref(db, "rooms/" + currentRoom);

        const transaction = await runTransaction(
            roomRef,
            room => {
                if (!room || !room.player2) return;

                room.round = room.round || 1;

                room.choices = room.choices || {
                    player1: null,
                    player2: null
                };

                room.scores = room.scores || {
                    player1: 0,
                    player2: 0,
                    draws: 0
                };

                // Start a new round if both previous choices exist.
                if (
                room.choices.player1 !== null && room.choices.player2 !== null
                ){
                    room.round++;

                    room.choices.player1 = null;
                    room.choices.player2 = null;
                }

                if (room.choices[currentRole]) return;

                room.choices[currentRole] = choice;

                const p1 = room.choices.player1;
                const p2 = room.choices.player2;

                console.log("Transaction choices:", p1, p2);

                if (p1 && p2) {
                    if (p1 === p2) {
                        room.scores.draws++;
                        room.lastResult = "draw";
                    } else if (
                        (p1 === "rock" && p2 === "scissors") ||
                        (p1 === "paper" && p2 === "rock") ||
                        (p1 === "scissors" && p2 === "paper")
                    ) {
                        room.scores.player1++;
                        room.lastResult = "player1";
                    } else {
                        room.scores.player2++;
                        room.lastResult = "player2";
                    }

                    console.log("Calculated result:", room.lastResult);
                    console.log("Calculated scores:", room.scores);
                }

                return room;
            }
        );

        console.log("Transaction committed:", transaction.committed);
        console.log("Saved room:", transaction.snapshot.val());

        if (!transaction.committed) {
            resultText.textContent =
                "Transaction failed. Check the game connection.";
        }

    } catch (error) {
        console.error("Submit error:", error);
        resultText.textContent = "Could not submit your move: " + error.message;
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