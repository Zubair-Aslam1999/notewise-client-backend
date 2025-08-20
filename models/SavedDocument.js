const mongoose = require("mongoose");

const savedDocumentSchema = new mongoose.Schema({
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
});

module.exports = mongoose.model("SavedDocument", savedDocumentSchema);
