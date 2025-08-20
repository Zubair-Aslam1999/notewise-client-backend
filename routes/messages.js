// routes/messages.js
const express = require("express");
const router = express.Router();
const Message = require("../models/Message");
const authenticate = require("../middleware/authenticate");

// ✉️ Admin sends a message
router.post("/create", authenticate, async (req, res) => {
  const { title, body } = req.body;
  const message = new Message({ title, body });
  await message.save();
  res.json({ success: true, message });
});

// 📬 Fetch inbox
router.get("/inbox", authenticate, async (req, res) => {
  const all = await Message.find().sort({ createdAt: -1 });
  const userId = req.user.id;
  const messages = all.map((msg) => ({
    _id: msg._id,
    title: msg.title,
    body: msg.body,
    createdAt: msg.createdAt,
    read: msg.readBy.map((id) => id.toString()).includes(userId.toString()),
  }));
  res.json({ success: true, messages });
});

// ✅ Mark one as read
router.post("/mark-read/:id", authenticate, async (req, res) => {
  console.log("📬 Marking as read:", req.params.id, "by user", req.user.id); // 🔍 Add this

  await Message.findByIdAndUpdate(req.params.id, {
    $addToSet: { readBy: req.user.id },
  });
  res.json({ success: true });
});

// 🔢 Get unread count
router.get("/unread-count", authenticate, async (req, res) => {
  const all = await Message.find();
  const unread = all.filter((m) => !m.readBy.includes(req.user.id.toString()));
  res.json({ count: unread.length });
});

module.exports = router;
