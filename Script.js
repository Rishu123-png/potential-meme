let step = 0;
let student = {};
let chat = document.getElementById("chat-window");

function botMessage(text) {
  chat.innerHTML += `<div class="message bot">${text}</div>`;
  chat.scrollTop = chat.scrollHeight;
}

function userMessage(text) {
  chat.innerHTML += `<div class="message user">${text}</div>`;
  chat.scrollTop = chat.scrollHeight;
}

function handleKey(event) {
  if (event.key === "Enter") sendMessage();
}

function sendMessage() {
  const input = document.getElementById("userMessage");
  const text = input.value.trim();
  if (!text) return;

  userMessage(text);
  input.value = "";

  setTimeout(() => botReply(text), 500);
}

function botReply(msg) {
  msg = msg.toLowerCase();

  if (step === 0) {
    botMessage("👋 Hi! Please tell me your name.");
    step++;
  } else if (step === 1) {
    student.name = msg;
    botMessage(`Nice to meet you, ${student.name}! What class are you in? (e.g. 11A, 11B)`);
    step++;
  } else if (step === 2) {
    student.class = msg.toUpperCase();
    botMessage(`Got it. Which subject are you attending right now? (AI / CS / PED / Data Science / Psychology)`);
    step++;
  } else if (step === 3) {
    student.subject = msg;
    botMessage(`Okay ${student.name}, are you present today? (yes / no)`);
    step++;
  } else if (step === 4) {
    if (msg.includes("yes")) {
      student.status = "Present";
    } else {
      student.status = "Absent";
    }

    // Save attendance
    let data = JSON.parse(localStorage.getItem("studentAttendance")) || [];
    data.push({
      name: student.name,
      class: student.class,
      subject: student.subject,
      status: student.status,
      time: new Date().toLocaleTimeString()
    });
    localStorage.setItem("studentAttendance", JSON.stringify(data));

    botMessage(`✅ Your attendance has been marked as "${student.status}" for ${student.subject} (${student.class}).`);
    botMessage("Thank you! 👋");
    step = 0;
  }
}

// Start chatbot
window.onload = () => {
  botMessage("🤖 Welcome to Smart Attendance Chatbot!");
  botMessage("Please type anything to begin.");
};
