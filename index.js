const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

dotenv.config();

// Connect to MongoDB
connectDB();

// Register all Mongoose Models
require("./models/User");
require("./models/Course");
require("./models/Enrollment");
require("./models/Transaction");
require("./models/Message");
require("./models/Lesson");
require("./models/Quiz");
require("./models/Certificate");
require("./models/Discussion");
require("./models/MeetSession");

const app = express();

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://learnhub-lms-client.vercel.app"
    ],
    credentials: true
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const path = require("path");
const fs = require("fs");

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files statically
app.use("/uploads", express.static(uploadsDir));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/users", require("./routes/users"));
app.use("/api/courses", require("./routes/courses"));
app.use("/api/lessons", require("./routes/lessons"));
app.use("/api/quizzes", require("./routes/quizzes"));
app.use("/api/enrollments", require("./routes/enrollments"));
app.use("/api/discussions", require("./routes/discussions"));
app.use("/api/certificates", require("./routes/certificates"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/wallet", require("./routes/wallet"));
app.use("/api/messages", require("./routes/messages"));
app.use("/api/meet-sessions", require("./routes/meetSessions"));
app.use("/api/ai", require("./routes/aiAssistant"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
