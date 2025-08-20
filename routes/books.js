// routes/books.js
const express = require("express");
const router = express.Router();
const path = require("path");
const authenticate = require("../middleware/authenticate");
const User = require("../models/User");

// Mapping of filenames to book IDs
const filenameToId = {
  "Sivers-Anything_You_Want.pdf": 1,
  "Sivers-Your_Music_and_People.pdf": 2,
  "Sivers-Hell_Yeah_or_No.pdf": 3,
  "Sivers-How_to_Live.pdf": 4,
  "Sivers-Useful_Not_True.pdf": 5,
};

router.get("/secure-book/:filename", authenticate, async (req, res) => {
  const { filename } = req.params;

  const bookId = filenameToId[filename];
  if (!bookId) {
    return res.status(400).send("Invalid or unknown filename");
  }

  const user = await User.findById(req.user.id);
  if (!user.ownedBooks.includes(bookId)) {
    return res.status(403).send("You do not own this book.");
  }

  const filePath = path.join(__dirname, "..", "books", filename);
  res.sendFile(filePath);
});

module.exports = router;
