const express = require("express");
const { body, validationResult } = require("express-validator");
const Quiz = require("../models/Quiz");
const Course = require("../models/Course");
const { auth, authorize } = require("../middleware/auth");

const router = express.Router();

// GET /api/quizzes/course/:courseId - Get quizzes for a course
router.get("/course/:courseId", async (req, res) => {
  try {
    const quizzes = await Quiz.find({ course: req.params.courseId }).select(
      "-attempts"
    );
    res.json({ success: true, quizzes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/quizzes/:id - Get quiz with questions (without answers)
router.get("/:id", auth, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    // Check attempts
    const userAttempts = quiz.attempts.filter(
      (a) => a.user.toString() === req.user._id.toString()
    );

    if (userAttempts.length >= quiz.maxAttempts) {
      return res.json({
        success: true,
        quiz: {
          ...quiz.toObject(),
          questions: quiz.questions.map((q) => ({
            question: q.question,
            options: q.options.map((o) => ({ text: o.text })),
          })),
        },
        attemptsLeft: 0,
        previousAttempts: userAttempts.map((a) => ({
          score: a.score,
          completedAt: a.completedAt,
        })),
      });
    }

    // Don't send correct answers to the client
    const sanitizedQuiz = {
      ...quiz.toObject(),
      questions: quiz.questions.map((q) => ({
        question: q.question,
        options: q.options.map((o) => ({ text: o.text })),
      })),
    };

    res.json({
      success: true,
      quiz: sanitizedQuiz,
      attemptsLeft: quiz.maxAttempts - userAttempts.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/quizzes - Create quiz (instructor only)
router.post(
  "/",
  auth,
  authorize("instructor", "admin"),
  [
    body("title").trim().notEmpty().withMessage("Title is required"),
    body("course").notEmpty().withMessage("Course ID is required"),
    body("questions").isArray({ min: 1 }).withMessage("At least one question"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const course = await Course.findById(req.body.course);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      if (
        course.instructor.toString() !== req.user._id.toString() &&
        req.user.role !== "admin"
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const quiz = await Quiz.create(req.body);
      res.status(201).json({ success: true, quiz });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// PUT /api/quizzes/:id - Update quiz
router.put(
  "/:id",
  auth,
  authorize("instructor", "admin"),
  async (req, res) => {
    try {
      let quiz = await Quiz.findById(req.params.id);
      if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
      }

      const course = await Course.findById(quiz.course);
      if (
        course.instructor.toString() !== req.user._id.toString() &&
        req.user.role !== "admin"
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      quiz = await Quiz.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });

      res.json({ success: true, quiz });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// POST /api/quizzes/:id/submit - Submit quiz answers
router.post("/:id/submit", auth, async (req, res) => {
  try {
    const { answers } = req.body; // [{ questionIndex, selectedOption }]
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    // Check attempts
    const userAttempts = quiz.attempts.filter(
      (a) => a.user.toString() === req.user._id.toString()
    );

    if (userAttempts.length >= quiz.maxAttempts) {
      return res.status(400).json({ message: "Maximum attempts reached" });
    }

    // Grade the quiz
    let correct = 0;
    const gradedAnswers = answers.map((answer) => {
      const question = quiz.questions[answer.questionIndex];
      const isCorrect =
        question.options[answer.selectedOption]?.isCorrect || false;
      if (isCorrect) correct++;
      return {
        questionIndex: answer.questionIndex,
        selectedOption: answer.selectedOption,
        isCorrect,
      };
    });

    const score = Math.round((correct / quiz.questions.length) * 100);

    // Save attempt
    quiz.attempts.push({
      user: req.user._id,
      score,
      answers: gradedAnswers,
    });
    await quiz.save();

    res.json({
      success: true,
      result: {
        score,
        passed: score >= quiz.passingScore,
        correct,
        total: quiz.questions.length,
        answers: gradedAnswers,
        passingScore: quiz.passingScore,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/quizzes/:id
router.delete(
  "/:id",
  auth,
  authorize("instructor", "admin"),
  async (req, res) => {
    try {
      const quiz = await Quiz.findById(req.params.id);
      if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
      }

      const course = await Course.findById(quiz.course);
      if (
        course.instructor.toString() !== req.user._id.toString() &&
        req.user.role !== "admin"
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      await quiz.deleteOne();
      res.json({ success: true, message: "Quiz deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;
