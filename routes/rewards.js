const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/authenticate");
const User = require("../models/User");

// Sample book store
const books = [
  {
    id: 1,
    title: "Anything You Want",
    price: 1,
    cover: "/book-covers/AnythingYouWant.png",
    description: "40 Lessons for a New Kind of Entrepreneur.",
    author: "Derek Sivers",
    website: "https://sive.rs/a",
    pdf: "/books/Sivers-Anything_You_Want.pdf"
  },
  {
    id: 2,
    title: "Your Music and People",
    price: 1,
    cover: "/book-covers/YourMusic.png",
    description: "Creative and practical ways to get your work to the world.",
    author: "Derek Sivers",
    website: "https://sive.rs/m",
    pdf: "/books/Sivers-Your_Music_and_People.pdf"
  },
  {
    id: 3,
    title: "Hell Yeah or No",
    price: 5,
    cover: "/book-covers/HellYeah.png",
    description: "What’s worth doing.",
    author: "Derek Sivers",
    website: "https://sive.rs/n",
    pdf: "/books/Sivers-Hell_Yeah_or_No.pdf"
  },
  {
    id: 4,
    title: "How to Live",
    price: 5,
    cover: "/book-covers/HowToLive.png",
    description: "27 conflicting answers and one weird conclusion.",
    author: "Derek Sivers",
    website: "https://sive.rs/h",
    pdf: "/books/Sivers-How_to_Live.pdf"
  },
  {
    id: 5,
    title: "Useful Not True",
    price: 4,
    cover: "/book-covers/Useful.png",
    description: "Beliefs that help you do what you want.",
    author: "Derek Sivers",
    website: "https://sive.rs/u",
    pdf: "/books/Sivers-Useful_Not_True.pdf"
  },
];

// @GET /api/rewards/books
router.get("/books", authenticate, (req, res) => {
  res.json({ success: true, books });
});

// @POST /api/rewards/redeem
// @POST /api/rewards/redeem
router.post("/redeem", authenticate, async (req, res) => {
  const { bookId } = req.body;
  const book = books.find((b) => b.id === bookId);
  if (!book)
    return res.status(404).json({ success: false, message: "Book not found" });

  const user = await User.findById(req.user.id);

  // already owns it?
  if (user.ownedBooks.includes(bookId)) {
    return res.status(400).json({ success: false, message: "Already owned" });
  }

  if (user.points < book.price)
    return res
      .status(400)
      .json({ success: false, message: "Not enough points" });

  // deduct points + add to ownedBooks
  user.points -= book.price;
  user.ownedBooks.push(bookId);
  await user.save();

  res.json({
    success: true,
    message: "Book redeemed successfully",
    points: user.points,
    ownedBooks: user.ownedBooks,
  });
});

module.exports = router;
