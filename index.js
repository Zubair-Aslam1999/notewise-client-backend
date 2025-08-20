const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");
const path = require("path");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

const allowedOrigins = [
  "http://localhost:3000",
  "https://note-wise-dev.web.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use((req, res, next) => {
  if (["POST", "PUT", "DELETE"].includes(req.method)) {
    console.log(`🔥 ${req.method} ${req.url}`);
  }
  next();
});

// Connect to MongoDB

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));

// app.use("/uploads", express.static("uploads"));
connectDB();

const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

const messageRoutes = require("./routes/messages");
app.use("/api/messages", messageRoutes);

const adminRoutes = require("./routes/admin");
app.use("/api/admin", adminRoutes);

const notesRoutes = require("./routes/notes");
app.use("/api/notes", notesRoutes);

const rewardsRoutes = require("./routes/rewards");
app.use("/api/rewards", rewardsRoutes);

const bookRoutes = require("./routes/books");
app.use("/api/books", bookRoutes);

// Basic route to test
app.get("/", (req, res) => {
  res.send("API is running...");
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
