const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Document = require("../models/Document");
const { fromPath } = require("pdf2pic");
const authenticate = require("../middleware/authenticate");
const SavedDocument = require("../models/SavedDocument");
const { DISLIKE_LIMIT } = require("../config/config");
const util = require("util");
const execFile = util.promisify(require("child_process").execFile);
const sendEmail = require("../utils/sendEmail");
const Message = require("../models/Message");
const pdfParse = require("pdf-parse");
const OpenAI = require("openai");
const { exec } = require("child_process");
const execAsync = util.promisify(exec);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function extractTextFromPDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const upload = multer({ storage: storage });
// Register route
// ----------------  REGISTER  -----------------
// router.post("/register", upload.single("idCard"), async (req, res) => {
//   console.log("REGISTER endpoint hit");
//   const { name, email, password } = req.body;
//   console.log("📩 Email received:", JSON.stringify(email));
//   console.log(
//     "🧩 Domain extracted:",
//     email?.toLowerCase().split("@")[1]?.trim()
//   );

//   /* ---------- 1) e‑mail domain check ---------- */
//   const allowed = ["u.nus.edu", "smu.edu.sg", "e.ntu.edu.sg"];
//   const domain = (email || "").toLowerCase().split("@")[1]?.trim();
//   if (!allowed.includes(domain)) {
//     return res
//       .status(400)
//       .json({ message: "Only NUS, SMU, or NTU e‑mails are allowed." });
//   }

//   /* ---------- 2) make sure user doesn’t exist ---------- */
//   if (await User.findOne({ email }))
//     return res.status(400).json({ message: "User already exists" });

//   /* ---------- 3) hash pw ---------- */
//   const hashedPw = await bcrypt.hash(password, 10);

//   /* ---------- 4) figure out the avatar path ---------- */
//   let avatarRelPath = "/images/avatar.png"; // default

//   if (req.file) {
//     // absolute path of the uploaded ID card
//     const abs = path.resolve(req.file.path);
//     const script = path.join(__dirname, "..", "utils", "crop_face.py");

//     try {
//       const { stdout, stderr } = await execFile("python3", [script, abs]);

//       console.log("📤 Python stdout:", JSON.stringify(stdout));
//       console.log("🐍 Python stderr:", stderr);

//       if (typeof stdout !== "string") throw new Error("stdout is not a string");

//       const trimmed = stdout.trim();
//       const filename = path.basename(trimmed);
//       avatarRelPath = `/uploads/${filename}`;
//     } catch (err) {
//       const stderr = err?.stderr || "";
//       const isNoFace =
//         stderr.includes("NO_FACE") || err?.message?.includes("NO_FACE");

//       console.error("❌ crop‑face FAILED", {
//         code: err?.code,
//         msg: err?.message,
//         stderr: err?.stderr,
//       });

//       if (isNoFace) {
//         return res.status(400).json({
//           message:
//             "Face not detected. Please upload a clearer image of your ID card.",
//         });
//       }

//       avatarRelPath = `/uploads/${req.file.filename}`;
//     }
//   }

//   /* ---------- 4.5) Generate OTP and send email ---------- */
//   const otp = Math.floor(100000 + Math.random() * 900000).toString();
//   const otpExpires = new Date(Date.now() + 2 * 60 * 1000); // 10 minutes

//   const sendEmail = require("../utils/sendEmail");

//   try {
//     await sendEmail({
//       to: email,
//       subject: "NoteWise OTP Verification",
//       html: `<p>Your OTP is: <strong>${otp}</strong></p>`,
//     });
//     console.log(`📧 OTP sent to ${email}: ${otp}`);
//   } catch (err) {
//     return res.status(500).json({ message: "Failed to send OTP email" });
//   }

//   /* ---------- 5) create user ---------- */
//   const user = await User.create({
//     username: name,
//     email,
//     password: hashedPw,
//     idCardImage: req.file?.filename,
//     avatar: avatarRelPath,
//     otp,
//     otpExpires,
//     emailVerified: false,
//     role: "user",
//   });

//   /* ---------- 6) issue JWT & respond ---------- */
//   const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
//     expiresIn: "2d",
//   });

//   res.status(201).json({
//     message: "User registered successfully",
//     token,
//     user: {
//       _id: user._id,
//       email: user.email,
//       username: user.username,
//       avatar: user.avatar, // already the right value
//       isActive: user.isActive,
//       savedDocuments: [],
//       role: "user",
//     },
//   });
// });

router.post("/register", async (req, res) => {
  console.log("REGISTER endpoint hit");
  const { name, email, password, idCardUrl } = req.body;

  console.log("📩 Email received:", JSON.stringify(email));
  console.log(
    "🧩 Domain extracted:",
    email?.toLowerCase().split("@")[1]?.trim()
  );

  /* ---------- 1) e-mail domain check ---------- */
  const allowed = ["u.nus.edu", "smu.edu.sg", "e.ntu.edu.sg"];
  const domain = (email || "").toLowerCase().split("@")[1]?.trim();
  if (!allowed.includes(domain)) {
    return res
      .status(400)
      .json({ message: "Only NUS, SMU, or NTU e-mails are allowed." });
  }

  /* ---------- 2) make sure user doesn’t exist ---------- */
  if (await User.findOne({ email })) {
    return res.status(400).json({ message: "User already exists" });
  }

  /* ---------- 3) hash pw ---------- */
  const hashedPw = await bcrypt.hash(password, 10);

  /* ---------- 4) avatar path / id card ---------- */
  let avatarRelPath = "/images/avatar.png"; // fallback
  let idCardImage = null;

  if (idCardUrl) {
    // 👇 store Cloudinary URL directly
    idCardImage = idCardUrl;
    avatarRelPath = idCardUrl;
    // (or run face-detection here if you still want that)
  }

  /* ---------- 4.5) Generate OTP and send email ---------- */
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const sendEmail = require("../utils/sendEmail");

  try {
    await sendEmail({
      to: email,
      subject: "NoteWise OTP Verification",
      html: `<p>Your OTP is: <strong>${otp}</strong></p>`,
    });
    console.log(`📧 OTP sent to ${email}: ${otp}`);
  } catch (err) {
    return res.status(500).json({ message: "Failed to send OTP email" });
  }

  /* ---------- 5) create user ---------- */
  const user = await User.create({
    username: name,
    email,
    password: hashedPw,
    idCardImage,
    avatar: avatarRelPath,
    otp,
    otpExpires,
    emailVerified: false,
    role: "user",
  });

  /* ---------- 6) issue JWT & respond ---------- */
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "2d",
  });

  res.status(201).json({
    message: "User registered successfully",
    token,
    user: {
      _id: user._id,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
      isActive: user.isActive,
      savedDocuments: [],
      role: "user",
    },
  });
});

router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email });

  if (!user) return res.status(400).json({ message: "User not found" });

  if (user.emailVerified)
    return res.status(400).json({ message: "Email already verified" });

  if (user.otp !== otp) return res.status(400).json({ message: "Invalid OTP" });

  if (user.otpExpires < Date.now())
    return res.status(400).json({ message: "OTP expired" });

  user.emailVerified = true;
  user.otp = null;
  user.otpExpires = null;
  await user.save();

  res.json({ message: "Email verified successfully" });
});

router.post("/resend-otp", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.status(400).json({ message: "User not found" });

  if (user.emailVerified) {
    return res.status(400).json({ message: "Email already verified" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

  const sendEmail = require("../utils/sendEmail");
  try {
    await sendEmail({
      to: email,
      subject: "NoteWise OTP Resend",
      html: `<p>Your new OTP is: <strong>${otp}</strong></p>`,
    });

    user.otp = otp;
    user.otpExpires = otpExpires;
    await user.save();

    res.json({ message: "New OTP sent!" });
  } catch (err) {
    res.status(500).json({ message: "Failed to resend OTP" });
  }
});

// Login route
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        reason: "suspended",
        message:
          "Your account has been suspended due to multiple violations. " +
          "Please email notewise@gmail.com for assistance.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "2d",
      }
    );

    const savedDocs = await SavedDocument.find({ userId: user._id });
    const savedDocIds = savedDocs.map((doc) => doc.documentId.toString());
    const uploadedDocs = await Document.find({ uploadedBy: user._id });
    const uploadedDocIds = uploadedDocs.map((doc) => doc._id.toString());

    res.json({
      message: "Login successful",
      token,
      user: {
        email: user.email,
        username: user.username,
        _id: user._id,
        avatar: user.avatar || null,
        isActive: user.isActive,
        role: user.role,
        token,
        savedDocuments: savedDocIds,
        uploadedDocuments: uploadedDocIds,
        emailVerified: user.emailVerified,
        points: user.points,
        ownedBooks: user.ownedBooks || [],
        currentModules: user.currentModules || [],
      },
    });
    console.log("🟢 Responding with user role:", user.role);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Request OTP for password reset
router.post("/request-reset-password", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.status(400).json({ message: "User not found" });

  // Generate OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 2 * 60 * 1000); // 2 mins

  const sendEmail = require("../utils/sendEmail");
  try {
    await sendEmail({
      to: email,
      subject: "NoteWise Password Reset OTP",
      html: `<p>Your OTP for resetting password is: <strong>${otp}</strong></p>`,
    });

    user.resetOtp = otp;
    user.resetOtpExpires = otpExpires;
    await user.save();

    res.json({ message: "OTP sent for password reset!" });
  } catch (err) {
    res.status(500).json({ message: "Failed to send OTP" });
  }
});

// Resend OTP for password reset
router.post("/resend-reset-otp", async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.status(400).json({ message: "User not found" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpires = new Date(Date.now() + 2 * 60 * 1000);

  const sendEmail = require("../utils/sendEmail");
  try {
    await sendEmail({
      to: email,
      subject: "NoteWise Password Reset OTP Resend",
      html: `<p>Your new OTP for resetting password is: <strong>${otp}</strong></p>`,
    });

    user.resetOtp = otp;
    user.resetOtpExpires = otpExpires;
    await user.save();

    res.json({ message: "New OTP sent for password reset!" });
  } catch (err) {
    res.status(500).json({ message: "Failed to resend OTP" });
  }
});

// Verify OTP for password reset
router.post("/verify-reset-otp", async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.status(400).json({ message: "User not found" });

  if (user.resetOtp !== otp) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  if (user.resetOtpExpires < Date.now()) {
    return res.status(400).json({ message: "OTP expired" });
  }

  // Clear OTP after verification
  user.resetOtp = null;
  user.resetOtpExpires = null;
  await user.save();

  res.json({ message: "OTP verified for password reset" });
});

// Reset password after OTP verification
router.post("/reset-password", async (req, res) => {
  const { email, newPassword } = req.body;
  const bcrypt = require("bcryptjs");
  const user = await User.findOne({ email });

  if (!user) return res.status(400).json({ message: "User not found" });

  // Hash and save new password
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();

  res.json({ message: "Password reset successful" });
});

router.post("/upload", authenticate, async (req, res) => {
  try {
    if (req.user.isActive === false) {
      return res.status(403).json({
        success: false,
        reason: "suspended",
        message:
          "Your account has been suspended due to repeated violations. " +
          "Please email notewise@gmail.com for assistance.",
      });
    }

    const { fileUrl, university, courseCode, title, year } = req.body;

    if (!fileUrl) {
      return res
        .status(400)
        .json({ success: false, error: "No file URL provided" });
    }

    // 1. Extract text if it's a PDF
    let extractedText = "";
    try {
      if (fileUrl.endsWith(".pdf")) {
        const response = await fetch(fileUrl);
        const buffer = Buffer.from(await response.arrayBuffer());
        const parsedPdf = await pdfParse(buffer);
        extractedText = parsedPdf.text;
      }
    } catch (err) {
      console.warn("⚠️ Could not extract text:", err.message);
    }

    let thumbnailUrl;

    if (fileUrl.endsWith(".pdf")) {
      thumbnailUrl = fileUrl
        .replace("/upload/", "/upload/w_300,h_300,c_fit/pg_1/")
        .replace(".pdf", ".png");
    } else {
      thumbnailUrl = fileUrl.replace("/upload/", "/upload/w_300,h_300,c_fit/");
    }

    const document = new Document({
      filename: fileUrl,
      path: fileUrl,
      thumbnail: thumbnailUrl,
      university,
      year,
      courseCode,
      title,
      uploadedBy: req.user.id,
      text: extractedText,
    });

    await document.save();

    // 3. Update user points
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $inc: { points: 1 } },
      { new: true }
    );

    res.status(201).json({
      success: true,
      document,
      points: updatedUser.points,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Upload failed" });
  }
});

// router.post(
//   "/upload",
//   authenticate,
//   upload.single("file"),
//   async (req, res) => {
//     try {
//       if (req.user.isActive === false) {
//         return res.status(403).json({
//           success: false,
//           reason: "suspended",
//           message:
//             "Your account has been suspended due to repeated violations. " +
//             "Please email notewise@gmail.com for assistance.",
//         });
//       }

//       if (!req.file) {
//         return res
//           .status(400)
//           .json({ success: false, error: "No file uploaded" });
//       }

//       let filePath = req.file.path;
//       let filename = req.file.filename;

//       // 1. If DOCX, convert to PDF using LibreOffice
//       const ext = path.extname(filename).toLowerCase();
//       if (ext === ".docx" || ext === ".doc" || ext === ".odt") {
//         const pdfFilename = filename.replace(/\.(docx|doc|odt)$/i, ".pdf");
//         const pdfPath = path.join("uploads", pdfFilename);

//         // LibreOffice command to convert to PDF
//         // --headless: no GUI, --convert-to pdf, --outdir: output directory
//         const cmd = `libreoffice --headless --convert-to pdf --outdir uploads "${filePath}"`;

//         await execAsync(cmd);

//         // After conversion, update filePath and filename to point to the new PDF
//         filePath = pdfPath;
//         filename = pdfFilename;
//       }

//       // 2. Now process as PDF
//       const thumbnailOutputPath = `uploads/thumbnails/${filename}-thumb.1.jpg`;
//       const options = {
//         density: 100,
//         saveFilename: `${filename}-thumb`,
//         savePath: "uploads/thumbnails",
//         format: "jpg",
//         width: 300,
//         height: 300,
//       };

//       const fileBuffer = fs.readFileSync(filePath);
//       const parsedPdf = await pdfParse(fileBuffer);
//       const extractedText = parsedPdf.text;

//       const convert = fromPath(filePath, options);
//       const result = await convert(1);

//       if (!fs.existsSync(thumbnailOutputPath)) {
//         return res
//           .status(500)
//           .json({ success: false, error: "Thumbnail generation failed" });
//       }

//       const document = new Document({
//         filename,
//         path: filePath,
//         thumbnail: thumbnailOutputPath,
//         university: req.body.university,
//         year: req.body.year,
//         courseCode: req.body.courseCode,
//         title: req.body.title,
//         uploadedBy: req.user.id,
//         text: extractedText,
//       });

//       await document.save();
//       const updatedUser = await User.findByIdAndUpdate(
//         req.user.id,
//         { $inc: { points: 1 } },
//         { new: true } // 👈 get updated user back
//       );

//       res.status(201).json({
//         success: true,
//         document,
//         points: updatedUser.points, // 👈 return updated points
//       });
//     } catch (err) {
//       console.error(err);
//       res.status(500).json({ success: false, error: "Upload failed" });
//     }
//   }
// );

router.get("/documents", async (req, res) => {
  try {
    const documents = await Document.find({ isActive: true }).populate(
      "uploadedBy",
      "username avatar"
    );

    const formattedDocs = documents.map((doc) => ({
      _id: doc._id,
      title: doc.title,
      courseCode: doc.courseCode,
      thumbnail: doc.thumbnail,
      likes: doc.likes,
      dislikes: doc.dislikes,
      text: doc.text,
      uploader: doc.uploadedBy
        ? {
            _id: doc.uploadedBy._id,
            username: doc.uploadedBy.username,
            avatar: doc.uploadedBy.avatar
              ? doc.uploadedBy.avatar.startsWith("http")
                ? doc.uploadedBy.avatar
                : `http://localhost:5001${doc.uploadedBy.avatar}`
              : "http://localhost:5001/images/avatar.png", // ✅ fallback avatar
          }
        : {
            _id: "unknown",
            username: "Unknown",
            avatar: "http://localhost:5001/images/avatar.png", // ✅ for missing uploader
          },
    }));

    res.json({ success: true, documents: formattedDocs });
  } catch (error) {
    console.error("Failed to fetch documents:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// router.put("/update-profile/:id", upload.single("idCard"), async (req, res) => {
//   const { id } = req.params;
//   const { username, email } = req.body;

//   try {
//     const existingUser = await User.findById(id);
//     if (!existingUser) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     let avatarRelPath;

//     // If a new ID card was uploaded, run face-cropping script
//     if (req.file) {
//       const abs = path.resolve(req.file.path);
//       const script = path.join(__dirname, "..", "utils", "crop_face.py");

//       try {
//         const { stdout, stderr } = await execFile("python3", [script, abs]);
//         const trimmed = stdout.trim();
//         const filename = path.basename(trimmed);
//         avatarRelPath = `/uploads/${filename}`;

//         if (existingUser.avatar) {
//           const old = path.join(
//             __dirname,
//             "..",
//             "uploads",
//             existingUser.avatar.split("/uploads/")[1]
//           );
//           fs.unlink(old, (err) => {
//             if (err) console.error("Failed to delete old avatar:", err.message);
//           });
//         }
//       } catch (err) {
//         const stderr = err?.stderr || "";
//         const isNoFace =
//           stderr.includes("NO_FACE") || err?.message?.includes("NO_FACE");

//         console.error("❌ Face cropping failed:", err.message);

//         if (isNoFace) {
//           return res.status(400).json({
//             message:
//               "Face not detected. Please upload a clearer image of your ID card.",
//           });
//         }

//         avatarRelPath = existingUser.avatar;
//       }
//     }

//     const updateFields = {
//       username,
//       email,
//       ...(avatarRelPath && { avatar: avatarRelPath }),
//     };

//     const updatedUser = await User.findByIdAndUpdate(id, updateFields, {
//       new: true,
//     });

//     if (!updatedUser) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     res.json({
//       message: "Profile updated successfully",
//       user: {
//         _id: updatedUser._id,
//         email: updatedUser.email,
//         username: updatedUser.username,
//         avatar: updatedUser.avatar,
//         role: updatedUser.role,
//         points: updatedUser.points,
//       },
//     });
//   } catch (error) {
//     console.error("❌ Profile update failed:", error.message);
//     res.status(500).json({ message: "Failed to update profile" });
//   }

//   if (isNoFace) {
//     return res.status(400).json({
//       message:
//         "Face not detected. Please upload a clearer image of your ID card.",
//     });
//   }
// });

router.put("/update-profile/:id", async (req, res) => {
  const { id } = req.params;
  const { username, email, idCard } = req.body;

  try {
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const updateFields = {
      username,
      email,
      ...(idCard && { avatar: idCard }),
    };

    const updatedUser = await User.findByIdAndUpdate(id, updateFields, {
      new: true,
    });

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Profile updated successfully",
      user: {
        _id: updatedUser._id,
        username: updatedUser.username,
        idCard: updatedUser.idCard,
        role: updatedUser.role,
        points: updatedUser.points,
        avatar: updatedUser.avatar,
      },
    });
  } catch (error) {
    console.error("❌ Profile update failed:", error.message);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

router.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res
      .status(400)
      .json({ success: false, message: "No query provided" });
  }

  try {
    const results = await Document.find({
      $or: [
        { title: { $regex: query, $options: "i" } },
        { courseCode: { $regex: query, $options: "i" } },
        { university: { $regex: query, $options: "i" } },
      ],
    }).populate("uploadedBy", "username avatar"); // ✅ include avatar

    // ✅ Format like other routes
    const formattedResults = results.map((doc) => ({
      _id: doc._id,
      title: doc.title,
      courseCode: doc.courseCode,
      thumbnail: doc.thumbnail,
      likes: doc.likes,
      dislikes: doc.dislikes,
      uploader: doc.uploadedBy
        ? {
            _id: doc.uploadedBy._id,
            username: doc.uploadedBy.username,
            avatar: doc.uploadedBy.avatar
              ? doc.uploadedBy.avatar.startsWith("http")
                ? doc.uploadedBy.avatar
                : `http://localhost:5001${doc.uploadedBy.avatar}`
              : "http://localhost:5001/images/avatar.png", // ✅ fallback
          }
        : {
            // _id: "unknown",
            username: "Unknown",
            avatar: "http://localhost:5001/images/avatar.png", // fallback
          },
    }));

    res.json({ success: true, results: formattedResults });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ success: false, message: "Search failed" });
  }
});

router.get("/document/:id", authenticate, async (req, res) => {
  try {
    if (req.user.isActive === false) {
      return res.status(403).json({
        success: false,
        reason: "suspended",
        message:
          "Your account has been suspended due to repeated violations. " +
          "Please email notewise@gmail.com for assistance.",
      });
    }

    const document = await Document.findById(req.params.id).populate(
      "uploadedBy",
      "_id username avatar"
    );

    if (!document) return res.status(404).json({ message: "Not found" });

    const user = await User.findById(req.user.id);
    const updatedUser = await User.findById(req.user.id).select(
      "recentlyViewed"
    );

    if (updatedUser) {
      // Remove duplicates
      updatedUser.recentlyViewed = updatedUser.recentlyViewed.filter(
        (id) => id.toString() !== document._id.toString()
      );

      // Add to front
      updatedUser.recentlyViewed.unshift(document._id);

      // Limit to 10
      updatedUser.recentlyViewed = updatedUser.recentlyViewed.slice(0, 10);

      await User.findByIdAndUpdate(req.user.id, {
        recentlyViewed: updatedUser.recentlyViewed,
      });
    }

    const formatted = {
      _id: document._id,
      title: document.title,
      courseCode: document.courseCode,
      thumbnail: document.thumbnail,
      filename: document.filename,
      likes: document.likes,
      dislikes: document.dislikes,
      text: document.text,
      uploader: document.uploadedBy
        ? {
            _id: document.uploadedBy._id,
            username: document.uploadedBy.username,
            avatar: document.uploadedBy.avatar?.startsWith("http")
              ? document.uploadedBy.avatar
              : `http://localhost:5001${document.uploadedBy.avatar}`,
          }
        : null,
    };

    res.json({ success: true, document: formatted });
  } catch (error) {
    console.error("Error in GET /document/:id:", error);
    res.status(500).json({ message: "Failed to retrieve document" });
  }
});

// Secure file access
router.get("/secure-file/:filename", (req, res) => {
  const filePath = path.join(__dirname, "..", "uploads", req.params.filename);
  res.sendFile(filePath);
});

// Like a document
router.post("/document/:id/like", authenticate, async (req, res) => {
  console.log("LIKE request from:", req.user?.id);
  try {
    if (req.user.isActive === false) {
      return res.status(403).json({
        success: false,
        reason: "suspended",
        message:
          "Your account has been suspended due to repeated violations. " +
          "Please email notewise@gmail.com for assistance.",
      });
    }

    const doc = await Document.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true }
    );
    if (!doc)
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    res.json({ success: true, likes: doc.likes });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to like" });
  }
});

// Dislike a document
router.post("/document/:id/dislike", authenticate, async (req, res) => {
  try {
    if (req.user.isActive === false) {
      return res.status(403).json({
        success: false,
        reason: "suspended",
        message:
          "Your account has been suspended due to repeated violations. " +
          "Please email notewise@gmail.com for assistance.",
      });
    }

    console.log("DISLIKE request from:", req.user?.id);
    const doc = await Document.findById(req.params.id);
    if (!doc || !doc.isActive) return res.status(404).json({ success: false });

    doc.dislikes = (doc.dislikes || 0) + 1;

    let warningSent = false;

    if (doc.dislikes >= DISLIKE_LIMIT) {
      doc.isActive = false;

      await User.findByIdAndUpdate(doc.uploadedBy, {
        $push: {
          warnings: {
            docTitle: doc.title,
            docId: doc._id,
            message:
              `Your document "${doc.title} was removed after ${doc.dislikes} dislikes.` +
              `Please upload helpful materials only.`,
            at: new Date(),
            seen: false,
          },
        },
      });

      const offender = await User.findById(doc.uploadedBy);

      if (offender.warnings.length >= 3) {
        offender.isActive = false;
        await offender.save();
      }

      warningSent = true;
    }
    await doc.save({ validateBeforeSave: false });
    res.json({
      success: true,
      dislikes: doc.dislikes,
      removed: !doc.isActive,
      warningSent,
    });
  } catch (err) {
    console.error("Dislike error:", err);
    res.status(500).json({ success: false, message: "Failed to dislike" });
  }
});

// Add this near your other vote routes
// Remove a like
router.post("/document/:id/remove-like", authenticate, async (req, res) => {
  try {
    console.log("LIKE request from:", req.user?.id);
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    doc.likes = Math.max((doc.likes || 0) - 1, 0);
    await doc.save({ validateBeforeSave: false });
    res.json({ success: true, likes: doc.likes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Remove a dislike
router.post("/document/:id/remove-dislike", authenticate, async (req, res) => {
  try {
    console.log("LIKE request from:", req.user?.id);
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    doc.dislikes = Math.max((doc.dislikes || 0) - 1, 0);
    await doc.save({ validateBeforeSave: false });
    res.json({ success: true, dislikes: doc.dislikes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Save a document to user's saved list
router.post("/save/:docId", authenticate, async (req, res) => {
  const userId = req.user.id;
  const docId = req.params.docId;

  try {
    if (req.user.isActive === false) {
      return res.status(403).json({
        success: false,
        reason: "suspended",
        message:
          "Your account has been suspended due to repeated violations. " +
          "Please email notewise@gmail.com for assistance.",
      });
    }

    const exists = await SavedDocument.findOne({ userId, documentId: docId });
    if (exists) {
      return res.json({ success: true, message: "Already saved" });
    }

    await SavedDocument.create({ userId, documentId: docId });
    res.json({ success: true, message: "Document saved" });
  } catch (error) {
    console.error("Save error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to save document" });
  }
});

// Fetch grouped saved documents
router.get("/my-documents", authenticate, async (req, res) => {
  try {
    if (req.user.isActive === false) {
      return res.status(403).json({
        success: false,
        reason: "suspended",
        message:
          "Your account has been suspended due to repeated violations. " +
          "Please email notewise@gmail.com for assistance.",
      });
    }

    const userId = req.user.id;

    const savedDocs = await SavedDocument.find({ userId }).populate({
      path: "documentId",
      populate: {
        path: "uploadedBy",
        select: "username avatar", // only fetch needed fields
      },
    });
    const grouped = {};

    savedDocs.forEach((entry) => {
      const doc = entry.documentId;
      if (!doc || !doc.courseCode) return;

      const course = doc.courseCode;

      if (!grouped[course]) grouped[course] = [];

      grouped[course].push({
        _id: doc._id,
        title: doc.title,
        courseCode: doc.courseCode,
        text: doc.text,
        likes: doc.likes || 0,
        dislikes: doc.dislikes || 0,
        thumbnailUrl: doc.thumbnail?.startsWith("http")
          ? doc.thumbnail
          : `http://localhost:5001/${doc.thumbnail}`,
        uploader: doc.uploadedBy
          ? {
              username: doc.uploadedBy.username,
              avatar: doc.uploadedBy.avatar
                ? doc.uploadedBy.avatar.startsWith("http")
                  ? doc.uploadedBy.avatar
                  : `http://localhost:5001${doc.uploadedBy.avatar}`
                : "http://localhost:5001/images/avatar.png", // ✅ fallback avatar
              _id: doc.uploadedBy._id,
            }
          : {
              username: "Unknown",
              avatar: "http://localhost:5001/images/avatar.png", // ✅ for missing uploader
            },
      });
    });

    const groupedArray = Object.keys(grouped).map((courseCode) => ({
      courseCode,
      documents: grouped[courseCode],
    }));

    res.json(groupedArray);
  } catch (error) {
    console.error("Error fetching saved documents:", error);
    res.status(500).json({ message: "Failed to fetch saved documents" });
  }
});

// Remove a document from user's saved list
router.delete("/unsave/:docId", authenticate, async (req, res) => {
  const userId = req.user.id;
  const docId = req.params.docId;

  try {
    if (req.user.isActive === false) {
      return res.status(403).json({
        success: false,
        reason: "suspended",
        message:
          "Your account has been suspended due to repeated violations. " +
          "Please email notewise@gmail.com for assistance.",
      });
    }

    const removed = await SavedDocument.findOneAndDelete({
      userId,
      documentId: docId,
    });

    if (!removed) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    res.json({ success: true, message: "Document unsaved" });
  } catch (error) {
    console.error("Unsave error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to unsave document" });
  }
});

router.post("/update-modules", authenticate, async (req, res) => {
  try {
    if (req.user.isActive === false) {
      return res.status(403).json({
        success: false,
        reason: "suspended",
        message:
          "Your account has been suspended due to repeated violations. " +
          "Please email notewise@gmail.com for assistance.",
      });
    }

    const userId = req.user.id;
    const { modules } = req.body;

    if (!Array.isArray(modules)) {
      return res
        .status(400)
        .json({ success: false, message: "Modules must be an array." });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { currentModules: modules.map((mod) => mod.toUpperCase()) },
      { new: true }
    );

    res.json({ success: true, user });
  } catch (error) {
    console.error("Failed to update modules:", error);
    res.status(500).json({ success: false, message: "Internal error." });
  }
});

router.get("/me", authenticate, async (req, res) => {
  try {
    if (req.user.isActive === false) {
      return res.status(403).json({
        success: false,
        reason: "suspended",
        message:
          "Your account has been suspended due to repeated violations. " +
          "Please email notewise@gmail.com for assistance.",
      });
    }

    const user = await User.findById(req.user.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const savedDocs = await SavedDocument.find({ userId: user._id });
    const savedDocIds = savedDocs.map((doc) => doc.documentId.toString());
    const uploadedDocs = await Document.find({ uploadedBy: user._id });
    const uploadedDocIds = uploadedDocs.map((doc) => doc._id.toString());

    res.json({
      success: true,
      user: {
        _id: user._id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        isActive: user.isActive,
        role: user.role,
        points: user.points,
        ownedBooks: user.ownedBooks,
        savedDocuments: savedDocIds,
        uploadedDocuments: uploadedDocIds,
        currentModules: user.currentModules, // ✅ consistent structure
      },
    });
  } catch (err) {
    console.error("Failed to get user info:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET profile and uploads by user ID
router.get("/profile/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select(
      "username avatar"
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    const documents = await Document.find({ uploadedBy: user._id }).select(
      "_id title courseCode thumbnail likes dislikes"
    );

    res.json({
      user,
      documents,
    });
  } catch (error) {
    console.error("Error in /profile/:userId:", error);
    res.status(500).json({
      message: "Error fetching profile",
      error: error.message,
    });
  }
});

//to add my documents to my own profile
router.get("/documents/user/:userId", async (req, res) => {
  try {
    const documents = await Document.find({
      uploadedBy: req.params.userId,
    }).populate("uploadedBy", "username avatar");

    const formattedDocs = documents.map((doc) => ({
      _id: doc._id,
      title: doc.title,
      courseCode: doc.courseCode,
      thumbnail: doc.thumbnail,
      likes: doc.likes,
      dislikes: doc.dislikes,
      uploader: doc.uploadedBy
        ? {
            username: doc.uploadedBy.username,
            avatar: doc.uploadedBy.avatar
              ? doc.uploadedBy.avatar.startsWith("http")
                ? doc.uploadedBy.avatar
                : `http://localhost:5001${doc.uploadedBy.avatar}`
              : "http://localhost:5001/images/avatar.png", // ✅ fallback avatar
          }
        : {
            username: "Unknown",
            avatar: "http://localhost:5001/images/avatar.png", // ✅ for missing uploader
          },
    }));

    res.json({ success: true, documents: formattedDocs });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Error fetching documents" });
  }
});

//to remove any documents I have uploaded
router.delete("/documents/:docId", async (req, res) => {
  try {
    await Document.findByIdAndDelete(req.params.docId);
    res.json({ success: true, message: "Document deleted" });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Error deleting document" });
  }
});

// GET /documents/most-liked
router.get("/documents/most-liked", async (req, res) => {
  try {
    const docs = await Document.find({ isActive: true })
      .sort({ likes: -1 })
      .limit(10)
      .populate("uploadedBy", "username avatar");

    res.json({ success: true, documents: docs });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch top documents." });
  }
});

// GET /documents/newest
router.get("/documents/newest", async (req, res) => {
  try {
    const docs = await Document.find({ isActive: true })
      .sort({ uploadedAt: -1 }) // or `createdAt` if that's what your schema uses
      .limit(10)
      .populate("uploadedBy", "username avatar");

    res.json({ success: true, documents: docs });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch newest documents." });
  }
});

// GET /documents/recently-viewed
router.get("/documents/recently-viewed", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: "recentlyViewed",
      match: { isActive: true },
      populate: { path: "uploadedBy", select: "username avatar" },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const docs = user.recentlyViewed.map((doc) => ({
      _id: doc._id,
      title: doc.title,
      courseCode: doc.courseCode,
      thumbnail: doc.thumbnail,
      likes: doc.likes,
      dislikes: doc.dislikes,
      uploader: doc.uploadedBy
        ? {
            _id: doc.uploadedBy._id,
            username: doc.uploadedBy.username,
            avatar: doc.uploadedBy.avatar?.startsWith("http")
              ? doc.uploadedBy.avatar
              : `http://localhost:5001${doc.uploadedBy.avatar}`,
          }
        : null,
    }));

    res.json({ success: true, documents: user.recentlyViewed });
  } catch (err) {
    console.error("Error fetching recently viewed", err);
    res.status(500).json({ success: false });
  }
});

// Only return unseen (don't mark seen yet)
router.get("/warnings", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("warnings");
    // const warnings = user.warnings || [];
    const unseen = user.warnings.filter((w) => !w.seen);
    res.json({ success: true, warnings: unseen });
  } catch (err) {
    console.error("Error fetching warnings:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to load warnings" });
  }
});

router.get("/warnings/all", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("warnings");
    res.json({ success: true, warnings: user.warnings });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Failed to load warnings" });
  }
});

// Mark all warnings as seen
router.patch("/warnings/mark-seen", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.warnings.forEach((w) => {
      w.seen = true;
    });
    await user.save();
    res.json({ success: true });
  } catch (err) {
    console.error("Error marking warnings seen:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to update warnings" });
  }
});

module.exports = router;

router.post("/report-user", async (req, res) => {
  const { reportedUserId, reportedUsername, reason } = req.body;

  const message = `
    <h3>🚩 User Reported</h3>
    <p><strong>Reported Username:</strong> ${reportedUsername}</p>
    <p><strong>User ID:</strong> ${reportedUserId}</p>
    <p><strong>Reason:</strong> ${reason}</p>
    <p>This user was reported via the NoteWise profile page.</p>
  `;

  try {
    await sendEmail({
      to: "contact.notewise@gmail.com",
      subject: `🚨 Report: ${reportedUsername}`,
      html: message,
    });

    console.log("✅ Report email sent.");
    res.status(200).json({ message: "Report submitted successfully." });
  } catch (error) {
    console.error("❌ Failed to send report:", error);
    res.status(500).json({ message: "Failed to send report." });
  }
});

router.post("/document/:id/summarize", async (req, res) => {
  try {
    const documentId = req.params.id;

    // Fetch the document from MongoDB
    const document = await Document.findById(documentId);
    if (!document) return res.status(404).json({ error: "Document not found" });

    // Get the text content to summarize
    const text = document.text || document.content || document.description;

    if (!text) return res.status(400).json({ error: "No text to summarize" });

    // OpenAI API call
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `Summarize the following document into key bullet points:\n\n${text}`,
        },
      ],
    });

    const summary = completion.choices[0].message.content;
    res.json({ summary });
  } catch (error) {
    console.error("Summarize Error:", error);
    res.status(500).json({ error: "Failed to summarize document" });
  }
});

// Feedback
// routes/auth.js

router.post("/send-feedback", async (req, res) => {
  const { name, email, message } = req.body;

  const html = `
    <h3>📝 New Feedback Received</h3>
    <p><strong>Name:</strong> ${name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Message:</strong> ${message}</p>
  `;

  try {
    await sendEmail({
      to: "contact.notewise@gmail.com",
      subject: `💬 Feedback from ${name}`,
      html,
    });

    console.log("✅ Feedback email sent.");
    res.status(200).json({ message: "Feedback submitted successfully." });
  } catch (error) {
    console.error("❌ Failed to send feedback:", error);
    res.status(500).json({ message: "Failed to send feedback." });
  }
});

// Report a Problem
router.post("/report-problem", async (req, res) => {
  const { name, email, message } = req.body;

  const html = `
    <h3>🐞 Bug Reported</h3>
    <p><strong>From:</strong> ${name} (${email})</p>
    <p><strong>Description:</strong></p>
    <p>${message}</p>
  `;

  try {
    await sendEmail({
      to: "contact.notewise@gmail.com",
      subject: "🐞 Bug Report",
      html,
    });

    res.status(200).json({ message: "Bug report sent. Thank you!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to report bug." });
  }
});
