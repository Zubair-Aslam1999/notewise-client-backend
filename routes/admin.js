const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authenticate");
const User = require("../models/User");
const Message = require("../models/Message");

// Optional: Only allow admin users
const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ success: false, message: "Admins only" });
  }
  next();
};

// Broadcast message to all users
router.post("/broadcast-message", authenticate, isAdmin, async (req, res) => {
  const { title, body } = req.body;

  if (!title || !body)
    return res
      .status(400)
      .json({ success: false, message: "Title and body required" });

  try {
    // Save as Message in DB
    const message = await Message.create({
      title,
      body,
      at: new Date(),
    });

    res.json({ success: true, message: "Broadcast sent!" });
  } catch (err) {
    console.error("❌ Error sending broadcast:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
