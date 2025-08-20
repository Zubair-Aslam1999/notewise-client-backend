const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  title: String,
  body: String,
  createdAt: { type: Date, default: Date.now },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

module.exports = mongoose.model("Message", messageSchema);
