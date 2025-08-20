const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    content: { type: String, default: "" },
  },
  { timestamps: true }
);

noteSchema.index({ userId: 1, documentId: 1 }, { unique: true });

module.exports = mongoose.model("Note", noteSchema);
