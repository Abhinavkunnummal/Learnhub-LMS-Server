const express = require("express");
const { body, validationResult } = require("express-validator");
const Discussion = require("../models/Discussion");
const { auth } = require("../middleware/auth");

const router = express.Router();

// GET /api/discussions/course/:courseId - Get course discussions
router.get("/course/:courseId", auth, async (req, res) => {
  try {
    const { lessonId } = req.query;

    const query = { course: req.params.courseId, parentComment: null };
    if (lessonId) query.lesson = lessonId;

    const discussions = await Discussion.find(query)
      .populate("author", "name avatar role")
      .sort("-createdAt");

    // Get reply counts
    const discussionsWithReplies = await Promise.all(
      discussions.map(async (disc) => {
        const replyCount = await Discussion.countDocuments({
          parentComment: disc._id,
        });
        return { ...disc.toObject(), replyCount };
      })
    );

    res.json({ success: true, discussions: discussionsWithReplies });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/discussions/:id/replies - Get replies for a comment
router.get("/:id/replies", auth, async (req, res) => {
  try {
    const replies = await Discussion.find({
      parentComment: req.params.id,
    })
      .populate("author", "name avatar role")
      .sort("createdAt");

    res.json({ success: true, replies });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/discussions - Create comment
router.post(
  "/",
  auth,
  [
    body("content").trim().notEmpty().withMessage("Content is required"),
    body("course").notEmpty().withMessage("Course ID is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const discussion = await Discussion.create({
        ...req.body,
        author: req.user._id,
      });

      const populated = await discussion.populate("author", "name avatar role");

      res.status(201).json({ success: true, discussion: populated });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// POST /api/discussions/:id/like - Like/unlike a comment
router.post("/:id/like", auth, async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.id);
    if (!discussion) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const index = discussion.likes.indexOf(req.user._id);
    if (index > -1) {
      discussion.likes.splice(index, 1); // Unlike
    } else {
      discussion.likes.push(req.user._id); // Like
    }

    await discussion.save();

    res.json({
      success: true,
      likes: discussion.likes.length,
      liked: index === -1,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/discussions/:id
router.delete("/:id", auth, async (req, res) => {
  try {
    const discussion = await Discussion.findById(req.params.id);
    if (!discussion) {
      return res.status(404).json({ message: "Comment not found" });
    }

    if (
      discussion.author.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Delete replies too
    await Discussion.deleteMany({ parentComment: req.params.id });
    await discussion.deleteOne();

    res.json({ success: true, message: "Comment deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
