const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  idCardImage: { type: String }, // filename of the uploaded ID card
  avatar: { type: String },
  savedDocuments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Document" }],
  currentModules: [{ type: String }],
  recentlyViewed: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
    },
  ],
  warnings: [
    {
      docTitle: String,
      docId: { type: mongoose.Schema.Types.ObjectId, ref: "Document" },
      message: String,
      at: { type: Date, default: Date.now },
      seen: { type: Boolean, default: false },
    },
  ],
  isActive: { type: Boolean, default: true },
  otp: { type: String },
  otpExpires: { type: Date },
  emailVerified: { type: Boolean, default: false },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
  points: {
    type: Number,
    default: 0,
  },
  ownedBooks: [
    {
      type: Number, // book.id from the static array
      required: true,
    },
  ],
});

module.exports = mongoose.model("User", userSchema);
