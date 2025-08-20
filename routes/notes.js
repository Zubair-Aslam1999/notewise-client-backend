const express = require("express");
const Note = require("../models/Note");
const authenticate = require("../middleware/authenticate");

const router = express.Router();

// Get note for a document (for the logged-in user)
router.get("/:documentId", authenticate, async (req, res) => {
  try {
    const note = await Note.findOne({
      userId: req.user.id,
      documentId: req.params.documentId,
    });
    res.json({ success: true, note });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch note" });
  }
});

// Save/update note for a document (for the logged-in user)
router.post("/:documentId", authenticate, async (req, res) => {
  try {
    const { content } = req.body;
    const note = await Note.findOneAndUpdate(
      { userId: req.user.id, documentId: req.params.documentId },
      { content },
      { upsert: true, new: true }
    );
    res.json({ success: true, note });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to save note" });
  }
});

module.exports = router;
