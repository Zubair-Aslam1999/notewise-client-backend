const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  path: { type: String, required: true },
  university: String,
  courseCode: String,
  title: String,
  thumbnail: { type: String },
  uploadedAt: { type: Date, default: Date.now },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  year: { type: String },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  text: {
    type: String,
    default: "",
  },
});

module.exports = mongoose.model("Document", documentSchema);
